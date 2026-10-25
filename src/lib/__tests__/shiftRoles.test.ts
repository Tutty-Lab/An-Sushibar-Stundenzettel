import { describe, it, expect } from "vitest";
import { assignShiftRoles, effectiveShiftRole } from "../shiftRoles";
import type { Employee, Shift } from "../../types";
const employee = (id:string,workRole:Employee["workRole"]):Employee=>({id,name:id,workRole,employmentType:"VOLLZEIT",targetMinutes:480});
const shift = (id:string):Shift=>({id,employeeId:id,date:"2026-10-01",startMinutes:630,endMinutes:990,paidMinutes:360,pauseMinutes:0,shiftType:"EARLY",generated:true});
describe("flexible shift assignment",()=>{
 it("assigns service next to a cook, preserving time and input",()=>{
  const input=[shift("cook"),shift("flex")];
  const output=assignShiftRoles(input,[employee("cook","KITCHEN"),employee("flex","BOTH")]);
  expect(output[1].assignedRole).toBe("SERVICE_SUSHI");
  expect(output[1].paidMinutes).toBe(360);
  expect(input[1].assignedRole).toBeUndefined();
 });
 it("assigns kitchen next to service",()=>{
  const employees=[employee("service","SERVICE_SUSHI"),employee("flex","BOTH")];
  const output=assignShiftRoles([shift("service"),shift("flex")],employees);
  expect(effectiveShiftRole(output[1],employees[1])).toBe("KITCHEN");
 });
 it("assigns separate departments to two flexible people",()=>{
  const output=assignShiftRoles([shift("a"),shift("b")],[employee("a","BOTH"),employee("b","BOTH")]);
  expect(new Set(output.map(s=>s.assignedRole)).size).toBe(2);
 });
 it("does not add owner presence or any extra shifts",()=>{
  expect(assignShiftRoles([], [{...employee("owner","BOTH"),isOwner:true}])).toEqual([]);
 });
});
