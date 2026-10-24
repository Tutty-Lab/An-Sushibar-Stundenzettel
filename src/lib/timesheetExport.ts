import type { Employee, Schedule } from "../types";

/** Persist the document inputs, not locks, archives or export metadata. */
export function timesheetFingerprint(schedule: Schedule, employees: readonly Employee[]): string {
  return JSON.stringify([schedule.year, schedule.month, schedule.companyName, schedule.address,
    schedule.workHours, schedule.dateOverrides, employees, schedule.shifts]);
}

export function mustReprintWeeks(saved: { fingerprint: string } | undefined, fingerprint: string): boolean {
  return saved != null && saved.fingerprint !== fingerprint;
}
