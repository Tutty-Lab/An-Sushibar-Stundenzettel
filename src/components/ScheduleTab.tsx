import { effectiveShiftRole, roleLabel } from "../lib/shiftRoles";
import { coverageSummary, type CoverageGap } from "../lib/coverage";
import { isOnVacation } from "../lib/availability";
import { useMemo, useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { Shift } from "../types";
import {
  datesOfMonth,
  parseIsoDate,
  WEEKDAY_SHORT_VI,
  weekdayKeyOf,
} from "../lib/demand";
import { minutesToShortHours, minutesToTime } from "../lib/time";
import { signedHours } from "../lib/dateFormat";
import { isDayClosed, resolveDay } from "../lib/workHours";
import { publicHolidays } from "../lib/holidays";
import { ShiftCellEditor } from "./ShiftCellEditor";
import { ScheduleDayView } from "./ScheduleDayView";
import { StundenzettelTab } from "./StundenzettelTab";
import { weeksOfMonth } from "../lib/weeks";
import { employmentShortVi } from "../lib/employment";
import { monthlyTargetMinutesFor, SCHEDULE_SLOT_MINUTES } from "../lib/contract";
import { StaffingReport } from "./StaffingReport";
import type { PeakCoverage } from "../lib/analyze";


/** „17", „11½" (halbe Stunde), sonst „11:15" – so bleibt die Zelle schmal. */
function shortTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return String(h);
  if (m === 30) return `${h}½`;
  return minutesToTime(minutes);
}

function isWeekendKey(iso: string): boolean {
  const k = weekdayKeyOf(parseIsoDate(iso));
  return k === "saturday" || k === "sunday";
}

function cellClass(shift: Shift | undefined): string {
  if (!shift) return "shift-free";
  const base = shift.shiftType === "EARLY" ? "shift-early" : "shift-late";
  return `${base} ${!shift.generated ? "shift-custom" : ""}`;
}

