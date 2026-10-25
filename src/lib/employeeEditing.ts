import type { Employee } from "../types";
import { recordHours } from "./payRecord";

/** A changed contract must not be shadowed by the open month's frozen quota. */
export function applyEmployeeEdit(employee: Employee, patch: Partial<Employee>, month: string): Employee {
  const next = { ...employee, ...patch };
  const contractChanged = (["targetMinutes", "weeklyHours"] as const).some(key =>
    Object.prototype.hasOwnProperty.call(patch,key) && patch[key] !== employee[key]);
  const frozen = employee.payrollRecords?.find(record => record.month === month);
  const explicitMonthlyHours = Object.prototype.hasOwnProperty.call(patch, "targetMinutes") && next.weeklyHours == null;
  const staleMonthlyHours = explicitMonthlyHours && frozen != null && Math.round(recordHours(frozen) * 60) !== next.targetMinutes;
  if(contractChanged || staleMonthlyHours) next.payrollRecords = next.payrollRecords?.filter(record=>record.month !== month);
  return next;
}
