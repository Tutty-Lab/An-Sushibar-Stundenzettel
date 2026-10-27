import { useMemo, useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { Employee, EmploymentType } from "../types";
import { splitTargetHours } from "../lib/splitTargetHours";
import { WEEKDAY_SHORT_VI, type WeekdayKey } from "../lib/demand";
import { monthlyTargetMinutesFor } from "../lib/contract";
import { employmentShortVi } from "../lib/employment";
import { minutesToShortHours } from "../lib/time";
import type { WorkHoursConfig } from "../lib/workHours";
import { currentPartners, linkPatches, type PartnerChoice, type StoreRoster } from "../lib/sharedPerson";

// text-base (16px) auf dem Handy: iOS zoomt sonst beim Tippen hinein.
const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

/** Voreinstellung der festen Schicht, wenn eingeschaltet: 6:30–14:30. */
/**
 * Erweiterte Einstellungen (Ngày nghỉ, Luật riêng, Luật cứng, …) im Formular
 * bearbeitbar? In der Kunden-Demo aus: sichtbar, aber ausgegraut mit Hinweis.
 * Später einfach auf true setzen.
 */
const ADVANCED_EDITABLE = true;


const WEEKDAY_ORDER: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** Số ngày làm (= số ca) cho một mục tiêu, hoặc thông báo lỗi. */
function splitInfo(targetHours: number, type: EmploymentType): { ok: boolean; text: string } {
  if (targetHours <= 0) return { ok: true, text: "—" };
  try {
    const parts = splitTargetHours(Math.round(targetHours), type);
    return { ok: true, text: `${parts.length} ca` };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "không hợp lệ" };
  }
}

/**
 * Entwurf, während im Blatt getippt wird. Zahlen sind STRINGS, damit man ein
 * Feld leeren kann, ohne dass es auf 0 zurückspringt. Aufbau wie in der
 * Thienlong-App: Thông tin · Giờ làm · Ngày nghỉ cố định · Luật riêng.
 */
export type Draft = {
  workRole: NonNullable<Employee["workRole"]>;
  /** Urlaub (nghỉ phép): an diesen Tagen kein Dienst. */
  vacations: NonNullable<Employee["vacations"]>;
  name: string;
  employmentType: EmploymentType;
  /** Wird der Vertrag je Woche oder je Monat geführt? */
  unit: "week" | "month";
  /** Stunden zur gewählten Einheit, als Text – „40,2" mit Komma ist erlaubt. */
  hours: string;
  /** „Số ngày làm / tuần": "" = tự động, sonst 1..6 (maxDaysPerWeek). */
  maxDays: string;
  /** „Ngày nghỉ cố định" – die Kehrseite von availableWeekdays. */
  daysOff: WeekdayKey[];
  startDate: string; // "yyyy-MM-dd" hoặc "" = từ đầu tháng
  endDate: string; // "yyyy-MM-dd" hoặc "" = vẫn đang làm
  /** Cùng một người ở tiệm khác: storeId -> employeeId ("" = không). */
  partners: PartnerChoice;
};

/** Ein anderer Laden, wie ihn das Feld „Cũng làm ở tiệm khác" braucht. */
type OtherStore = { storeId: string; shortName: string; employees: readonly Employee[]; locked: boolean };

const hoursText = (n: number) => String(n).replace(".", ",");
const parseHours = (text: string) => Number(text.trim().replace(",", "."));

export function draftFrom(emp?: Employee, partners: PartnerChoice = {}): Draft {
  const available = emp?.availableWeekdays;
  return {
    vacations: emp?.vacations?.map((v) => ({ ...v })) ?? [],
    name: emp?.name ?? "",
    workRole: emp?.workRole ?? "BOTH",
    employmentType: emp?.employmentType ?? "VOLLZEIT",
    unit: emp?.weeklyHours != null ? "week" : "month",
    hours: emp ? hoursText(emp.weeklyHours ?? Math.round((emp.targetMinutes / 60) * 100) / 100) : "169",
    maxDays: emp?.maxDaysPerWeek ? String(Math.min(6, emp.maxDaysPerWeek)) : "",
    daysOff: available && available.length > 0 ? WEEKDAY_ORDER.filter((day) => !available.includes(day)) : [],
    startDate: emp?.startDate ?? "",
    endDate: emp?.endDate ?? "",
    partners,
  };
}

