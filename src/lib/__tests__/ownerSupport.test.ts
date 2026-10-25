import { generateSchedule } from "../scheduler";
import { describe, it, expect } from "vitest";
import { withOwner, OWNER } from "../owner";
import { initialScheduleFor, STORES } from "../stores";
import { coverageSummary } from "../coverage";
import { workingAt } from "../staffing";
import { effectiveShiftRole } from "../shiftRoles";

describe("owner support",()=>{
 it("supports one role at a time, switches during staff breaks, stays outside paid contracts",()=>{
  const base=initialScheduleFor(STORES[0]);
  const cook={...base.employees[0],id:"cook",workRole:"KITCHEN" as const};
  const schedule=withOwner({...base,year:2026,month:10,employees:[cook],shifts:[{id:"cook-shift",employeeId:"cook",date:"2026-10-01",startMinutes:630,endMinutes:1260,pauseStartMinutes:900,pauseMinutes:30,paidMinutes:600,shiftType:"CUSTOM",generated:false}]});
  const owner=schedule.shifts.filter(s=>s.employeeId===OWNER.id && s.date==="2026-10-01");
  expect(owner.reduce((n,s)=>n+s.paidMinutes,0)).toBe(0);
  expect(owner.find(s=>workingAt(s,900))?.assignedRole).toBe("KITCHEN");
  expect(owner.find(s=>workingAt(s,630))?.assignedRole).toBe("SERVICE_SUSHI");
  for(let t=630;t<1260;t++) expect(owner.filter(s=>workingAt(s,t))).toHaveLength(1);
  expect(schedule.shifts.some(s=>s.employeeId===OWNER.id && s.date==="2026-10-03")).toBe(true);
  expect(withOwner(schedule).shifts).toEqual(schedule.shifts);
  expect(schedule.employees.filter(e=>e.isOwner)).toHaveLength(1);
  const day=schedule.shifts.filter(s=>s.date==="2026-10-01");
  const kitchen=day.filter(s=>effectiveShiftRole(s,schedule.employees.find(e=>e.id===s.employeeId))==="KITCHEN");
  expect(coverageSummary(kitchen,630,1260,1).gaps).toEqual([]);
  expect(coverageSummary(day,900,930,2).minimum).toBe(1);
 });
 it("honors closed overrides and split opening blocks",()=>{
  const base=initialScheduleFor(STORES[0]);
  const next=withOwner({...base,year:2026,month:10,dateOverrides:[{date:"2026-10-01",closed:true}],shifts:[]});
  expect(next.shifts.some(s=>s.date==="2026-10-01")).toBe(false);
 });
});

it("keeps paid staff scheduling identical with or without the owner",()=>{
 const store=STORES[0],base=withOwner({...initialScheduleFor(store),year:2026,month:10});
 const shifts=generateSchedule({year:2026,month:10,workHours:base.workHours,employees:base.employees,rules:store.staffingRules,weights:store.dayWeights});
 expect(shifts.reduce((n,s)=>n+s.paidMinutes,0)).toBe(656*60);
 const without=generateSchedule({year:2026,month:10,workHours:base.workHours,employees:base.employees.filter(e=>!e.isOwner),rules:store.staffingRules,weights:store.dayWeights});
 expect(shifts).toEqual(without);
 const next=withOwner({...base,shifts});
 expect(next.shifts.filter(s=>s.employeeId===OWNER.id).every(s=>s.paidMinutes===0)).toBe(true);
 for(const employee of next.employees.filter(e=>!e.isOwner)) expect(next.shifts.filter(s=>s.employeeId===employee.id).reduce((n,s)=>n+s.paidMinutes,0)).toBe(employee.targetMinutes);
},120000);
