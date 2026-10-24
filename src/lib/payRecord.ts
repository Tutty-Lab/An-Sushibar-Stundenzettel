import type { PayrollRecord } from "../types";

/** Mindestlohn 2026 – mặc định khi chưa biết lương giờ. */
export const MINDESTLOHN_2026 = 13.9;

/** Giờ mục tiêu từ lương: lương tháng ÷ lương giờ, làm tròn 2 số lẻ. */
export function hoursFromPay(monthlySalary?: number, hourlyWage?: number): number | undefined {
  if (!monthlySalary || !hourlyWage || hourlyWage <= 0) return undefined;
  return Math.round((monthlySalary / hourlyWage) * 100) / 100;
}

/** Số giờ một bản ghi tháng thực sự dùng để xếp ca. */
export function recordHours(record: PayrollRecord): number {
  if (record.manualHours || hoursFromPay(record.grossEuro, record.hourlyWage) == null) return record.convertedHours;
  return hoursFromPay(record.grossEuro, record.hourlyWage)!;
}
