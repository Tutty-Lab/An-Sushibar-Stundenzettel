import { useEffect, useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { Employee } from "../types";
import { monthlyTargetMinutesFor } from "../lib/contract";
import { hoursFromPay, recordHours } from "../lib/payRecord";
import { monthKey, upsertRecord } from "../lib/history";
import { isAvailableDay, isEmployedOn } from "../lib/availability";

const num = (text: string) => Number(text.trim().replace(",", "."));
const txt = (n: number | undefined) => (n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","));
const eur = (n?: number) => (n == null ? "—" : `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} €`);
const hrs = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;

type Row = { salary: string; wage: string; hours: string; manual: boolean };

const inputClass =
  "w-full rounded border border-slate-300 px-2 py-1.5 text-base sm:text-sm text-right focus:border-slate-500 focus:outline-none disabled:bg-slate-50";

/**
 * Lương & giờ mục tiêu của THÁNG đang chọn. Lưu = ghi bản ghi của riêng tháng
 * này (lịch sử); tháng trước/sau không đổi. „Tạo lịch" cũng tự chốt bản ghi.
 */
export function PayrollHistory({ store }: { store: UseScheduleReturn }) {
  const { schedule, openDates, updateEmployee } = store;
  const month = monthKey(schedule.year, schedule.month);
  const locked = Boolean(schedule.lockedAt);
  const staff = schedule.employees.filter((e) => !e.isOwner && openDates.some((d) => isEmployedOn(e, d)));

  const rowOf = (e: Employee): Row => {
    const r = e.payrollRecords?.find((x) => x.month === month);
    if (r) return { salary: txt(r.grossEuro), wage: txt(r.hourlyWage), hours: txt(recordHours(r)), manual: !!r.manualHours };
    // Giờ cả tháng giữ nguyên; ngày nghỉ chỉ giới hạn ngày được xếp ca.
    const minutes = monthlyTargetMinutesFor({ ...e, startDate: undefined, endDate: undefined, vacations: [] }, openDates, schedule.workHours);
    return {
      salary: txt(e.monthlySalary),
      wage: txt(e.hourlyWage),
      hours: txt(minutes / 60),
      manual: hoursFromPay(e.monthlySalary, e.hourlyWage) == null,
    };
  };
  const [rows, setRows] = useState<Record<string, Row>>({});
  const key = `${month}|${staff
    .map((e) => JSON.stringify([e.id, e.payrollRecords, e.monthlySalary, e.hourlyWage, e.targetMinutes, e.weeklyHours]))
    .join()}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setRows(Object.fromEntries(staff.map((e) => [e.id, rowOf(e)]))), [key]);

  const edit = (id: string, patch: Partial<Row>) =>
    setRows((cur) => {
      const next = { ...(cur[id] ?? { salary: "", wage: "", hours: "", manual: true }), ...patch };
      if ("hours" in patch) {
        next.manual = true;
      } else {
        // Lương tháng/giờ đổi -> giờ = lương tháng ÷ lương giờ.
        const h = hoursFromPay(num(next.salary), num(next.wage));
        if (h != null) {
          next.hours = txt(h);
          next.manual = false;
        }
      }
      return { ...cur, [id]: next };
    });

  const [savedAt, setSavedAt] = useState(0);
  function save() {
    for (const e of staff) {
      const r = rows[e.id];
      if (!r || !(num(r.hours) >= 0)) continue;
      updateEmployee(
        e.id,
        upsertRecord(e, {
          month,
          grossEuro: num(r.salary) > 0 ? num(r.salary) : undefined,
          hourlyWage: num(r.wage) > 0 ? num(r.wage) : undefined,
          convertedHours: Math.round(num(r.hours) * 100) / 100,
          manualHours: r.manual || hoursFromPay(num(r.salary), num(r.wage)) == null,
        }),
      );
    }
    setSavedAt(Date.now());
  }

  const history = schedule.employees
    .flatMap((employee) => (employee.payrollRecords ?? []).map((record) => ({ employee, record })))
    .sort((a, b) => b.record.month.localeCompare(a.record.month) || a.employee.id.localeCompare(b.employee.id));
  const total = staff.reduce((s, e) => s + (num(rows[e.id]?.hours ?? "0") || 0), 0);

  return (
    <>
      <section className="mt-5 rounded-lg border border-slate-200 p-3">
        <h3 className="text-sm font-semibold">
          Lương & giờ mục tiêu tháng {month.slice(5)}/{month.slice(0, 4)}
        </h3>
        <p className="my-2 text-xs text-slate-600">
          Giờ mục tiêu là giờ của <b>cả tháng</b>, được xếp đủ vào các ngày còn đi làm; ngày nghỉ và ngày vào/thôi làm không tự giảm giờ. Chỉ áp dụng cho tháng này. Có lương tháng và lương giờ thì giờ = lương tháng ÷ lương giờ; sửa thẳng ô giờ
          thì dùng đúng số đã nhập để xếp ca. Đây là giờ <b>xếp lịch</b>, không phải giờ thực tế đã làm.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500 text-xs">
                <th className="p-1.5">Nhân viên</th>
                <th className="p-1.5 text-right">Lương tháng €</th>
                <th className="p-1.5 text-right">Lương giờ €/h</th>
                <th className="p-1.5 text-right">Giờ mục tiêu</th>
                <th className="p-1.5 text-right" title="Giờ mục tiêu cần xếp trong các ngày còn đi làm">Sẽ xếp</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((e) => {
                const r = rows[e.id] ?? rowOf(e);
                const saved = e.payrollRecords?.some((x) => x.month === month);
                const da = openDates.filter((d) => isAvailableDay(e, d)).length;
                const share = openDates.length ? da / openDates.length : 1;
                const willPlan = Math.round(((num(r.hours) || 0) * share) * 2) / 2;
                return (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="p-1.5">
                      {e.name}
                      {!saved && <span className="ml-1 text-[11px] text-amber-700">chưa lưu</span>}
                    </td>
                    <td className="p-1.5 w-28">
                      <input disabled={locked} inputMode="decimal" className={inputClass} value={r.salary}
                        aria-label={`Lương tháng ${e.name}`} onChange={(ev) => edit(e.id, { salary: ev.target.value })} />
                    </td>
                    <td className="p-1.5 w-24">
                      <input disabled={locked} inputMode="decimal" className={inputClass} value={r.wage}
                        aria-label={`Lương giờ ${e.name}`} onChange={(ev) => edit(e.id, { wage: ev.target.value })} />
                    </td>
                    <td className="p-1.5 w-24">
                      <input disabled={locked} inputMode="decimal" className={inputClass} value={r.hours}
                        aria-label={`Giờ mục tiêu ${e.name}`} onChange={(ev) => edit(e.id, { hours: ev.target.value })} />
                    </td>
                    <td className={`p-1.5 text-right whitespace-nowrap ${share < 1 ? "text-amber-700" : "text-slate-500"}`}
                      title={share < 1 ? `Đi làm ${da}/${openDates.length} ngày mở cửa (nghỉ phép hoặc vào/thôi làm giữa tháng)` : undefined}>
                      {hrs(willPlan)}
                      {share < 1 && <span className="block text-[10px]">{da}/{openDates.length} ngày</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="p-1.5 text-xs text-slate-500" colSpan={3}>Tổng giờ mục tiêu</td>
                <td className="p-1.5 text-right font-medium">{hrs(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button disabled={locked} onClick={save}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">
            Lưu tháng {month.slice(5)}/{month.slice(0, 4)}
          </button>
          {savedAt > 0 && <span className="text-xs text-emerald-700">Đã lưu. Bấm Tạo lịch để xếp lại theo số mới.</span>}
        </div>
      </section>

      {history.length > 0 && (
        <details className="mt-3 rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Lịch sử lương & giờ theo tháng</summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500 text-xs">
                  <th className="p-2">Tháng</th>
                  <th className="p-2">Nhân viên</th>
                  <th className="p-2 text-right">Lương tháng</th>
                  <th className="p-2 text-right">Lương giờ</th>
                  <th className="p-2 text-right">Giờ mục tiêu</th>
                </tr>
              </thead>
              <tbody>
                {history.map(({ employee, record }) => (
                  <tr key={`${employee.id}/${record.month}`} className="border-b border-slate-100">
                    <td className="p-2 whitespace-nowrap">{record.month.slice(5)}/{record.month.slice(0, 4)}</td>
                    <td className="p-2">{employee.name}</td>
                    <td className="p-2 text-right whitespace-nowrap">{eur(record.grossEuro)}</td>
                    <td className="p-2 text-right whitespace-nowrap">{eur(record.hourlyWage)}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      {hrs(recordHours(record))}
                      {record.manualHours ? " ✎" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">✎ = giờ nhập tay thay cho lương tháng ÷ lương giờ.</p>
        </details>
      )}
    </>
  );
}