/** Reject invalid edits explicitly rather than silently dropping input. */
export function draftErrors(d: Draft): string[] {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push("Nhập tên nhân viên.");
  const hours = parseHours(d.hours);
  if (!d.hours.trim() || !Number.isFinite(hours) || hours < 0) errors.push("Giờ hợp đồng phải là số từ 0 trở lên.");
  if (d.maxDays && (!Number.isInteger(Number(d.maxDays)) || Number(d.maxDays) < 1 || Number(d.maxDays) > 6)) errors.push("Số ngày làm mỗi tuần phải từ 1 đến 6.");
  if (d.daysOff.length === 7) errors.push("Không thể chọn nghỉ cả 7 ngày.");
  if (d.startDate && d.endDate && d.endDate < d.startDate) errors.push("Ngày nghỉ việc phải từ ngày vào làm trở đi.");
  if (d.vacations.some(v=>!v.start || !v.end || v.end < v.start)) errors.push("Điền đủ ngày nghỉ phép, ngày kết thúc không trước ngày bắt đầu.");
  return errors;
}

/** Entwurf -> Mitarbeiter-Felder (ohne id). */
export function draftToEmployee(d: Draft): Omit<Employee, "id"> {
  const errors = draftErrors(d);
  if (errors.length) throw new Error(errors.join(" "));
  const hours = Math.max(0, parseHours(d.hours) || 0);
  const tage = Number(d.maxDays);
  const available = WEEKDAY_ORDER.filter((day) => !d.daysOff.includes(day));
  return {
    vacations: d.vacations,
    workRole: d.workRole,
    name: d.name.trim() || "Nhân viên mới",
    employmentType: d.employmentType,
    // Monatsvertrag: die Stunden stehen direkt im Soll. Wochenvertrag: das
    // Monats-Soll wird je Monat daraus abgeleitet (contract.ts).
    targetMinutes: d.unit === "month" ? Math.round(hours * 60) : 0,
    weeklyHours: d.unit === "week" ? hours : undefined,
    availableWeekdays: d.daysOff.length === 0 || available.length === 0 ? undefined : available,
    maxDaysPerWeek: d.maxDays === "" || tage < 1 ? undefined : Math.min(6, Math.round(tage)),
    // Luật của tiệm khác (ca cố định, trực lễ, độ dài ca, khung ưu tiên) không dùng ở An:
    // lưu lại sẽ xoá giá trị cũ còn sót.
    fixedShift: undefined,
    requiredOnHolidays: undefined,
    shiftHours: undefined,
    spreadEvenly: undefined,
    preferredWindows: undefined,
    // Leeres Feld = von Monatsanfang an dabei (kein Eintrittsdatum).
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(d.startDate) ? d.startDate : undefined,
    // Leeres Feld = arbeitet weiter (kein Austritt).
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(d.endDate) ? d.endDate : undefined,
  };
}

