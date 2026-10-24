import type { UseScheduleReturn } from "../hooks/useSchedule";
import { monthlyTargetMinutesFor } from "../lib/contract";
import { minutesToShortHours } from "../lib/time";

/**
 * Tổng kết cuối tháng: số ngày làm, giờ được XẾP và giờ THỰC TẾ đã chấm công.
 * Giờ thực tế chỉ tính những ca đã ghi nhận (ô „Giờ thực tế" trong ca) –
 * giờ xếp lịch không bao giờ tự được coi là giờ đã làm.
 */
export function MonthSummary({ store }: { store: UseScheduleReturn }) {
  const { schedule, activeEmployees, openDates } = store;
  const rows = activeEmployees.map((e) => {
    const shifts = schedule.shifts.filter((s) => s.employeeId === e.id);
    const recorded = shifts.filter((s) => s.actualMinutes != null);
    return {
      e,
      days: new Set(shifts.map((s) => s.date)).size,
      target: e.isOwner ? 0 : monthlyTargetMinutesFor(e, openDates, schedule.workHours),
      planned: shifts.reduce((n, s) => n + s.paidMinutes, 0),
      actual: recorded.reduce((n, s) => n + (s.actualMinutes ?? 0), 0),
      recorded: recorded.length,
      total: shifts.length,
    };
  }).filter((r) => !r.e.isOwner || r.total > 0);
  if (rows.length === 0) return null;

  return (
    <section className="no-print mt-6 rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-semibold">
        Tổng kết tháng {String(schedule.month).padStart(2, "0")}/{schedule.year}
      </h3>
      <p className="my-1 text-xs text-slate-500">
        Giờ thực tế lấy từ ô „Giờ thực tế đã chấm công" của từng ca (bấm vào ô ca để nhập). Ca chưa ghi nhận không được tính.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-slate-500">
              <th className="p-2">Nhân viên</th>
              <th className="p-2 text-right">Ngày làm</th>
              <th className="p-2 text-right">Giờ mục tiêu</th>
              <th className="p-2 text-right">Giờ đã xếp</th>
              <th className="p-2 text-right">Giờ thực tế</th>
              <th className="p-2 text-right">Ca đã chấm</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.e.id} className="border-b border-slate-100">
                <td className="p-2">{r.e.name}</td>
                <td className="p-2 text-right">{r.days}</td>
                <td className="p-2 text-right">{r.e.isOwner ? "—" : minutesToShortHours(r.target)}</td>
                <td className="p-2 text-right">{minutesToShortHours(r.planned)}</td>
                <td className="p-2 text-right">{r.recorded > 0 ? minutesToShortHours(r.actual) : "chưa có"}</td>
                <td className={`p-2 text-right ${r.recorded < r.total ? "text-amber-700" : "text-emerald-700"}`}>
                  {r.recorded}/{r.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
