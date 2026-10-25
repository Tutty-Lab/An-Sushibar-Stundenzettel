import type { Employee, Shift } from "../types";
import { coveragePoints, workingAt } from "./staffing";

export const roleLabel = (role: Shift["assignedRole"]) => role === "KITCHEN" ? "Bếp" : role === "SERVICE_SUSHI" ? "Bồi/Sushi" : "";
export function effectiveShiftRole(shift: Shift, employee?: Employee) {
 return employee?.workRole === "BOTH" ? shift.assignedRole : employee?.workRole;
}
/** Assign one department for the entire flexible shift, minimizing uncovered role minutes. */
export function assignShiftRoles(shifts: Shift[], employees: Employee[]): Shift[] {
 const byId = new Map(employees.map(e=>[e.id,e]));
 const output = shifts.map(s=>({...s}));
 for (const date of new Set(output.map(s=>s.date))) {
  const day=output.filter(s=>s.date===date);
  const flexible=day.filter(s=>byId.get(s.employeeId)?.workRole==="BOTH");
  for(const s of flexible) s.assignedRole ??= "SERVICE_SUSHI";
  const points=coveragePoints(day,630,1260);
  const cost=()=>points.slice(0,-1).reduce((sum,t,i)=>{
   const active=day.filter(s=>workingAt(s,t));
   return sum+(["KITCHEN","SERVICE_SUSHI"].filter(role=>!active.some(s=>effectiveShiftRole(s,byId.get(s.employeeId))===role)).length)*(points[i+1]-t);
  },0);
  // Coordinate descent keeps runtime bounded for manually added large teams.
  for(let pass=0;pass<3;pass++) for(const s of flexible) {
   const old=s.assignedRole, before=cost();
   s.assignedRole=old==="KITCHEN"?"SERVICE_SUSHI":"KITCHEN";
   if(cost()>=before) s.assignedRole=old;
  }
 }
 return output;
}
