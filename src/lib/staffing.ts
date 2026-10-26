import { RESTAURANT_POLICY } from "./restaurantPolicy";
import type { Shift } from "../types";
import { DAY_WEIGHTS, type WeekdayKey } from "./demand";
import type { DayBlocks, DayWindow } from "./workHours";

export type StaffingWindow = {
  label: string;
  startMinutes: number;
  endMinutes: number;
  minStaff: number;
  maxStaff: number;
};

/** An Sushibar: chỉ cao điểm tối 17:00–19:30. */
export const PEAK_START = RESTAURANT_POLICY.peak.startMinutes;
export const PEAK_END = RESTAURANT_POLICY.peak.endMinutes;

/**
 * Eine Besetzungsregel: WO (Zeitspanne je Öffnungsblock) und WIE VIELE.
 *
 * minStaff/maxStaff sind der Wert eines Normaltags (Gewicht 1,0). Bei
 * scaled = true werden sie mit dem Tagesgewicht (DAY_WEIGHTS) multipliziert und
 * aufgerundet – starke Tage tragen so automatisch mehr.
 *
 * Einzige Quelle für Scheduler, Độ phủ-Bericht und Tab „Tài liệu": wer die
 * Besetzung eines Studios ändert, ändert nur diese Liste.
 */
export type StaffingRule = {
  label: string;
  /** Kurzbeschreibung der Zeitspanne für den Tab „Tài liệu". */
  when: string;
  minStaff: number;
  maxStaff: number;
  scaled: boolean;
  /** Nur an diesen (effektiven) Wochentagen; fehlt = an jedem offenen Tag. */
  weekdays?: readonly WeekdayKey[];
  windows: (blocks: DayBlocks) => DayWindow[];
};

/** Schneidet eine feste Uhrzeitspanne mit jedem Öffnungsblock. */
export const clip = (from: number, to: number) => (blocks: DayBlocks): DayWindow[] =>
  blocks
    .map((block) => ({ startMinutes: Math.max(from, block.startMinutes), endMinutes: Math.min(to, block.endMinutes) }))
    .filter((window) => window.endMinutes > window.startMinutes);

/** Die ganze Öffnungszeit – es ist IMMER jemand im Studio. */
export const wholeDay = (blocks: DayBlocks): DayWindow[] =>
  blocks.map((block) => ({ startMinutes: block.startMinutes, endMinutes: block.endMinutes }));

/** Ngày đông khách: thứ Sáu và thứ Bảy. */
export const BUSY_DAYS: readonly WeekdayKey[] = ["friday", "saturday"];

/** Mức phủ vận hành: bếp + bồi; thêm người mỗi ngày trong cao điểm tối. */
export const ANSUSHIBAR_STAFFING_RULES: readonly StaffingRule[] = [
 { label: "Khung cần đủ bếp và bồi", when: "10:30–14:00, 16:00–21:00", minStaff: 2, maxStaff: Infinity, scaled: false, windows: (blocks) => [...clip(630,840)(blocks), ...clip(960,1260)(blocks)] },
 { label: "Cao điểm tối cả tuần", when: "17:00–19:30", minStaff: 3, maxStaff: 6, scaled: false, weekdays: RESTAURANT_POLICY.peak.weekdays, windows: clip(PEAK_START, PEAK_END) },
];

/** Rückfall für Tests und Altaufrufe. */
export const STAFFING_RULES = ANSUSHIBAR_STAFFING_RULES;

/** Mindest-/Höchstzahl einer Regel an einem Wochentag (Gewicht angewandt, aufgerundet). */
export function ruleRange(rule: StaffingRule, weekday: WeekdayKey): { minStaff: number; maxStaff: number } {
  const weight = rule.scaled ? DAY_WEIGHTS[weekday] : 1;
  return {
    minStaff: Math.ceil(rule.minStaff * weight),
    maxStaff: Number.isFinite(rule.maxStaff) ? Math.ceil(rule.maxStaff * weight) : Infinity,
  };
}

