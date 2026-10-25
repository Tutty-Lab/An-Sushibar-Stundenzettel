import { readFileSync,writeFileSync } from 'node:fs';
import { STORES } from '../src/lib/stores';
import { validateSchedule } from '../src/lib/validation';
import { coverageSummary } from '../src/lib/coverage';
import type { Shift } from '../src/types';
const input=JSON.parse(readFileSync('docs/schedule-reference-input.json','utf8'));
if(process.argv.includes('--combine')) {
 const a=JSON.parse(readFileSync('docs/schedule-reference-KITCHEN.json','utf8'));
 const b=JSON.parse(readFileSync('docs/schedule-reference-SERVICE_SUSHI.json','utf8'));
 writeFileSync('docs/schedule-reference-result.json',JSON.stringify({year:input.year,month:input.month,status:'Feasible combined department incumbents; not proven optimal',relativeGap:null,seconds:a.seconds+b.seconds,shifts:[...a.shifts,...b.shifts]},null,2));
}
const result=JSON.parse(readFileSync('docs/schedule-reference-result.json','utf8'));
const store=STORES[0],open=input.days.filter((d:any)=>!d.closed).map((d:any)=>d.date);
function measure(shifts:Shift[]){
 const validation=validateSchedule(input.employees,shifts,input.year,open,store.workHours);
 const missing=(role:string)=>open.reduce((n:number,date:string)=>n+coverageSummary(shifts.filter(s=>s.date===date && input.employees.find((e:any)=>e.id===s.employeeId)?.workRole===role),630,1260,1).gaps.reduce((sum,g)=>sum+g.endMinutes-g.startMinutes,0),0);
 const peak=open.reduce((n:number,date:string)=>n+coverageSummary(shifts.filter(s=>s.date===date),1050,1170,3).gaps.reduce((sum,g)=>sum+(g.endMinutes-g.startMinutes)*(3-g.count),0),0);
 const constraints=shifts.filter(s=>input.blocked[s.employeeId]?.includes(s.date)).map(s=>`Blocked day: ${s.employeeId} ${s.date}`);
 for(const employee of input.employees){
  const own=shifts.filter(s=>s.employeeId===employee.id);
  if(own.reduce((n,s)=>n+s.paidMinutes,0)!==employee.targetMinutes)constraints.push(`Contract mismatch: ${employee.id}`);
  for(const week of new Set(input.days.map((d:any)=>d.week))){
   const dates=new Set(input.days.filter((d:any)=>d.week===week).map((d:any)=>d.date));
   if(new Set(own.filter(s=>dates.has(s.date)).map(s=>s.date)).size>6)constraints.push(`Week limit: ${employee.id} ${week}`);
  }
 }
 return {constraintErrors:constraints,hours:shifts.reduce((n,s)=>n+s.paidMinutes,0)/60,kitchenGapMinutes:missing('KITCHEN'),serviceGapMinutes:missing('SERVICE_SUSHI'),peakMissingStaffMinutes:peak,errors:validation.errors.filter(e=>e.severity!=='warning')};
}
const metrics={baseline:measure(input.baseline),reference:measure(result.shifts),solver:{status:result.status,relativeGap:result.relativeGap,seconds:result.seconds}};
console.log(JSON.stringify(metrics,null,2));
writeFileSync('docs/schedule-reference-metrics.json',JSON.stringify(metrics,null,2));
if(metrics.reference.errors.length || metrics.reference.constraintErrors.length)process.exitCode=1;

const time=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const table=['Ngày;Nhân viên;Bộ phận;Vào;Ra;Bắt đầu nghỉ;Phút nghỉ;Giờ công',...result.shifts.sort((a:Shift,b:Shift)=>a.date.localeCompare(b.date)||a.employeeId.localeCompare(b.employeeId)).map((s:Shift)=>[s.date,input.employees.find((e:any)=>e.id===s.employeeId)?.name,input.employees.find((e:any)=>e.id===s.employeeId)?.workRole,time(s.startMinutes),time(s.endMinutes),s.pauseStartMinutes==null?'':time(s.pauseStartMinutes),s.pauseMinutes,s.paidMinutes/60].join(';'))];
writeFileSync('docs/lich-doi-chung-thang-10.csv','\uFEFF'+table.join('\n'));
