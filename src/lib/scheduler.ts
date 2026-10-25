import { assignShiftRoles } from "./shiftRoles";
// An Sushibar: bộ lập lịch riêng cho nhà hàng, không dùng quy tắc tiệm nail.

import type { Employee, Shift } from "../types";
import type { OverrideMap, WorkHoursConfig } from "./workHours";
import type { StaffingRule } from "./staffing";
import type { WeekdayKey } from "./demand";
import { isoAddDays, consecutiveRunLengthWith } from "./consecutive";
import { datesOfMonth, parseIsoDate } from "./demand";
import { weekStartOf } from "./weeks";
import { publicHolidays } from "./holidays";
import { resolveDay } from "./workHours";
import { mayWorkOn } from "./availability";
import { employeeForMonth } from "./history";
import { generateWeeklySchedule, completeContractHours } from "./restaurantScheduler";

export type GenerateInput = {
  adjacentShifts?: readonly Shift[];
  year: number;
  month: number; // 1-basiert
  /** Arbeitszeit-Fenster je Wochentag + Feiertag. */
  workHours: WorkHoursConfig;
  /** Ausnahmen für einzelne Daten (geschlossen / abweichende Zeiten). */
  overrides?: OverrideMap;
  employees: Employee[];
  /** Feiertage als ISO-Set; Standard: Feiertage in Sachsen-Anhalt des Jahres. */
  holidays?: Set<string>;
  /** Nicht verwendet (der Wochenplaner ist deterministisch); bleibt für die Signatur. */
  seed?: string;
  /** Besetzungsregeln dieser Filiale. */
  rules?: readonly StaffingRule[];
  /** Tagesgewichte dieser Filiale. */
  weights?: Record<WeekdayKey, number>;
  /** Tage, an denen jemand schon im anderen Laden arbeitet. */
  blockedDays?: Record<string, readonly string[]>;
  /** Kennung der Filiale (interner Cache). */
  storeTag?: string;
};

function enforceRest(shifts: Shift[]): Shift[] {
 const worked = new Map<string, Set<string>>();
 return [...shifts].sort((a,b) => a.date.localeCompare(b.date)).filter(shift => {
 const days = worked.get(shift.employeeId) ?? new Set<string>();
 if (consecutiveRunLengthWith(days, shift.date) > 6) return false;
 days.add(shift.date); worked.set(shift.employeeId, days); return true;
 });
}
export function boundaryRestDays(input: GenerateInput): Record<string, readonly string[]> {
  const dates = datesOfMonth(input.year, input.month);
  const blocked = { ...input.blockedDays };
  for (const employee of input.employees) {
    const worked = new Set((input.adjacentShifts ?? []).filter(s => s.employeeId === employee.id && !dates.includes(s.date)).map(s => s.date));
    const rest = new Set(blocked[employee.id] ?? []);
    for (const [edge, direction] of [[dates[0], -1], [dates[dates.length - 1], 1]] as const) {
      let count = 0;
      let cursor = isoAddDays(edge, direction);
      while (worked.has(cursor)) { count++; cursor = isoAddDays(cursor, direction); }
      if (count) rest.add(isoAddDays(edge, -direction * Math.max(0, 6 - count)));
    }
    blocked[employee.id] = [...rest];
  }
  return blocked;
}
export function generateSchedule(input: GenerateInput): Shift[] {
  input = { ...input, blockedDays: boundaryRestDays(input) };
  const pair = input.employees.filter(e => ["ansushibar-5", "ansushibar-6"].includes(e.id)).sort((a,b) => a.id.localeCompare(b.id));
  if (pair.length !== 2) return assignShiftRoles(completeContractHours(input, enforceRest(generateWeeklySchedule(input))), input.employees);
  const blockedDays = { ...input.blockedDays };
  for (const [index, employee] of pair.entries()) {
    const blocked = new Set(blockedDays[employee.id] ?? []);
    for (const date of datesOfMonth(input.year, input.month)) {
      // Global Monday index keeps the same weekend assignment across months.
      const monday = parseIsoDate(weekStartOf(date));
      const week = Math.round((Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) - Date.UTC(2026, 0, 5)) / (7 * 86400000));
      if (((week % 2) + 2) % 2 !== index) blocked.add(date);
    }
    // Holiday closures can leave too few eligible weekend days for the current contract.
    // Borrow another weekend day only when the alternating weekends cannot hold the hours.
    const holidays = input.holidays ?? publicHolidays(input.year);
    const eligible = datesOfMonth(input.year,input.month).filter(date => mayWorkOn(employee,date) && !resolveDay(input.workHours,date,holidays,input.overrides ?? {}).closed);
    const target = employeeForMonth(employee,`${input.year}-${String(input.month).padStart(2,"0")}`).targetMinutes;
    let capacity = eligible.filter(date=>!blocked.has(date)).length * 480;
    for(const date of eligible) {
      if(capacity>=target) break;
      if(blocked.has(date) && !input.blockedDays?.[employee.id]?.includes(date)) { blocked.delete(date); capacity+=480; }
    }
    blockedDays[employee.id] = [...blocked];
  }
  const configured = { ...input, blockedDays };
  return assignShiftRoles(completeContractHours(configured, enforceRest(generateWeeklySchedule(configured))), input.employees);
}
