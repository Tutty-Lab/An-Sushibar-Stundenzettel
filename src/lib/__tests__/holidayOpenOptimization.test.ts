import { workingAt } from "../staffing";
import { describe,it,expect } from 'vitest';
import { STORES } from '../stores';
import { generateSchedule } from '../scheduler';
import { datesOfMonth } from '../demand';
import { coverageSummary } from '../coverage';
import { validateSchedule } from '../validation';
describe('holiday-open staffing optimization',()=>{
 for(let month=1;month<=12;month++) it(`retains contracts and repairs coverage in 2026-${month}`,()=>{
 const store=STORES[0],employees=store.sampleEmployees(),open=datesOfMonth(2026,month);
 const started=performance.now();
 const shifts=generateSchedule({year:2026,month,employees,workHours:store.workHours,rules:store.staffingRules,weights:store.dayWeights});
 let optionalGap=0,role=0,closing=0,short=0,peak=0,kitchenMorning=0,kitchenAfternoonOverlap=0;
 for(const date of open){
  const day=shifts.filter(s=>s.date===date);
  for(const r of ['KITCHEN','SERVICE_SUSHI']){
   const own=day.filter(s=>employees.find(e=>e.id===s.employeeId)?.workRole===r);
   if(r==='KITCHEN'){
    kitchenMorning+=coverageSummary(own,630,780,1).gaps.reduce((n,g)=>n+g.endMinutes-g.startMinutes,0);
    const points=Array.from({length:5},(_,i)=>900+i*30);
    kitchenAfternoonOverlap+=points.filter(t=>own.filter(s=>workingAt(s,t)).length>=2).length*30;
   }
   optionalGap+=coverageSummary(own,840,960,1).gaps.reduce((n,g)=>n+g.endMinutes-g.startMinutes,0);
   const gaps=[...coverageSummary(own,630,840,1).gaps,...coverageSummary(own,960,1260,1).gaps];
   role+=gaps.reduce((n,g)=>n+g.endMinutes-g.startMinutes,0);
   short+=gaps.filter(g=>g.endMinutes-g.startMinutes===30).length;
   closing+=coverageSummary(own,1170,1260,1).gaps.reduce((n,g)=>n+g.endMinutes-g.startMinutes,0);
  }
  peak+=coverageSummary(day,1020,1170,3).gaps.reduce((n,g)=>n+(3-g.count)*(g.endMinutes-g.startMinutes),0);
 }
 console.log(JSON.stringify({month,optionalGap,kitchenMorning,kitchenAfternoonOverlap,longShifts:shifts.filter(s=>s.paidMinutes>360).length,mediumShifts:shifts.filter(s=>s.paidMinutes>=240 && s.paidMinutes<=360).length,role,closing,short,peak,seconds:(performance.now()-started)/1000}));
 if(month===10){
 const morningCook=shifts.filter(s=>s.date==='2026-10-02' && employees.find(e=>e.id===s.employeeId)?.workRole==='KITCHEN');
 expect(coverageSummary(morningCook,630,660,1).gaps).toEqual([]);
// Base coverage across every opening slot precedes the optional peak worker.
expect(shifts.filter(s=>s.paidMinutes>=240 && s.paidMinutes<=360).length).toBeGreaterThanOrEqual(50);expect(kitchenMorning).toBe(0);expect(kitchenAfternoonOverlap).toBeLessThanOrEqual(630);expect(role).toBeLessThanOrEqual(240);expect(closing).toBeLessThanOrEqual(240);expect(short).toBeLessThanOrEqual(8);expect(peak).toBeLessThanOrEqual(1590);
 expect(optionalGap).toBeGreaterThan(0);
 const splitDays=new Map<string,typeof shifts>();
 for(const shift of shifts){const key=`${shift.employeeId}:${shift.date}`;splitDays.set(key,[...(splitDays.get(key) ?? []),shift]);}
 expect([...splitDays.values()].some(day=>day.length===2)).toBe(true);
 for(const day of splitDays.values())if(day.length===2){
  day.sort((a,b)=>a.startMinutes-b.startMinutes);
  expect(day[0].endMinutes).toBeGreaterThanOrEqual(840);
  expect(day[1].startMinutes).toBeLessThanOrEqual(960);
  expect(day[1].startMinutes).toBeGreaterThan(day[0].endMinutes);
  for(const shift of day)expect(shift.paidMinutes).toBeGreaterThanOrEqual(180);
 }
}
 for(const e of employees)expect(shifts.filter(s=>s.employeeId===e.id).reduce((n,s)=>n+s.paidMinutes,0)).toBe(e.targetMinutes);
 expect(validateSchedule(employees,shifts,2026,open,store.workHours).errors.filter(e=>e.severity!=='warning')).toEqual([]);
 },120000);
});