export function ScheduleTab({
  store,
  mode,
}: {
  store: UseScheduleReturn;
  /** Tab „Chấm công" (Stundenzettel + PDF) oder Tab „Lịch" – Tháng/Tuần/Ngày gilt nur für den Lịch. */
  mode: "schedule" | "timesheet";
}) {
  // Drucken (Monat/Woche) und Entsperren liegen in der Ansicht „Chấm công"
  // (StundenzettelTab) – dort sitzt alles, was Papier erzeugt.
  // Nút „Tạo lịch làm việc" và popup nằm trên thanh tab (App.tsx).
  const { schedule, validation, isLocked, openDates } = store;
  const [selected, setSelected] = useState<{ employeeId: string; date: string } | null>(null);
  // Mặc định luôn là cả tháng (theo yêu cầu của tiệm).
  const [view, setView] = useState<"grid" | "day" | "week">("grid");
  const [weekIndex, setWeekIndex] = useState(0);

  const dates = useMemo(
    () => datesOfMonth(schedule.year, schedule.month),
    [schedule.year, schedule.month],
  );

  const weeks = useMemo(
    () => weeksOfMonth(schedule.year, schedule.month),
    [schedule.year, schedule.month],
  );

  /**
   * Tage, die im Raster gezeigt werden. In der Wochenansicht nur die der
   * gewählten Woche – gerechnet wird trotzdem immer mit dem ganzen Monat,
   * die Summen rechts bleiben also Monatssummen.
   */
  const gridDates = useMemo(() => {
    if (view !== "week") return dates;
    return weeks[Math.min(weekIndex, weeks.length - 1)]?.dates ?? dates;
  }, [view, weekIndex, weeks, dates]);

  // Tra nhanh: employeeId#date -> ALLE Dienste des Tages.
  //
  // Es kann zwei geben (mittags und abends). Vorher stand hier eine Map auf
  // EINEN Dienst, und der zweite verschwand lautlos aus der Anzeige – der Plan
  // sah dann anders aus, als er war.
  const shiftMap = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of schedule.shifts) {
      const key = `${s.employeeId}#${s.date}`;
      const liste = m.get(key);
      if (liste) liste.push(s);
      else m.set(key, [s]);
    }
    for (const liste of m.values()) liste.sort((a, b) => a.startMinutes - b.startMinutes);
    return m;
  }, [schedule.shifts]);

  const summaryByEmp = useMemo(
    () => new Map(validation.summaries.map((s) => [s.employee.id, s] as const)),
    [validation.summaries],
  );

  const overridesByDate = useMemo(
    () => new Map(schedule.dateOverrides.map((o) => [o.date, o] as const)),
    [schedule.dateOverrides],
  );

  // Geschlossene Tage (Sonntag + Feiertag-Overrides + Betriebsruhe) vorab.
  const closedByDate = useMemo(() => {
    const holidays = publicHolidays(schedule.year);
    const ovMap = Object.fromEntries(schedule.dateOverrides.map((o) => [o.date, o]));
    const set = new Set<string>();
    for (const d of dates) {
      if (isDayClosed(schedule.workHours, d, holidays, ovMap)) set.add(d);
    }
    return set;
  }, [dates, schedule.workHours, schedule.year, schedule.dateOverrides]);

  // Tổng theo ngày cho các dòng chân bảng.
  const dayStats = useMemo(() => {
    // „Số nhân viên" zählt PERSONEN, nicht Dienste: wer mittags und abends
    // arbeitet, ist trotzdem eine Person. Die Zahl der Dienste steht daneben,
    // sonst sieht ein Tag mit lauter geteilten Diensten doppelt besetzt aus.
    const stats = new Map<string, { people: Set<string>; shifts: number; total: number; early: number; late: number }>();
    for (const d of dates) stats.set(d, { people: new Set(), shifts: 0, total: 0, early: 0, late: 0 });
    for (const s of schedule.shifts) {
      const st = stats.get(s.date);
      if (!st) continue;
      st.people.add(s.employeeId);
      st.shifts += 1;
      st.total += s.paidMinutes;
      if (s.shiftType === "EARLY") st.early += 1;
      else st.late += 1; // LATE hoặc CUSTOM tính là ca tối
    }
    return stats;
  }, [dates, schedule.shifts]);

  // Chân bảng „ít nhất … người" je Besetzungsregel (wie Thienlong, ohne Bếp/Bồi):
  // dieselben Zahlen, die auch die Prüfung benutzt – Tag → Label → Spannen.
  const peaksByDay = useMemo(() => {
    const map = new Map<string, { targetHours: number; byLabel: Map<string, PeakCoverage[]> }>();
    for (const day of store.analysis.days) {
      const byLabel = new Map<string, PeakCoverage[]>();
      for (const peak of day.peaks) byLabel.set(peak.label, [...(byLabel.get(peak.label) ?? []), peak]);
      map.set(day.date, { targetHours: day.targetHours, byLabel });
    }
    return map;
  }, [store.analysis]);


  // Debug: ai mở cửa / đóng cửa, và số người ÍT NHẤT có mặt trong từng khung
  // (trừ giờ nghỉ) – để chủ đánh giá lịch nhanh theo từng ngày.
  const debugStats = useMemo(() => {
    const holidays = publicHolidays(schedule.year);
    const ovMap = Object.fromEntries(schedule.dateOverrides.map((o) => [o.date, o]));
    const nameOf = new Map(schedule.employees.map((e) => [e.id, e.name.trim().split(/\s+/).pop() ?? e.name]));
    const result = new Map<string, { open: string; close: string; windows: Map<string, ReturnType<typeof coverageSummary>> }>();
    for (const d of dates) {
      const day = resolveDay(schedule.workHours, d, holidays, ovMap);
      const dayShifts = schedule.shifts.filter((s) => s.date === d);
      const windows = new Map<string, ReturnType<typeof coverageSummary>>();
      if (day.closed) {
        result.set(d, { open: "–", close: "–", windows });
        continue;
      }
      const from = day.window.startMinutes;
      const to = day.window.endMinutes;
      const openers = dayShifts.filter((s) => s.startMinutes <= from).map((s) => nameOf.get(s.employeeId));
      const closers = dayShifts.filter((s) => s.endMinutes >= to).map((s) => nameOf.get(s.employeeId));
      for (const w of DEBUG_WINDOWS) {
        const eligible = dayShifts.filter(s => {
          const role = effectiveShiftRole(s, schedule.employees.find(e => e.id === s.employeeId));
          return !("group" in w) || role === w.group;
        });
        const required = "group" in w ? 1 : w.key === "peak" ? 3 : 2;
        windows.set(w.key, coverageSummary(eligible, Math.max(w.from, from), Math.min(w.to, to), required));
      }
      result.set(d, { open: openers.join(", ") || "✗", close: closers.join(", ") || "✗", windows });
    }
    return result;
  }, [dates, schedule]);

  const hasEmployees = store.activeEmployees.length > 0;

  return (
    <section>

      {/* Alles Sichtbare liegt im no-print-Block; beim Drucken bleibt nur der
          Druckbereich ganz unten übrig. */}
      <div className="no-print">
      {/*
        Eine Leiste (die Tabs Chấm công / Lịch sitzen in App.tsx): die
        Bedienung der Ansicht (Lịch: Tháng/Tuần/Ngày, bei Tuần die Wochenwahl)
        und „Xuất PDF". Sperr-Hinweis mit Mở khóa kommt ebenfalls von dort.
      */}
      {hasEmployees && (
        <StundenzettelTab
          stores={[store]}
          mode={mode}
          toolbarRight={
            <>
          {view === "week" && weeks.length > 0 && (
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}
                disabled={weekIndex === 0}
                aria-label="Tuần trước"
                className="px-2.5 py-1.5 text-slate-600 disabled:opacity-30"
              >
                ‹
              </button>
              <select
                aria-label="Tuần"
                value={Math.min(weekIndex, weeks.length - 1)}
                onChange={(e) => setWeekIndex(Number(e.target.value))}
                className="border-x border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
              >
                {weeks.map((w, idx) => (
                  <option key={w.weekStart} value={idx}>
                    {w.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))}
                disabled={weekIndex >= weeks.length - 1}
                aria-label="Tuần sau"
                className="px-2.5 py-1.5 text-slate-600 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          )}
            <select
              aria-label="Xem theo"
              value={view}
              onChange={(e) => setView(e.target.value as typeof view)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              <option value="grid">Tháng</option>
              <option value="week">Tuần</option>
              <option value="day">Ngày</option>
            </select>
            </>
          }
        />
      )}

      {mode === "schedule" && schedule.shifts.length > 0 && <StaffingReport analysis={store.analysis} />}

      {/* Lỗi kiểm tra */}
      {mode === "schedule" && !validation.valid && schedule.shifts.length > 0 && (
        <div className="mb-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">
          <div className="font-medium mb-1">Lỗi kiểm tra ({validation.errors.length}):</div>
          <ul className="list-disc pl-5 space-y-0.5 max-h-40 overflow-auto">
            {validation.errors.slice(0, 30).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Chú thích (bảng tháng và bảng tuần dùng chung lưới) */}
      {mode === "schedule" && (view === "grid" || view === "week") && (
        <div className="flex flex-wrap gap-3 mb-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-early" /> Ca sáng
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-late" /> Ca chiều
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-free" /> Nghỉ
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-custom bg-white" /> Đã sửa tay
          </span>
        </div>
      )}

      {!hasEmployees ? (
        <div className="rounded bg-white border border-slate-200 p-6 text-center text-slate-400">
          Vui lòng thêm nhân viên trước.
        </div>
      ) : mode === "timesheet" ? null : view === "day" ? (
        <ScheduleDayView store={store} onEdit={(employeeId, date) => setSelected({ employeeId, date })} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white -mx-3 sm:mx-0">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-slate-100 border-b border-r border-slate-200 px-1.5 py-1 text-left w-[80px] max-w-[80px]">
                  Nhân viên
                </th>
                {gridDates.map((d) => {
                  const day = parseIsoDate(d).getDate();
                  const wk = WEEKDAY_SHORT_VI[weekdayKeyOf(parseIsoDate(d))];
                  const ov = overridesByDate.get(d);
                  const closed = closedByDate.has(d);
                  const headerBg = closed
                    ? "bg-rose-100"
                    : ov
                      ? "bg-sky-100"
                      : isWeekendKey(d)
                        ? "bg-slate-200"
                        : "bg-slate-100";
                  return (
                    <th
                      key={d}
                      title={
                        closed
                          ? `Đóng cửa${ov?.note ? " · " + ov.note : ""}`
                          : ov
                            ? `Giờ riêng${ov.note ? " · " + ov.note : ""}`
                            : undefined
                      }
                      className={`border-b border-l border-slate-200 px-0.5 py-1 text-center min-w-[40px] ${headerBg}`}
                    >
                      <div className="font-semibold">{day}</div>
                      <div className="text-[10px] text-slate-500">{wk}</div>
                      {closed && <div className="text-[9px] text-rose-600 font-medium">Đóng</div>}
                      {!closed && ov && <div className="text-[9px] text-sky-700 font-medium">Riêng</div>}
                    </th>
                  );
                })}
                <th className="bg-slate-100 border-b border-l border-slate-200 px-2 py-2 text-right min-w-[64px]">
                  Đã xếp
                </th>
                <th className="bg-slate-100 border-b border-l border-slate-200 px-2 py-2 text-right min-w-[70px]">
                  Chênh lệch
                </th>
              </tr>
            </thead>
            <tbody>
              {store.activeEmployees.map((emp) => {
                const sum = summaryByEmp.get(emp.id);
                const sollMin = monthlyTargetMinutesFor(emp, openDates, schedule.workHours);
                const diff = sum?.diffMinutes ?? -sollMin;
                // Chủ tiệm: không có hợp đồng và không tính giờ lương (paidMinutes = 0,
                // owner.ts) – chỉ hiện số giờ có mặt.
                const ownerMinutes = emp.isOwner
                  ? schedule.shifts.filter((s) => s.employeeId === emp.id).reduce((t, s) => t + s.endMinutes - s.startMinutes, 0)
                  : 0;
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/50">
                    {/* Nur der Name (gekürzt); Art und Soll stehen im Tab Nhân viên – so passen mehr Tage auf den Schirm. */}
                    <td
                      className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-1.5 py-1 font-medium w-[80px] max-w-[80px] truncate"
                      title={emp.isOwner ? `${emp.name} · Chủ tiệm` : `${emp.name} · ${employmentShortVi(emp.employmentType)} · ${minutesToShortHours(sollMin)}`}
                    >
                      {emp.name}
                    </td>
                    {gridDates.map((d) => {
                      const dienste = shiftMap.get(`${emp.id}#${d}`) ?? [];
                      const shift = dienste[0];
                      return (
                        <td
                          key={d}
                          onClick={() => setSelected({ employeeId: emp.id, date: d })}
                          className={`border-b border-l border-slate-200 px-0.5 py-1 text-center cursor-pointer align-middle ${cellClass(
                            shift,
                          )}`}
                          title="Bấm để sửa"
                        >
                          {shift ? (
                            // Kurz: „11:30–15" / „17–22" je Dienst untereinander.
                            <div className="leading-tight whitespace-nowrap text-[10px] font-medium">
                              {dienste.map((x) => (
                                <div key={x.id}>
                                  {shortTime(x.startMinutes)}–{shortTime(x.endMinutes)}
                                  {x.assignedRole && <div className="font-normal text-slate-600">{roleLabel(x.assignedRole)}</div>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300">{isOnVacation(emp, d) ? "Urlaub" : "–"}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-l border-slate-200 px-2 py-1 text-right font-medium">
                      {minutesToShortHours(emp.isOwner ? ownerMinutes : sum?.assignedMinutes ?? 0)}
                    </td>
                    <td
                      className={`border-b border-l border-slate-200 px-2 py-1 text-right font-medium ${
                        emp.isOwner
                          ? "text-slate-400"
                          : Math.abs(diff) <= SCHEDULE_SLOT_MINUTES / 2 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {emp.isOwner ? "—" : Math.abs(diff) <= SCHEDULE_SLOT_MINUTES / 2 ? "≈0,0" : signedHours(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <SummaryRow label="Số nhân viên" dates={gridDates} value={(d) => String(dayStats.get(d)!.people.size)} />
              <SummaryRow label="Số ca" dates={gridDates} value={(d) => String(dayStats.get(d)!.shifts)} />
              <SummaryRow
                label="Tổng giờ"
                dates={gridDates}
                value={(d) => minutesToShortHours(dayStats.get(d)!.total)}
              />
              <SummaryRow
                label="Giờ mục tiêu"
                hint="theo hệ số ngày"
                dates={gridDates}
                value={(d) => {
                  const day = peaksByDay.get(d);
                  return day && day.targetHours > 0 ? minutesToShortHours(Math.round(day.targetHours * 2) * 30) : "–";
                }}
              />
              <SummaryRow label="Ca sáng" dates={gridDates} value={(d) => String(dayStats.get(d)!.early)} />
              <SummaryRow label="Ca chiều" dates={gridDates} value={(d) => String(dayStats.get(d)!.late)} />
              {(
                <>
                  <SummaryRow label="Mở 10:30" dates={gridDates} value={(d) => debugStats.get(d)?.open ?? "–"} />
                  <SummaryRow label="Đóng 21:00" dates={gridDates} value={(d) => debugStats.get(d)?.close ?? "–"} />
                  {DEBUG_WINDOWS.map((w) => (
                    <MinPeopleRow
                      key={w.key}
                      label={w.label}
                      title={`Số người ít nhất có mặt ${w.label} (đã trừ giờ nghỉ)`}
                      dates={gridDates}
                      gaps={(d) => debugStats.get(d)?.windows.get(w.key)?.gaps ?? []}
                      value={(d) => debugStats.get(d)?.windows.get(w.key)?.minimum ?? null}
                    />
                  ))}
                </>
              )}
            </tfoot>
          </table>
        </div>
      )}

      {/* Bearbeiten ist bei gesperrtem Monat gar nicht erst möglich. */}
      {selected && !isLocked && (
        <ShiftCellEditor
          store={store}
          employeeId={selected.employeeId}
          date={selected.date}
          onClose={() => setSelected(null)}
        />
      )}
      </div>
    </section>
  );
}

/** Các khung kiểm tra của nhà hàng, gồm cao điểm mỗi ngày. */
const DEBUG_WINDOWS = [
  { key: "all", label: "Ít nhất cả ngày", from: 630, to: 1260 },
  { key: "am", label: "Ít nhất 10:30–12", from: 630, to: 720 },
  { key: "noon", label: "Ít nhất 12–14", from: 720, to: 840 },
  { key: "pm", label: "Ít nhất 14–17:30", from: 840, to: 1050 },
  { key: "peak", label: "Ít nhất 17:30–19:30", from: 1050, to: 1170 },
  { key: "eve", label: "Ít nhất 19:30–21", from: 1170, to: 1260 },
  { key: "kitchen", label: "Bếp ít nhất cả ngày", from: 630, to: 1260, group: "KITCHEN" },
  { key: "service", label: "Bồi ít nhất cả ngày", from: 630, to: 1260, group: "SERVICE_SUSHI" },
  { key: "kitchen-peak", label: "Bếp 17:30–19:30", from: 1050, to: 1170, group: "KITCHEN" },
  { key: "service-peak", label: "Bồi 17:30–19:30", from: 1050, to: 1170, group: "SERVICE_SUSHI" },
] as const;

/** Số người ít nhất: 0 = đỏ (tiệm trống), 1 = vàng. */
function MinPeopleRow({ label, title, dates, value, gaps }: {
  label: string;
  title: string;
  dates: string[];
  value: (d: string) => number | null;
  gaps: (d: string) => CoverageGap[];
}) {
  return (
    <tr className="bg-slate-50 text-slate-600">
      <td title={title}
        className="sticky left-0 z-10 bg-slate-50 border-t border-r border-slate-200 px-1.5 py-1 font-medium w-[80px] max-w-[80px] text-[10px] leading-tight">
        {label}
      </td>
      {dates.map((d) => {
        const n = value(d);
        const missing = gaps(d);
        const tone = n == null ? "text-slate-300" : missing.length ? n === 0 ? "bg-rose-50 text-rose-700 font-semibold" : "bg-amber-50 text-amber-800" : "";
        return <td key={d} className={`border-t border-l border-slate-200 px-1 py-1 text-center ${tone}`}>
          <div>{n ?? "–"}</div>
          {missing.length > 0 && <div className="text-[10px] font-medium">{d.slice(8)}/{d.slice(5,7)}</div>}
          {missing.map(gap => <div key={gap.startMinutes} className="mt-0.5 text-[10px] leading-tight text-rose-700 whitespace-nowrap">
            {minutesToTime(gap.startMinutes)}–{minutesToTime(gap.endMinutes)}<br />còn {gap.count} người
          </div>)}
        </td>;
      })}
      <td className="border-t border-l border-slate-200" />
      <td className="border-t border-l border-slate-200" />
    </tr>
  );
}

function SummaryRow({
  label,
  hint,
  dates,
  value,
}: {
  label: string;
  hint?: string;
  dates: string[];
  value: (d: string) => string;
}) {
  return (
    <tr className="bg-slate-50 text-slate-600">
      <td className="sticky left-0 z-10 bg-slate-50 border-t border-r border-slate-200 px-1.5 py-1 font-medium w-[80px] max-w-[80px] text-[10px] leading-tight">
        {label}
        {hint && <span className="ml-1 text-[11px] font-normal text-slate-400">{hint}</span>}
      </td>
      {dates.map((d) => (
        <td key={d} className="border-t border-l border-slate-200 px-1 py-1 text-center">
          {value(d)}
        </td>
      ))}
      <td className="border-t border-l border-slate-200" />
      <td className="border-t border-l border-slate-200" />
    </tr>
  );
}
