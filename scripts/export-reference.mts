import { writeFileSync } from 'node:fs';
import { STORES } from '../src/lib/stores';
import { datesOfMonth, weekdayKeyOf, parseIsoDate } from '../src/lib/demand';
import { publicHolidays } from '../src/lib/holidays';
import { resolveDay } from '../src/lib/workHours';
import { weekStartOf } from '../src/lib/weeks';
import { generateSchedule } from '../src/lib/scheduler';
const store=STORES[0],year=2026,month=10,employees=store.sampleEmployees();
const dates=datesOfMonth(year,month);
const days=dates.map(date=>({date,week:weekStartOf(date),weekday:weekdayKeyOf(parseIsoDate(date)),...resolveDay(store.workHours,date,publicHolidays(year),{})}));
const blocked=Object.fromEntries(employees.map((e,i)=>[e.id,dates.filter(date=>{
 if(i<4)return false;
 const m=parseIsoDate(weekStartOf(date));
 const week=Math.round((Date.UTC(m.getFullYear(),m.getMonth(),m.getDate())-Date.UTC(2026,0,5))/(7*86400000));
 return ((week%2)+2)%2!==i-4;
})]));
const shifts=generateSchedule({year,month,employees,workHours:store.workHours,rules:store.staffingRules,weights:store.dayWeights});
writeFileSync('docs/schedule-reference-input.json',JSON.stringify({year,month,employees,days,blocked,baseline:shifts},null,2));
