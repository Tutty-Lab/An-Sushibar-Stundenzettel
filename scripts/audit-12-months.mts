// Run: npx vite-node scripts/audit-12-months.mts [year]
import { writeFileSync } from "node:fs";
import { generateSchedule } from "../src/lib/scheduler";
import { STORES } from "../src/lib/stores";
import { datesOfMonth } from "../src/lib/demand";
import { publicHolidays } from "../src/lib/holidays";
import { resolveDay } from "../src/lib/workHours";
import { validateSchedule } from "../src/lib/validation";
import { workingAt, validPause } from "../src/lib/staffing";
import { maxConsecutiveRun } from "../src/lib/consecutive";
import { weekStartOf } from "../src/lib/weeks";
import type { Shift } from "../src/types";

const year = Number(process.argv[2] ?? 2026);
const store = STORES[0];
const employees = store.sampleEmployees();
const holidays = publicHolidays(year);
const results: any[] = [];
const all: Shift[] = [];
for (let month = 1; month <= 12; month++) {
 const shifts = generateSchedule({ year, month, workHours: store.workHours, employees, rules: store.staffingRules, weights: store.dayWeights, storeTag: store.id });
 all.push(...shifts);
 const dates = datesOfMonth(year, month);
 const open = dates.filter(d => !resolveDay(store.workHours,d,holidays,{}).closed);
 const validation = validateSchedule(employees,shifts,year,open,store.workHours);
 const independent: string[] = [];
 for (const s of shifts) {
  const day = resolveDay(store.workHours,s.date,holidays,{});
  if (day.closed || !day.blocks.some(b=>s.startMinutes>=b.startMinutes && s.endMinutes<=b.endMinutes)) independent.push(`Outside opening: ${s.employeeId} ${s.date}`);
  if (s.paidMinutes !== s.endMinutes-s.startMinutes-s.pauseMinutes || (s.pauseMinutes>0 && !validPause(s)) || (s.pauseMinutes===0 && s.paidMinutes>360)) independent.push(`Invalid time/break: ${s.employeeId} ${s.date}`);
  if (["ansushibar-5","ansushibar-6"].includes(s.employeeId) && ![0,5,6].includes(new Date(s.date+"T12:00:00").getDay())) independent.push(`Minijob weekday: ${s.date}`);
 }
 for (const e of employees) {
  const list=shifts.filter(s=>s.employeeId===e.id);
  if(list.reduce((n,s)=>n+s.paidMinutes,0)>e.targetMinutes) independent.push(`Contract exceeded: ${e.id}`);
  if(maxConsecutiveRun(list.map(s=>s.date))>6) independent.push(`Consecutive days: ${e.id}`);
  for(const d of dates) {
   const daily=list.filter(s=>s.date===d).sort((a,b)=>a.startMinutes-b.startMinutes);
   if(daily.reduce((n,s)=>n+s.paidMinutes,0)>480) independent.push(`Daily cap: ${e.id} ${d}`);
   if(daily.some((s,i)=>i>0 && s.startMinutes<daily[i-1].endMinutes)) independent.push(`Overlap: ${e.id} ${d}`);
  }
 }
 const minijobWeeks = employees.filter(e=>e.employmentType==="MINIJOB").map(e=>new Set(shifts.filter(s=>s.employeeId===e.id).map(s=>weekStartOf(s.date))));
 if([...minijobWeeks[0]].some(w=>minijobWeeks[1].has(w))) independent.push("Minijob weekend overlap");
 let noOpen=0,noClose=0,emptyMinutes=0,belowTwoMinutes=0,peakMissingMinutes=0,peakMinutes=0,kitchenMissingMinutes=0,serviceMissingMinutes=0;
 for(const d of open) {
  const day=resolveDay(store.workHours,d,holidays,{}); const ds=shifts.filter(s=>s.date===d);
  if(!ds.some(s=>workingAt(s,630))) noOpen++;
  if(!ds.some(s=>workingAt(s,1259))) noClose++;
  for(let minute=630;minute<1260;minute++) {
   const active=ds.filter(s=>workingAt(s,minute));
   if(!active.length) emptyMinutes++;
   if(active.length<2) belowTwoMinutes++;
   const role=(s:Shift)=>employees.find(e=>e.id===s.employeeId)?.workRole;
   // BOTH is one person: cannot cover kitchen and service simultaneously.
   const k=active.filter(s=>role(s)==="KITCHEN").length;
   const v=active.filter(s=>role(s)==="SERVICE_SUSHI").length;
   const b=active.filter(s=>role(s)==="BOTH").length;
   if(k===0 && b===0) kitchenMissingMinutes++;
   if(v===0 && b===0) serviceMissingMinutes++;
   const weekday=new Date(d+"T12:00:00").getDay();
   if([5,6].includes(weekday) && minute>=1050 && minute<1170) { peakMinutes++; if(active.length<3) peakMissingMinutes++; }
  }
 }
 const people=employees.map(e=>({id:e.id,name:e.name,targetHours:e.targetMinutes/60,plannedHours:shifts.filter(s=>s.employeeId===e.id).reduce((n,s)=>n+s.paidMinutes,0)/60}));
 const row={month:`${year}-${String(month).padStart(2,"0")}`,openDays:open.length,shifts:shifts.length,targetHours:people.reduce((n,e)=>n+e.targetHours,0),plannedHours:people.reduce((n,e)=>n+e.plannedHours,0),noOpen,noClose,emptyHours:emptyMinutes/60,belowTwoHours:belowTwoMinutes/60,peakMissingHours:peakMissingMinutes/60,peakHours:peakMinutes/60,kitchenMissingHours:kitchenMissingMinutes/60,serviceMissingHours:serviceMissingMinutes/60,errors:validation.errors.filter(e=>e.severity!=="warning"),warnings:validation.errors.filter(e=>e.severity==="warning"),independent,people};
 results.push(row); console.log(JSON.stringify(row));
}
const boundaryRuns=employees.map(e=>({name:e.name,maxDays:maxConsecutiveRun(all.filter(s=>s.employeeId===e.id).map(s=>s.date))}));
const report={year,store:store.id,results,boundaryRuns};
writeFileSync(`docs/schedules-${year}.json`,JSON.stringify({ year, store:store.id, employees, shifts:all },null,2)+"\n");
writeFileSync(`docs/audit-${year}.json`,JSON.stringify(report,null,2)+"\n");
console.log("BOUNDARIES",JSON.stringify(boundaryRuns));
if(results.some(r=>r.errors.length || r.independent.length) || boundaryRuns.some(r=>r.maxDays>6)) process.exitCode=1;