export function ruleAppliesOn(rule: StaffingRule, weekday: WeekdayKey): boolean {
  return !rule.weekdays || rule.weekdays.includes(weekday);
}

export function staffingWindows(
  blocks: DayBlocks,
  weekday: WeekdayKey,
  rules: readonly StaffingRule[] = STAFFING_RULES,
): StaffingWindow[] {
  return rules.filter((rule) => ruleAppliesOn(rule, weekday)).flatMap((rule) => {
    const range = ruleRange(rule, weekday);
    return rule.windows(blocks).map((window) => ({ label: rule.label, ...window, ...range }));
  });
}

/**
 * Số GIỜ CÔNG tối thiểu một ngày cần, để mọi khung ở mục „số người tối thiểu"
 * được thoả: với từng 30 phút mở cửa, lấy mức cao nhất trong các khung phủ lên
 * nó, rồi cộng lại.
 *
 * An Sushibar: 2 người suốt giờ mở cửa, thêm người trong cao điểm mỗi ngày.
 */
export function minimumStaffHours(
  blocks: DayBlocks,
  weekday: WeekdayKey,
  rules: readonly StaffingRule[] = STAFFING_RULES,
  slot = 30,
): number {
  const windows = staffingWindows(blocks, weekday, rules);
  let minutes = 0;
  for (const block of blocks) {
    for (let m = block.startMinutes; m < block.endMinutes; m += slot) {
      let need = 0;
      for (const w of windows) {
        if (m >= w.startMinutes && m < w.endMinutes) need = Math.max(need, w.minStaff);
      }
      minutes += need * slot;
    }
  }
  return minutes / 60;
}

// ── Đường nhu cầu trong ngày ────────────────────────────────────────────────
/** Nhu cầu riêng An Sushibar; cao điểm tối mỗi ngày. */
export type DemandBand = { startMinutes: number; endMinutes: number; level: number; label: string };

const band = (from: string, to: string, level: number, label: string): DemandBand => {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return { startMinutes: toMinutes(from), endMinutes: toMinutes(to), level, label };
};

const restaurantDemand = [band("10:30", "14:00", 1, "Buổi trưa"), band("14:00", "16:00", 0, "Có thể không bố trí nhân viên"), band("16:00", "17:00", 1, "Trước cao điểm"), band("17:00", "19:30", 2.5, "Cao điểm tối"), band("19:30", "21:00", 1, "Cuối ngày")];
export const DEMAND_PROFILE = { normal: restaurantDemand, saturday: restaurantDemand };

export function demandProfileOf(
  weekday: WeekdayKey,
  _weights: Record<WeekdayKey, number> = DAY_WEIGHTS,
): readonly DemandBand[] {
  // Evening peak applies every open day.
  return BUSY_DAYS.includes(weekday) ? DEMAND_PROFILE.saturday : DEMAND_PROFILE.normal;
}

/** Relative workload at a minute (1 outside all bands). */
export function workloadAt(
  minute: number,
  weekday: WeekdayKey,
  weights: Record<WeekdayKey, number> = DAY_WEIGHTS,
): number {
  return demandProfileOf(weekday, weights).find((b) => minute >= b.startMinutes && minute < b.endMinutes)?.level ?? 1;
}

/**
 * Số người mục tiêu cho từng 30 phút mở cửa:
 *   mục tiêu = giờ công của ngày × mức nhu cầu ÷ tổng mức cả ngày (tính theo phút).
 * Trả về [phút bắt đầu, số người mục tiêu].
 */
export function slotTargets(
  blocks: DayBlocks,
  weekday: WeekdayKey,
  targetHours: number,
  slot = 30,
  weights: Record<WeekdayKey, number> = DAY_WEIGHTS,
): [number, number][] {
  const slots: [number, number][] = [];
  for (const block of blocks) {
    for (let minute = block.startMinutes; minute < block.endMinutes; minute += slot) {
      slots.push([minute, workloadAt(minute, weekday, weights)]);
    }
  }
  const levelMinutes = slots.reduce((sum, [, level]) => sum + level * slot, 0);
  const scale = levelMinutes > 0 ? (targetHours * 60) / levelMinutes : 0;
  return slots.map(([minute, level]) => [minute, level * scale]);
}

