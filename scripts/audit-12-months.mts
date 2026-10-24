// Đánh giá lịch 12 tháng: npx vite-node scripts/audit-12-months.mts
import { generateSchedule } from "../src/lib/scheduler";
import { analyzeSchedule } from "../src/lib/analyze";
import { validateSchedule } from "../src/lib/validation";
import { initialScheduleFor, STORES } from "../src/lib/stores";
import { datesOfMonth } from "../src/lib/demand";
import { publicHolidays } from "../src/lib/holidays";
import { resolveDay } from "../src/lib/workHours";
import { staffingRuleId } from "../src/lib/rules";
import { freezeMonth, monthKey } from "../src/lib/history";
import type { Employee } from "../src/types";

const store = STORES[0];
const scenario = process.argv[2] ?? "base";
let employees: Employee[] = initialScheduleFor(store).employees;
if (scenario === "leave") {
  employees = employees.map((e) => (e.id === "nailedit-1" ? { ...e, vacations: [{ start: "2026-10-21", end: "2026-11-21" }] } : e));
}
const rows: string[] = [];
for (let i = 0; i < 12; i++) {
  const year = 2026 + Math.floor((9 + i) / 12);
  const month = ((9 + i) % 12) + 1;
  const holidays = publicHolidays(year);
  const open = datesOfMonth(year, month).filter((d) => !resolveDay(store.workHours, d, holidays, {}).closed);
  employees = freezeMonth(employees, monthKey(year, month), open, store.workHours);
  const shifts = generateSchedule({ year, month, workHours: store.workHours, overrides: {}, employees, rules: store.staffingRules, weights: store.dayWeights, storeTag: store.id, seed: `${year}-${month}` });
  const active = employees.filter((e) => !e.isOwner && open.some((d) => (!e.startDate || d >= e.startDate) && (!e.endDate || d <= e.endDate)));
  const v = validateSchedule(active, shifts, year, open, store.workHours);
  const a = analyzeSchedule({ year, month, workHours: store.workHours, employees, shifts, rules: store.staffingRules, weights: store.dayWeights });
  let noOpen = 0, noClose = 0;
  for (const d of open) {
    const w = resolveDay(store.workHours, d, holidays, {}).window;
    const ds = shifts.filter((s) => s.date === d);
    if (!ds.some((s) => s.startMinutes <= w.startMinutes)) noOpen++;
    if (!ds.some((s) => s.endMinutes >= w.endMinutes)) noClose++;
  }
  const hardGaps = a.peakViolations.reduce((n, d) => n + d.peaks.filter((p) => !p.ok && staffingRuleId(p.label) === "closing").length, 0);
  const peakMiss = a.peakViolations.reduce((n, d) => n + d.peaks.filter((p) => !p.ok && staffingRuleId(p.label) === "peak-staff").length, 0);
  const peakTotal = a.days.reduce((n, d) => n + d.peaks.filter((p) => staffingRuleId(p.label) === "peak-staff").length, 0);
  const target = v.summaries.reduce((n, s) => n + s.targetMinutes, 0) / 60;
  const planned = v.summaries.reduce((n, s) => n + s.assignedMinutes, 0) / 60;
  const worst = v.summaries.reduce((m, s) => Math.max(m, Math.abs(s.diffMinutes)), 0) / 60;
  const errors = v.errors.filter((e) => e.severity !== "warning").length;
  const people = v.summaries.map((s) => `${s.employee.name.split(" ").pop()} ${(s.assignedMinutes / 60).toFixed(1)}/${(s.targetMinutes / 60).toFixed(1)}`).join(", ");
  rows.push(`${monthKey(year, month)} | ${open.length} ngày | ${active.length} NV | mục tiêu ${target.toFixed(1)}h | xếp ${planned.toFixed(1)}h | lệch max ${worst.toFixed(1)}h | thiếu mở ${noOpen} | thiếu đóng ${noClose} | trống ${hardGaps} | cao điểm thiếu ${peakMiss}/${peakTotal} | lỗi ${errors}\n    ${people}`);
}
console.log(`Kịch bản: ${scenario}\n` + rows.join("\n"));
