/** Chính sách riêng An Sushibar. Không dùng lịch hẹn hay quy tắc tiệm nail. */
export const RESTAURANT_POLICY = {
 opening: { startMinutes: 630, endMinutes: 1260 },
 optionalCoverage: { enabled: true, startMinutes: 840, endMinutes: 960 },
 peak: { startMinutes: 1020, endMinutes: 1170, weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const },
} as const;

/** Prefer coverage here too; absorb unavoidable gaps here before other times. */
export function isOptionalCoverageTime(minute:number):boolean {
 return RESTAURANT_POLICY.optionalCoverage.enabled && minute>=RESTAURANT_POLICY.optionalCoverage.startMinutes && minute<RESTAURANT_POLICY.optionalCoverage.endMinutes;
}

/** Compare coverage before either soft peak target; lower is better. */
export function compareStaffingPriority(a:readonly number[],b:readonly number[]):number {
 for(let i=0;i<Math.max(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];
 return 0;
}
