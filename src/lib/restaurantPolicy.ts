/** Chính sách riêng An Sushibar. Không dùng lịch hẹn hay quy tắc tiệm nail. */
export const RESTAURANT_POLICY = {
 opening: { startMinutes: 630, endMinutes: 1260 },
 optionalCoverage: { startMinutes: 840, endMinutes: 960 },
 peak: { startMinutes: 1020, endMinutes: 1170, weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const },
 // Mức phủ vận hành đang dùng: 1 bếp + 1 bồi; cao điểm mỗi ngày thêm 1 người.
 minimumKitchen: 1,
 minimumService: 1,
 peakStaff: 3,
 // Trọng số tối ưu, không phải số giờ hợp đồng hoặc giới hạn pháp lý.
 emptyMinuteCost: 200000,
 // Minimum department coverage takes priority over the extra peak person.
 missingRoleMinuteCost: 200000,
 peakMissingMinuteCost: 50000,
 balanceHourCost: 1500,
} as const;

/** Flexible people cannot fill kitchen and service simultaneously. */
export function missingRestaurantRoles(kitchen: number, service: number, flexible: number): number {
 return Math.max(0,
  Math.max(0, RESTAURANT_POLICY.minimumKitchen-kitchen)
  + Math.max(0, RESTAURANT_POLICY.minimumService-service)-flexible);
}

/** 14:00–16:00 may be unstaffed; retain actual headcounts in diagnostics. */
export function isOptionalCoverageTime(minute:number):boolean {
 return minute>=RESTAURANT_POLICY.optionalCoverage.startMinutes && minute<RESTAURANT_POLICY.optionalCoverage.endMinutes;
}
