import { describe, it, expect } from "vitest";
import { coverageSummary } from "../coverage";
import type { Shift } from "../../types";
const shift = (id: string, start: number, end: number, pause = 0, pauseStart?: number): Shift => ({id, shiftType:"CUSTOM", generated:true, employeeId:id, date:"2026-10-01", startMinutes:start, endMinutes:end, pauseMinutes:pause, pauseStartMinutes:pauseStart, paidMinutes:end-start-pause});
describe("coverage gap intervals", () => {
 it("reports an entire empty opening window", () => {
  expect(coverageSummary([],630,1260,1)).toEqual({minimum:0,gaps:[{startMinutes:630,endMinutes:1260,count:0}]});
 });
 it("finds gaps at exact break boundaries, including non-grid minutes", () => {
  expect(coverageSummary([shift("a",630,1080,30,787)],630,1080,1).gaps).toEqual([{startMinutes:787,endMinutes:817,count:0}]);
 });
 it("merges adjacent gaps when staff hand over at equal counts", () => {
  expect(coverageSummary([shift("a",630,720),shift("b",720,1260)],630,1260,2).gaps).toEqual([{startMinutes:630,endMinutes:1260,count:1}]);
 });
 it("does not count duplicate shifts as extra people", () => {
  const s=shift("a",630,1260);
  expect(coverageSummary([s,s],630,1260,2).minimum).toBe(1);
 });
});
