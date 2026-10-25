import { coverageSummary } from "../coverage";
import { describe, it, expect } from "vitest";
import { STORES, initialScheduleFor } from "../stores";
import { publicHolidayNames } from "../holidays";
import { validateSchedule } from "../validation";
import { datesOfMonth } from "../demand";
import { publicHolidays } from "../holidays";
import { resolveDay } from "../workHours";
import { generateSchedule } from "../scheduler";
describe("An Sushibar", () => {
 it("uses new store and six contracts", () => {
 const s = initialScheduleFor(STORES[0]);
 expect(STORES[0].id).toBe("ansushibar"); expect(s.address).toBe("Kramerplatz 5, 06618 Naumburg");
 expect(s.employees.map(e => e.targetMinutes / 60)).toEqual([173,169,169,105,20,20]);
 expect(s.workHours.closedWeekdays.sunday).toBe(false); expect(s.workHours.holidayClosed).toBe(false);
 expect(s.workHours.perWeekday.sunday).toEqual([{startMinutes:630,endMinutes:1260}]);
 });
 it("uses Sachsen-Anhalt holidays", () => {
 const h = publicHolidayNames(2026); expect(h.has("2026-01-06")).toBe(true); expect(h.has("2026-11-18")).toBe(false);
 });
 it("keeps minijobs on weekends, holidays open, contracts capped", () => {
 const store = STORES[0]; const employees = store.sampleEmployees();
 const shifts = generateSchedule({year:2026,month:10,workHours:store.workHours,employees,rules:store.staffingRules,weights:store.dayWeights});
 expect(shifts.length).toBeGreaterThan(0);
 expect(shifts.some(s=>s.date==="2026-10-03")).toBe(true);
 expect(shifts.some(s=>s.date==="2026-10-31")).toBe(true);
 for (const e of employees.filter(e=>e.employmentType === "MINIJOB")) expect(shifts.filter(s=>s.employeeId===e.id).reduce((n,s)=>n+s.paidMinutes,0)).toBe(20 * 60);
 const lam = new Set(shifts.filter(s=>s.employeeId==="ansushibar-5").map(s=>s.date));
 expect(shifts.filter(s=>s.employeeId==="ansushibar-6").every(s=>!lam.has(s.date))).toBe(true);
 for (const e of employees) expect(shifts.filter(s=>s.employeeId===e.id).reduce((sum,s)=>sum+s.paidMinutes,0)).toBeLessThanOrEqual(e.targetMinutes);
 for (const s of shifts) { expect(s.startMinutes).toBeGreaterThanOrEqual(630); expect(s.endMinutes).toBeLessThanOrEqual(1260); if (["ansushibar-5","ansushibar-6"].includes(s.employeeId)) expect([0,5,6]).toContain(new Date(s.date+"T12:00:00").getDay()); }
 });
});

describe("An Sushibar historical holiday-closed contract completion", () => {
 for(let month=1;month<=12;month++) it(`fills feasible monthly hours in 2026-${month}`,()=>{
  const store=STORES[0]; const employees=store.sampleEmployees();
  if(month===10) employees[0].targetMinutes+=18; // 656.3 h, including an unschedulable 18-minute remainder.
  const shifts=generateSchedule({year:2026,month,workHours:{...store.workHours,holidayClosed:true},employees,rules:store.staffingRules,weights:store.dayWeights});
  expect(shifts.reduce((n,s)=>n+s.paidMinutes,0)).toBe(656*60);
  for(const employee of employees) expect(shifts.filter(s=>s.employeeId===employee.id).reduce((n,s)=>n+s.paidMinutes,0)).toBe(Math.floor(employee.targetMinutes/30)*30);
  const open=datesOfMonth(2026,month).filter(date=>!resolveDay({...store.workHours,holidayClosed:true},date,publicHolidays(2026),{}).closed);
  const validation = validateSchedule(employees,shifts,2026,open,store.workHours);
  expect(validation.errors.filter(e=>e.severity!=="warning")).toEqual([]);
  const shortage = (role: string) => open.reduce((sum,date)=>sum+coverageSummary(shifts.filter(s=>s.date===date && employees.find(e=>e.id===s.employeeId)?.workRole===role),630,1260,1).gaps.reduce((n,g)=>n+g.endMinutes-g.startMinutes,0),0);
  const kitchen=shortage("KITCHEN"),service=shortage("SERVICE_SUSHI");
  const peak = open.reduce((sum,date)=>sum+coverageSummary(shifts.filter(s=>s.date===date),1050,1170,3).gaps.reduce((n,g)=>n+(g.endMinutes-g.startMinutes)*(3-g.count),0),0);
  console.log(JSON.stringify({month,totalHours:shifts.reduce((n,s)=>n+s.paidMinutes,0)/60,kitchenGapMinutes:kitchen,serviceGapMinutes:service,peakMissingStaffMinutes:peak}));
  if(month===10) {
   // Before: 1,110 kitchen + 1,440 service minutes missing with the 20h roster.
   expect(kitchen+service).toBeLessThanOrEqual(1620);
   expect(service).toBeLessThanOrEqual(570);
   const paidOn = (day: string) => shifts.filter(s=>s.date===`2026-10-${day}`).reduce((n,s)=>n+s.paidMinutes,0);
   const fridays = ["02","09","16","23","30"].map(paidOn);
   const normal=["01","05","06","07","08","12","13","14","15","19","20","21","22","26","27","28","29"].map(paidOn);
   expect(fridays.reduce((n,h)=>n+h,0)/fridays.length).toBeGreaterThan(normal.reduce((n,h)=>n+h,0)/normal.length);
   expect(employees.reduce((n,e)=>n+e.targetMinutes,0)).toBe(656*60+18);
   expect(validation.summaries.reduce((n,e)=>n+e.targetMinutes-e.assignedMinutes,0)).toBe(18);
  }
 },120000);
});
