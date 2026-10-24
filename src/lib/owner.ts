import type { Employee, Schedule, Shift } from "../types";
import type { WorkHoursConfig, OverrideMap } from "./workHours";

/**
 * Chủ tiệm: thỉnh thoảng làm dịch vụ, KHÔNG có mặt cố định và không tính giờ
 * hợp đồng. Chỉ thêm ca tay khi cần; ca của chủ vẫn được tính vào độ phủ.
 */
export const OWNER: Employee = { id: "ansushibar-owner", name: "Chủ tiệm", isOwner: true, employmentType: "VOLLZEIT", targetMinutes: 0 };

/** Không tự tạo ca cho chủ tiệm (khác J'ADEQA). */
export function ownerPresence(_year: number, _month: number, _workHours: WorkHoursConfig, _overrides: OverrideMap = {}, _owners: Employee[] = [OWNER], _holidays?: Set<string>): Shift[] {
  return [];
}

/** Chỉ bảo đảm có dòng „Chủ tiệm" trong danh sách. */
export function withOwner(schedule: Schedule): Schedule {
  return schedule.employees.some((e) => e.isOwner) ? schedule : { ...schedule, employees: [...schedule.employees, { ...OWNER }] };
}