export function EmployeesTab({ store, allStores }: { store: UseScheduleReturn; allStores: readonly UseScheduleReturn[] }) {
  const { schedule, openDays, openDates, addEmployee, updateEmployee, removeEmployee } = store;
  const locked = Boolean(schedule.lockedAt);

  const rosters: StoreRoster[] = allStores.map((s) => ({ storeId: s.storeId, employees: s.schedule.employees }));
  const others: OtherStore[] = allStores
    .filter((s) => s.storeId !== store.storeId)
    .map((s) => ({
      storeId: s.storeId,
      shortName: s.storeConfig.shortName,
      employees: s.schedule.employees,
      locked: Boolean(s.schedule.lockedAt),
    }));
  const partnerLabel = (emp: Employee) =>
    others.filter((o) => currentPartners(rosters, store.storeId, emp)[o.storeId]).map((o) => o.shortName);

  /** personKeys in allen betroffenen Läden setzen bzw. lösen. */
  const saveLinks = (self: { employeeId: string; name: string; personKey?: string }, choice: PartnerChoice) => {
    for (const patch of linkPatches(rosters, { storeId: store.storeId, ...self }, choice)) {
      allStores.find((s) => s.storeId === patch.storeId)?.updateEmployee(patch.employeeId, { personKey: patch.personKey });
    }
  };

  // null = zu; "new" = anlegen; sonst = die id, die bearbeitet wird.
  const [offen, setOffen] = useState<null | "new" | string>(null);
  const bearbeitet = useMemo(
    () =>
      typeof offen === "string" && offen !== "new"
        ? schedule.employees.find((e) => e.id === offen)
        : undefined,
    [offen, schedule.employees],
  );

  return (
    <section className="rounded-lg bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-slate-900">
          Nhân viên
          {schedule.employees.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-400">
              {schedule.employees.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => setOffen("new")}
          disabled={locked}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800 disabled:opacity-40"
        >
          + Thêm
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Hợp đồng nhập theo <b>tháng</b> (hoặc theo tuần nếu người đó ký theo tuần). Giờ được chia cho các
        tuần rồi cho từng ngày theo hệ số ngày đông. Tháng này tiệm mở <b>{openDays}</b> ngày, mỗi người tối
        đa 6 ngày liên tiếp và 8 giờ công mỗi ngày. Bấm vào một người để sửa.
      </p>

      {locked && (
        <div className="mb-3 rounded bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2">
          Lịch tháng này đã khoá vì đã in — mở khoá ở tab <b>Chấm công</b> để sửa nhân viên.
        </div>
      )}

      {schedule.employees.length === 0 ? (
        <div className="py-8 text-center text-slate-400">
          Chưa có nhân viên. Bấm <b>+ Thêm</b> để tạo.
        </div>
      ) : (
        <ul className="space-y-2">
          {schedule.employees.map((emp) => (
            <li key={emp.id}>
              <button
                // Chủ tiệm: không có hợp đồng để sửa – dòng chỉ để xem.
                onClick={() => !emp.isOwner && setOffen(emp.id)}
                disabled={emp.isOwner}
                className="w-full text-left rounded-lg border border-slate-200 p-3 flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:cursor-default disabled:hover:bg-white"
              >
                <EmployeeSummaryRow
                  emp={emp}
                  openDates={openDates}
                  workHours={schedule.workHours}
                  sharedWith={partnerLabel(emp)}
                />
                <span className="text-slate-300 text-lg leading-none">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}



      {!locked && (
        <button
          onClick={() => setOffen("new")}
          aria-label="Thêm nhân viên"
          className="sm:hidden fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-slate-900 text-white text-2xl shadow-lg active:bg-slate-700 flex items-center justify-center"
        >
          +
        </button>
      )}

      {offen !== null && !locked && (
        <EmployeeSheet
          key={bearbeitet?.id ?? "new"}
          employee={bearbeitet}
          others={others}
          partners={currentPartners(rosters, store.storeId, bearbeitet)}
          openDates={openDates}
          workHours={schedule.workHours}
          onClose={() => setOffen(null)}
          onSave={(felder, partners) => {
            if (bearbeitet) {
              updateEmployee(bearbeitet.id, felder);
              saveLinks({ employeeId: bearbeitet.id, name: felder.name, personKey: bearbeitet.personKey }, partners);
            } else {
              const id = addEmployee(felder);
              if (id) saveLinks({ employeeId: id, name: felder.name }, partners);
            }
            setOffen(null);
          }}
          onDelete={
            bearbeitet
              ? () => {
                  removeEmployee(bearbeitet.id);
                  setOffen(null);
                }
              : undefined
          }
        />
      )}
    </section>
  );
}

/** Kompakte Zeile in der Liste: Name, Art, Wochenstunden, Besonderheiten. */
function EmployeeSummaryRow({
  emp,
  openDates,
  workHours,
  sharedWith,
}: {
  emp: Employee;
  openDates: readonly string[];
  workHours: WorkHoursConfig;
  /** Kurznamen der anderen Läden, in denen dieselbe Person arbeitet. */
  sharedWith: string[];
}) {
  const monatMin = monthlyTargetMinutesFor(emp, openDates, workHours);
  // Giờ của tháng này theo bảng lương (history.ts) thay cho hợp đồng chung.
  const monatH = monatMin / 60;
  const info = splitInfo(monatH, emp.employmentType);

  // Inhaberin: immer im Laden, ohne Vertrag und ohne Stundenzettel (scheduler.ts).
  if (emp.isOwner) {
    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 truncate">{emp.name} · {emp.workRole === "KITCHEN" ? "Bếp" : emp.workRole === "SERVICE_SUSHI" ? "Bồi / Sushi" : "Cả hai"}</span>
          <span className="shrink-0 rounded bg-amber-50 text-amber-800 text-[11px] px-1.5 py-0.5">Chủ tiệm</span>
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          Có mặt suốt giờ mở cửa · hỗ trợ Bếp/Bồi, mỗi lúc một vị trí · không tính giờ hợp đồng
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-900 truncate">{emp.name} · {emp.workRole === "KITCHEN" ? "Bếp" : emp.workRole === "SERVICE_SUSHI" ? "Bồi / Sushi" : "Cả hai"}</span>
        <span className="shrink-0 rounded bg-slate-100 text-slate-600 text-[11px] px-1.5 py-0.5">
          {employmentShortVi(emp.employmentType)}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
        <span>
          {emp.weeklyHours != null
            ? `${emp.weeklyHours}h/tuần`
            : `${String(Math.round((emp.targetMinutes / 60) * 100) / 100).replace(".", ",")}h/tháng`}{" "}
          · {monatH > 0 ? `${minutesToShortHours(monatMin)} · ` : ""}
          <span className={info.ok ? "" : "text-rose-600"}>{info.text}</span>
        </span>
        {sharedWith.length > 0 ? (
          <span className="rounded bg-sky-50 text-sky-800 px-1.5 py-0.5">cũng làm ở {sharedWith.join(", ")}</span>
        ) : null}
        {emp.maxDaysPerWeek ? (
          <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5">{Math.min(6, emp.maxDaysPerWeek)} ngày/tuần</span>
        ) : null}
        {emp.availableWeekdays && emp.availableWeekdays.length > 0 && emp.availableWeekdays.length < 7 ? (
          <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5">
            nghỉ {WEEKDAY_ORDER.filter((x) => !emp.availableWeekdays!.includes(x)).map((x) => WEEKDAY_SHORT_VI[x]).join(", ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ---- Bausteine des Blatts (wie in der Thienlong-App) ----

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-1 rounded-lg bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-2.5 text-sm font-medium transition-colors ${
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <span className="text-xs font-medium text-slate-600">{children}</span>
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </div>
  );
}

/** Stundenfeld mit Ziffern-Tastatur und Einheit rechts; Komma erlaubt („40,2"). */
function HoursInput({
  value,
  onChange,
  placeholder,
  unit = "h",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        className={`${inputClass} w-full pr-12 tabular-nums`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{unit}</span>
    </div>
  );
}

function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      {children}
    </section>
  );
}


/** Sieben Tagesknöpfe T2…CN. */
function DayButtons({
  selected,
  onToggle,
  activeClass = "border-slate-900 bg-slate-900 text-white",
}: {
  selected: readonly WeekdayKey[];
  onToggle: (day: WeekdayKey) => void;
  activeClass?: string;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAY_ORDER.map((day) => {
        const on = selected.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(day)}
            className={`rounded-md border py-2.5 text-sm font-medium transition-colors ${
              on ? activeClass : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {WEEKDAY_SHORT_VI[day]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Ein Blatt zum Anlegen ODER Bearbeiten – auf dem Handy von unten, am Desktop
 * mittig. Aufbau und Regeln wie in der Thienlong-App.
 */
function EmployeeSheet({
  employee,
  others,
  partners,
  openDates,
  workHours,
  onClose,
  onSave,
  onDelete,
}: {
  employee?: Employee;
  others: readonly OtherStore[];
  partners: PartnerChoice;
  openDates: readonly string[];
  workHours: WorkHoursConfig;
  onClose: () => void;
  onSave: (felder: Omit<Employee, "id">, partners: PartnerChoice) => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<Draft>(() => draftFrom(employee, partners));
  const [loeschFrage, setLoeschFrage] = useState(false);
  const [showPeriod, setShowPeriod] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const toggle = (list: readonly WeekdayKey[], day: WeekdayKey) =>
    list.includes(day) ? list.filter((x) => x !== day) : [...list, day];

  // Mit den übrigen Feldern der Person (Lohnabrechnung je Monat bleibt erhalten).
  const preview = { ...employee, targetMinutes: Math.max(0, parseHours(d.hours) || 0)*60, weeklyHours: d.unit === "week" ? Math.max(0,parseHours(d.hours)||0) : undefined, payrollRecords: undefined, id: employee?.id ?? "preview" } as Employee;
  const monatMin = monthlyTargetMinutesFor(preview, openDates, workHours);
  const errors = draftErrors(d);
  const vacationBad = d.vacations.some(v=>!v.start || !v.end || v.end < v.start);
  const info = splitInfo(monatMin / 60, d.employmentType);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full sm:max-w-md max-h-[94dvh] flex-col rounded-t-2xl sm:rounded-lg bg-white shadow-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">{employee ? "Sửa nhân viên" : "Thêm nhân viên"}</h3>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="-mr-2 h-10 w-10 rounded-full text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-6">
          <SheetSection title="Thông tin">
            <label className="block">
              <FieldLabel>Tên</FieldLabel>
              <input
                autoFocus={!employee}
                autoCapitalize="words"
                autoComplete="off"
                className={`${inputClass} w-full`}
                value={d.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Tên nhân viên"
              />
            </label>
            <div>
              <FieldLabel>Bộ phận</FieldLabel>
              <Segmented<NonNullable<Employee["workRole"]>>
                value={d.workRole}
                onChange={(value) => set("workRole", value)}
                options={[
                  { value: "SERVICE_SUSHI", label: "Bồi / Sushi" },
                  { value: "KITCHEN", label: "Bếp" },
                  { value: "BOTH", label: "Cả hai" },
                ]}
              />
              <FieldLabel>Hình thức</FieldLabel>
              <Segmented<EmploymentType>
                value={d.employmentType}
                onChange={(v) => set("employmentType", v)}
                options={[
                  { value: "VOLLZEIT", label: "Toàn TG" },
                  { value: "TEILZEIT", label: "Bán TG" },
                  { value: "MINIJOB", label: "Minijob" },
                ]}
              />
            </div>
            <div>
              <FieldLabel hint={`tháng này ≈ ${minutesToShortHours(monatMin)} · ${info.text}`}>
                {d.unit === "week" ? "Giờ / tuần" : "Giờ / tháng"}
              </FieldLabel>
              <HoursInput
                value={d.hours}
                onChange={(v) => set("hours", v)}
                placeholder={d.unit === "week" ? "VD 39" : "VD 169"}
              />
              {!info.ok && <p className="mt-1 text-xs text-rose-600">{info.text}</p>}
            </div>
          </SheetSection>

          {/* Nâng cao: alles außer Tên, Hình thức, Bộ phận, Giờ. In der Demo gesperrt. */}
          <section className="rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-slate-700"
            >
              <span>
                Cài đặt nâng cao
                <span className="block text-xs font-normal text-slate-400">
                  Ngày vào/thôi làm, nghỉ phép, ngày nghỉ cố định, hợp đồng, độ dài ca …
                </span>
              </span>
              <span className="text-slate-400">{showAdvanced ? "▾" : "▸"}</span>
            </button>
            {showAdvanced && (
              <div className="space-y-6 border-t border-slate-100 px-3 py-4">
                {!ADVANCED_EDITABLE && (
                  <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                    Bản demo không cho sửa phần này. Liên hệ <b>Thanh Tùng</b> để mở.
                  </p>
                )}
                {/* fieldset disabled sperrt alle Eingaben darin auf einmal. */}
                <fieldset disabled={!ADVANCED_EDITABLE} className={`space-y-6 ${ADVANCED_EDITABLE ? "" : "opacity-50"}`}>
                  <SheetSection title="Ngày vào làm / nghỉ việc">
                    {!showPeriod ? (
                      <button
                        type="button"
                        onClick={() => setShowPeriod(true)}
                        className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-left text-sm text-slate-600"
                      >
                        + Ngày vào làm / nghỉ việc <span className="text-slate-400">(nếu không làm cả tháng)</span>
                      </button>
                    ) : (
                      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                        {(
                          [
                            ["startDate", "Ngày vào làm", undefined, d.endDate || undefined],
                            ["endDate", "Ngày nghỉ việc", d.startDate || undefined, undefined],
                          ] as const
                        ).map(([key, label, min, max]) => (
                          <label key={key} className="block min-w-0">
                            <FieldLabel
                              hint={
                                d[key] ? (
                                  <button type="button" onClick={() => set(key, "")} className="underline hover:text-slate-600">
                                    xoá
                                  </button>
                                ) : undefined
                              }
                            >
                              {label}
                            </FieldLabel>
                            <input
                              type="date"
                              aria-label={label}
                              className={`${inputClass} employment-date-input block w-full min-w-0 max-w-full`}
                              value={d[key]}
                              min={min}
                              max={max}
                              onChange={(e) => set(key, e.target.value)}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                    {showPeriod && (
                      <p className="text-xs text-slate-400">
                        Bỏ trống = làm từ đầu tháng / vẫn đang làm. Ngày ngoài khoảng này không xếp ca và không tính định mức.
                      </p>
                    )}
                  </SheetSection>

                  <SheetSection title="Nghỉ phép / nghỉ không lương">
                    <p className="text-xs text-slate-500">
                      Không xếp ca trong khoảng này (gồm cả ngày đầu và cuối), được phép kéo qua nhiều tháng (VD 21.10.–21.11.).
                      Ngày nghỉ sẽ không được xếp ca; giờ hợp đồng tháng giữ nguyên.
                    </p>
                    {d.vacations.map((v, i) => (
                      <div key={i} className="flex flex-wrap items-end gap-2">
                        <label className="text-xs text-slate-600">
                          Từ ngày
                          <input aria-label={`Urlaub ${i + 1} từ ngày`} type="date" className={`${inputClass} block w-40`} value={v.start}
                            onChange={(e) => set("vacations", d.vacations.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                        </label>
                        <label className="text-xs text-slate-600">
                          Đến ngày
                          <input aria-label={`Urlaub ${i + 1} đến ngày`} type="date" className={`${inputClass} block w-40`} value={v.end}
                            onChange={(e) => set("vacations", d.vacations.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                        </label>
                        <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
                          <input type="checkbox" checked={!!v.unpaid}
                            onChange={(e) => set("vacations", d.vacations.map((x, j) => (j === i ? { ...x, unpaid: e.target.checked || undefined } : x)))} />
                          Không lương
                        </label>
                        <button type="button" className="p-2 text-sm text-rose-600" onClick={() => set("vacations", d.vacations.filter((_, j) => j !== i))}>
                          Xoá
                        </button>
                      </div>
                    ))}
                    <button type="button" className="text-sm text-sky-700" onClick={() => set("vacations", [...d.vacations, { start: "", end: "" }])}>
                      + Thêm kỳ nghỉ
                    </button>
                    {vacationBad && <p className="text-xs text-rose-600">Chọn đủ ngày; ngày kết thúc phải từ ngày bắt đầu trở đi.</p>}
                  </SheetSection>

                  <SheetSection title="Ngày nghỉ cố định">
                    <DayButtons selected={d.daysOff} onToggle={(day) => setD((prev) => ({ ...prev, daysOff: toggle(prev.daysOff, day) }))} />
                    <p className="text-xs text-slate-400">
                      {d.daysOff.length === 0
                        ? "Không chọn = làm được mọi ngày tiệm mở. Ngày tiệm đóng cửa thì không cần chọn."
                        : d.daysOff.length === 7
                          ? "Không thể nghỉ cả 7 ngày — hãy chọn tối đa 6 ngày."
                          : `Không xếp ca vào ${WEEKDAY_ORDER.filter((x) => d.daysOff.includes(x)).map((x) => WEEKDAY_SHORT_VI[x]).join(", ")}.`}
                    </p>
                  </SheetSection>

                  <SheetSection title="Hợp đồng">
                    <div>
                      <FieldLabel>Hợp đồng theo</FieldLabel>
                      <Segmented<Draft["unit"]>
                        value={d.unit}
                        onChange={(v) => set("unit", v)}
                        options={[
                          { value: "month", label: "Tháng" },
                          { value: "week", label: "Tuần" },
                        ]}
                      />
                    </div>
                    <div>
                      <FieldLabel hint="bỏ trống = tự động">Số ngày làm / tuần</FieldLabel>
                      <div className="grid grid-cols-7 gap-1">
                        {["", "1", "2", "3", "4", "5", "6"].map((n) => (
                          <button
                            key={n || "auto"}
                            type="button"
                            aria-pressed={d.maxDays === n}
                            onClick={() => set("maxDays", n)}
                            className={`rounded-md border py-2.5 text-sm font-medium ${
                              d.maxDays === n ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            {n || "Tự"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </SheetSection>

                  {/* Cùng một người ở tiệm khác – tạo lịch không xếp hai tiệm cùng ngày. */}
                  {others.length > 0 && (
                    <SheetSection title="Cũng làm ở tiệm khác">
                      <p className="-mt-1 text-xs text-slate-400">
                        Chọn đúng người này trong danh sách tiệm kia. Khi tạo lịch, người này không bị xếp hai tiệm trong cùng
                        một ngày. Nên đặt „Số ngày làm / tuần" ở tiệm chính để tiệm kia còn ngày trống.
                      </p>
                      {others.map((o) => (
                        <label key={o.storeId} className="flex items-center gap-2 text-sm text-slate-700">
                          <span className="w-16 shrink-0 text-xs font-medium text-slate-600">{o.shortName}</span>
                          <select
                            className={`${inputClass} flex-1 min-w-0`}
                            value={d.partners[o.storeId] ?? ""}
                            disabled={o.locked}
                            onChange={(e) => set("partners", { ...d.partners, [o.storeId]: e.target.value })}
                          >
                            <option value="">— không —</option>
                            {o.employees.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.name}
                              </option>
                            ))}
                          </select>
                          {o.locked && <span className="text-xs text-amber-700">đang khoá</span>}
                        </label>
                      ))}
                    </SheetSection>
                  )}

                </fieldset>
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {errors.length > 0 && <ul role="alert" className="mb-2 text-xs text-rose-700 list-disc pl-4">{errors.map(error=><li key={error}>{error}</li>)}</ul>}
          {loeschFrage ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">Xoá nhân viên này?</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setLoeschFrage(false)}
                  className="rounded-lg px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100"
                >
                  Không
                </button>
                <button
                  onClick={onDelete}
                  className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-rose-700"
                >
                  Xoá
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {onDelete && (
                <button
                  onClick={() => setLoeschFrage(true)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  Xoá
                </button>
              )}
              <button
                onClick={onClose}
                className="ml-auto rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Huỷ
              </button>
              <button
                onClick={() => onSave(draftToEmployee(d), d.partners)}
                disabled={errors.length > 0}
                className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
              >
                Lưu
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