export function validPause(shift: Shift): boolean {
  const start = shift.pauseStartMinutes;
  return start != null && shift.pauseMinutes > 0 && start > shift.startMinutes &&
    start + shift.pauseMinutes < shift.endMinutes && start - shift.startMinutes <= 360 &&
    shift.endMinutes - start - shift.pauseMinutes <= 360;
}

export function workingAt(shift: Shift, minute: number): boolean {
  return shift.startMinutes <= minute && shift.endMinutes > minute &&
    !(validPause(shift) && minute >= shift.pauseStartMinutes! && minute < shift.pauseStartMinutes! + shift.pauseMinutes);
}

export function coveragePoints(shifts: Shift[], from: number, to: number): number[] {
  return [...new Set([from, to, ...shifts.flatMap((s) => [s.startMinutes, s.endMinutes,
    ...(validPause(s) ? [s.pauseStartMinutes!, s.pauseStartMinutes! + s.pauseMinutes] : []),
  ]).filter((t) => t > from && t < to)])].sort((a, b) => a - b);
}

/**
 * Giờ công mục tiêu mỗi ngày, chuẩn hoá trong từng ISO-week (không mượn giữa các tuần).
 *
 * Hai bước:
 *  1. **Sàn phủ cửa** (floorOf): mỗi ngày mở phải có ít nhất 1 người suốt giờ
 *     mở, nên ngày nào cũng cần trước một số giờ CỐ ĐỊNH bằng số giờ mở cửa —
 *     không liên quan tới hệ số ngày. Bỏ qua bước này thì ngày vắng (T3) nhận
 *     quá ít giờ để phủ nổi, còn ngày đông nhận dư.
 *  2. Phần CÒN LẠI chia theo hệ số: giờ ngày = phần dư × (hệ số × phút mở) ÷ Σ(…).
 *
 * Nếu tổng giờ còn không đủ cho sàn (hợp đồng quá ít so với giờ mở), quay về
 * cách chia thuần theo hệ số. Không truyền openMinutesOf => chỉ theo hệ số.
 */
export function weightedDailyTargets(
  dates: string[],
  total: number,
  weekdayOf: (date: string) => WeekdayKey,
  openMinutesOf?: (date: string) => number,
  weights: Record<WeekdayKey, number> = DAY_WEIGHTS,
  floorOf?: (date: string) => number,
  /**
   * Kleinerer Sockel für den Fall, dass der volle nicht bezahlbar ist – in der
   * Regel „eine Person über die ganze Öffnungszeit". Im Nagelstudio wechselt
   * das Team, und in einem Monat mit nur drei Verträgen reichen die Stunden
   * nicht mehr für zwei Personen in der Hauptzeit. Ohne diese zweite Stufe
   * fällt die Verteilung auf reine Gewichtung zurück, und der schwächste Tag
   * bekommt dann weniger Stunden, als das ÖFFNEN allein kostet – der Laden
   * stünde zeitweise leer. Lieber überall offen als irgendwo voll.
   */
  fallbackFloorOf?: (date: string) => number,
): Map<string, number> {
  const factor = (date: string) => weights[weekdayOf(date)] * (openMinutesOf ? openMinutesOf(date) : 1);
  const sum = dates.reduce((acc, date) => acc + factor(date), 0);
  const share = (date: string, amount: number) => (sum > 0 ? amount * factor(date) / sum : 0);
  for (const sockel of [floorOf, fallbackFloorOf]) {
    if (!sockel) continue;
    const floors = new Map(dates.map((date) => [date, sockel(date)]));
    const floorSum = [...floors.values()].reduce((a, b) => a + b, 0);
    if (floorSum > 0 && floorSum < total) {
      const rest = total - floorSum;
      return new Map(dates.map((date) => [date, floors.get(date)! + share(date, rest)]));
    }
  }
  return new Map(dates.map((date) => [date, share(date, total)]));
}
