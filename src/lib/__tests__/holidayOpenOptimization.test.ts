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
 let role=0,closing=0,short=0,peak=0,kitchenMorning=0,kitchenAfternoonOverlap=0;
 for(const date of open){
  const day=shifts.filter(s=>s.date===date);
  for(const r of ['KITCHEN','SERVICE_SUSHI']){
   const own=day.filter(s=>employees.find(e=>e.id===s.employeeId)?.workRole===r);
   if(r==='KITCHEN'){
    kitchenMorning+=coverageSummary(own,630,780,1).gaps.reduce((n,g)=>n+g.endMinutes-g.startMinutes,0);
    const points=Array.from({length:5},(_,i)=>900+i*30);
    kitchenAfternoonOverlap+=points.filter(t=>own.filter(s=>workingAt(s,t)).length>=2).length*30;
   }
   const gaps=coverageSummary(own,630,1260,1).gaps;
   role+=gaps.reduce((n,g)=>n+g.endMinutes-g.startMinutes,0);
   short+=gaps.filter(g=>g.endMinutes-g.startMinutes===30).length;
   closing+=coverageSummary(own,1170,1260,1).gaps.reduce((n,g)=>n+g.endMinutes-g.startMinutes,0);
  }
  peak+=coverageSummary(day,1050,1170,3).gaps.reduce((n,g)=>n+(3-g.count)*(g.endMinutes-g.startMinutes),0);
 }
 console.log(JSON.stringify({month,kitchenMorning,kitchenAfternoonOverlap,longShifts:shifts.filter(s=>s.paidMinutes>360).length,mediumShifts:shifts.filter(s=>s.paidMinutes>=240 && s.paidMinutes<=360).length,role,closing,short,peak,seconds:(performance.now()-started)/1000}));
 if(month===10){
 const morningCook=shifts.filter(s=>s.date==='2026-10-02' && employees.find(e=>e.id===s.employeeId)?.workRole==='KITCHEN');
 expect(coverageSummary(morningCook,630,660,1).gaps).toEqual([]);
expect(shifts.filter(s=>s.paidMinutes>=240 && s.paidMinutes<=360).length).toBeGreaterThanOrEqual(50);expect(kitchenMorning).toBeLessThanOrEqual(1110);expect(role).toBeLessThanOrEqual(2280);expect(closing).toBe(0);expect(short).toBeLessThanOrEqual(27);expect(peak).toBeLessThanOrEqual(2790);}
 for(const e of employees)expect(shifts.filter(s=>s.employeeId===e.id).reduce((n,s)=>n+s.paidMinutes,0)).toBe(e.targetMinutes);
 expect(validateSchedule(employees,shifts,2026,open,store.workHours).errors.filter(e=>e.severity!=='warning')).toEqual([]);
 },120000);
});
