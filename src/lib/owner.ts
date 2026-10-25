import type { Employee, Schedule, Shift } from "../types";
import { datesOfMonth } from "./demand";
import { publicHolidays } from "./holidays";
import { resolveDay, type WorkHoursConfig, type OverrideMap } from "./workHours";
import { coveragePoints, workingAt } from "./staffing";
import { effectiveShiftRole } from "./shiftRoles";

/** Owner supports exactly one station at a time, outside paid contracts. */
export const OWNER: Employee = { id: "ansushibar-owner", name: "Chủ tiệm", isOwner: true, workRole: "BOTH", employmentType: "VOLLZEIT", targetMinutes: 0 };

export function ownerPresence(year: number, month: number, workHours: WorkHoursConfig, overrides: OverrideMap = {}, owners: Employee[] = [OWNER], holidays = publicHolidays(year)): Shift[] {
 return datesOfMonth(year,month).flatMap(date => {
  const day=resolveDay(workHours,date,holidays,overrides);
  return day.closed ? [] : owners.flatMap(owner=>day.blocks.map((block,i)=>({id:`owner-${owner.id}-${date}-${i}`,employeeId:owner.id,date,...block,pauseMinutes:0,paidMinutes:0,shiftType:"CUSTOM" as const,generated:true})));
 });
}

/** Rebuild support from real opening blocks and staff breaks; never add a second owner. */
export function withOwner(schedule: Schedule): Schedule {
 const employees=schedule.employees.some(e=>e.isOwner) ? schedule.employees.map(e=>e.isOwner ? {...e,workRole:"BOTH" as const,targetMinutes:0} : e) : [...schedule.employees,{...OWNER}];
 const byId=new Map(employees.map(e=>[e.id,e]));
 const staff=schedule.shifts.filter(s=>!byId.get(s.employeeId)?.isOwner);
 const presence=ownerPresence(schedule.year,schedule.month,schedule.workHours,Object.fromEntries(schedule.dateOverrides.map(o=>[o.date,o])),employees.filter(e=>e.isOwner));
 const support:Shift[]=[];
 for(const shift of presence) {
  const day=[...staff,...support].filter(s=>s.date===shift.date);
  const points=coveragePoints(day,shift.startMinutes,shift.endMinutes);
  for(let i=0;i+1<points.length;i++) {
   const startMinutes=points[i],endMinutes=points[i+1];
   const kitchen=day.some(s=>workingAt(s,startMinutes) && effectiveShiftRole(s,byId.get(s.employeeId))==="KITCHEN");
   const assignedRole=kitchen ? "SERVICE_SUSHI" as const : "KITCHEN" as const;
   const prev=support[support.length-1];
   if(prev?.employeeId===shift.employeeId && prev.date===shift.date && prev.endMinutes===startMinutes && prev.assignedRole===assignedRole) prev.endMinutes=endMinutes;
   else support.push({...shift,id:`${shift.id}-${i}`,startMinutes,endMinutes,assignedRole});
  }
 }
 return {...schedule,employees,shifts:[...staff,...support]};
}
