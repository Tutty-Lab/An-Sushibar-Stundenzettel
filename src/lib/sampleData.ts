import type { Employee, Schedule } from "../types";
import { ANSUSHIBAR_WORK_HOURS } from "./workHours";
export function makeEmployee(id: string, name: string, employmentType: Employee["employmentType"], hours: number): Employee {
 return { id, name, employmentType, targetMinutes: Math.round(hours * 60) };
}
export function makeWeekly(id: string, name: string, employmentType: Employee["employmentType"], weeklyHours: number): Employee {
 return { ...makeEmployee(id, name, employmentType, 0), weeklyHours };
}
export function ansushibarEmployees(): Employee[] {
 return [
  { ...makeEmployee("ansushibar-1", "Duc Thuan Nguyen", "VOLLZEIT", 173), workRole: "SERVICE_SUSHI" },
  { ...makeEmployee("ansushibar-2", "Nguyen Duc Khai", "VOLLZEIT", 169), workRole: "KITCHEN" },
  { ...makeEmployee("ansushibar-3", "Luu Van Tam", "VOLLZEIT", 169), workRole: "KITCHEN" },
  { ...makeEmployee("ansushibar-4", "Vo Ngoc Duong", "TEILZEIT", 105), workRole: "SERVICE_SUSHI" },
  ...["Nguyen Vu Sa Lam", "Nguyen Thi Hong Linh"].map((name, i): Employee => ({
   ...makeEmployee(`ansushibar-${i + 5}`, name, "MINIJOB", 43),
   workRole: "BOTH",
   availableWeekdays: ["friday", "saturday", "sunday"],
  })),
 ];
}
export const SAMPLE_EMPLOYEES = ansushibarEmployees();
export function createSampleSchedule(): Schedule {
 return { companyName: "An Sushibar", address: "Kramerplatz 5, 06618 Naumburg", year: 2026, month: 10,
 workHours: structuredClone(ANSUSHIBAR_WORK_HOURS), dateOverrides: [], employees: ansushibarEmployees(), shifts: [] };
}
