// ============================================================================
// Einstieg in die Dienstplan-Erstellung. Geplant wird ausschließlich über
// Wochenverträge – die eigentliche Logik steht in weeklyScheduler.ts. Dieser
// Wrapper hält die Signatur für den Hook und die Tests stabil.
// ============================================================================

import type { Employee, Shift } from "../types";
import type { OverrideMap, WorkHoursConfig } from "./workHours";
import type { StaffingRule } from "./staffing";
import type { WeekdayKey } from "./demand";
import { consecutiveRunLengthWith } from "./consecutive";
import { datesOfMonth, parseIsoDate } from "./demand";
import { weekStartOf } from "./weeks";
import { publicHolidays } from "./holidays";
import { resolveDay } from "./workHours";
import { mayWorkOn } from "./availability";
import { employeeForMonth } from "./history";
import { generateWeeklySchedule, completeContractHours } from "./weeklyScheduler";

export type GenerateInput = {
  year: number;
  month: number; // 1-basiert
  /** Arbeitszeit-Fenster je Wochentag + Feiertag. */
  workHours: WorkHoursConfig;
  /** Ausnahmen für einzelne Daten (geschlossen / abweichende Zeiten). */
  overrides?: OverrideMap;
  employees: Employee[];
  /** Feiertage als ISO-Set; Standard: Feiertage in Bayern des Jahres. */
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
export function generateSchedule(input: GenerateInput): Shift[] {
  const pair = input.employees.filter(e => ["ansushibar-5", "ansushibar-6"].includes(e.id)).sort((a,b) => a.id.localeCompare(b.id));
  if (pair.length !== 2) return completeContractHours(input, enforceRest(generateWeeklySchedule(input)));
  const blockedDays = { ...input.blockedDays };
  for (const [index, employee] of pair.entries()) {
    const blocked = new Set(blockedDays[employee.id] ?? []);
    for (const date of datesOfMonth(input.year, input.month)) {
      // Global Monday index keeps the same weekend assignment across months.
      const monday = parseIsoDate(weekStartOf(date));
      const week = Math.round((Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) - Date.UTC(2026, 0, 5)) / (7 * 86400000));
      if (((week % 2) + 2) % 2 !== index) blocked.add(date);
    }
    // Holiday closures can leave fewer than six weekend days for a 43-hour contract.
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
  return completeContractHours(configured, enforceRest(generateWeeklySchedule(configured)));
}
