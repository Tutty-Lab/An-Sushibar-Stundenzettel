/** Chính sách riêng An Sushibar. Không dùng lịch hẹn hay quy tắc tiệm nail. */
export const RESTAURANT_POLICY = {
 opening: { startMinutes: 630, endMinutes: 1260 },
 peak: { startMinutes: 1050, endMinutes: 1170, weekdays: ["friday", "saturday"] as const },
 // Mức phủ vận hành đang dùng: 1 bếp + 1 bồi; cao điểm T6–T7 thêm 1 người.
 minimumKitchen: 1,
 minimumService: 1,
 peakStaff: 3,
 // Trọng số tối ưu, không phải số giờ hợp đồng hoặc giới hạn pháp lý.
 emptyMinuteCost: 200000,
 missingRoleMinuteCost: 20000,
 peakMissingMinuteCost: 10000,
 balanceHourCost: 1500,
} as const;

/** Flexible people cannot fill kitchen and service simultaneously. */
export function missingRestaurantRoles(kitchen: number, service: number, flexible: number): number {
 return Math.max(0,
  Math.max(0, RESTAURANT_POLICY.minimumKitchen-kitchen)
  + Math.max(0, RESTAURANT_POLICY.minimumService-service)-flexible);
}
