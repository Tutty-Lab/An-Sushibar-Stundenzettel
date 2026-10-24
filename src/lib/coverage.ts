import type { Shift } from "../types";
import { coveragePoints, workingAt } from "./staffing";

export type CoverageGap = { startMinutes: number; endMinutes: number; count: number };

/** Exact shift/break boundaries; adjacent intervals with equal staffing merge. */
export function coverageSummary(shifts: Shift[], from: number, to: number, required: number) {
  if (to <= from) return {minimum:null, gaps:[] as CoverageGap[]};
  const points = coveragePoints(shifts, from, to);
  const gaps: CoverageGap[] = [];
  let minimum = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const startMinutes = points[i], endMinutes = points[i + 1];
    const count = new Set(shifts.filter(s => workingAt(s, startMinutes)).map(s => s.employeeId)).size;
    minimum = Math.min(minimum, count);
    if (count >= required) continue;
    const previous = gaps[gaps.length - 1];
    if (previous?.endMinutes === startMinutes && previous.count === count) previous.endMinutes = endMinutes;
    else gaps.push({ startMinutes, endMinutes, count });
  }
  return { minimum: minimum === Infinity ? null : minimum, gaps };
}
