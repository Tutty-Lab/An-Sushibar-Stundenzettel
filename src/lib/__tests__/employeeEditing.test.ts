import { describe, expect, it } from "vitest";
import { applyEmployeeEdit } from "../employeeEditing";
import { draftFrom, draftToEmployee, draftErrors } from "../../components/EmployeesTab";
import { employeeForMonth } from "../history";
import type { Employee } from "../../types";
const employee: Employee = { id: "test", name: "Test", employmentType: "VOLLZEIT", targetMinutes: 10380, payrollRecords: [
  { month: "2026-09", convertedHours: 173, manualHours: true },
  { month: "2026-10", convertedHours: 173, manualHours: true },
] };
describe("Employee input persistence", () => {
  it("uses edited 20 monthly hours despite frozen quota, preserving older history", () => {
    const patch = draftToEmployee({ ...draftFrom(employee), hours: "20" });
    const saved = JSON.parse(JSON.stringify(applyEmployeeEdit(employee, patch, "2026-10")));
    expect(employeeForMonth(saved, "2026-10").targetMinutes).toBe(1200);
    expect(employeeForMonth(saved, "2026-09").targetMinutes).toBe(10380);
    expect(draftFrom(saved).hours).toBe("20");
  });
  it("clears a stale record even if base contract already matches", () => {
    const edited = applyEmployeeEdit({ ...employee, targetMinutes: 1200 }, { targetMinutes: 1200 }, "2026-10");
    expect(employeeForMonth(edited, "2026-10").targetMinutes).toBe(1200);
  });
  it("preserves frozen history for unrelated edits", () => {
    expect(applyEmployeeEdit(employee, { name: "New" }, "2026-10").payrollRecords).toEqual(employee.payrollRecords);
  });
  it("switches monthly contract to weekly", () => {
    const saved = applyEmployeeEdit(employee, draftToEmployee({ ...draftFrom(employee), unit: "week", hours: "20" }), "2026-10");
    expect(employeeForMonth(saved, "2026-10").weeklyHours).toBe(20);
  });
  it("roundtrips employee rules and decimal hours", () => {
    const fields = { ...employee, targetMinutes: 1218, workRole: "BOTH" as const, maxDaysPerWeek: 4,
      availableWeekdays: ["monday", "friday"] as const, startDate:"2026-01-01",endDate:"2026-12-31",
      vacations:[{start:"2026-11-01",end:"2026-11-03",unpaid:true}] };
    const draft = draftFrom({ ...fields, availableWeekdays: [...fields.availableWeekdays] });
    const { id, payrollRecords, ...expected } = fields;
    expect(draftToEmployee(draft)).toMatchObject(expected);
  });
  it("clears rules inherited from other stores on save", () => {
    const legacy = { ...employee, fixedShift: {startMinutes:630,endMinutes:900}, requiredOnHolidays: true,
      shiftHours: {min:3,max:8}, spreadEvenly: true, preferredWindows:[{days:["friday" as const],startMinutes:1050,endMinutes:1170}] };
    const saved = draftToEmployee(draftFrom(legacy));
    for (const key of ["fixedShift","requiredOnHolidays","shiftHours","spreadEvenly","preferredWindows"] as const) expect(saved[key]).toBeUndefined();
  });
  it("rejects incomplete inputs rather than dropping them", () => {
    for (const patch of [{hours:""},{hours:"abc"},{maxDays:"9"}]) {
      const draft = {...draftFrom(employee),...patch};
      expect(draftErrors(draft).length).toBeGreaterThan(0);
      expect(()=>draftToEmployee(draft)).toThrow();
    }
  });
});
