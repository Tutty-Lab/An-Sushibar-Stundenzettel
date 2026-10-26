import { RESTAURANT_POLICY, missingRestaurantRoles, isOptionalCoverageTime } from "./restaurantPolicy";
import { employeeForMonth } from "./history";
import type { Employee, PreferredWindow, Shift } from "../types";
import { DAY_WEIGHTS, datesOfMonth, parseIsoDate, weekdayKeyOf, type WeekdayKey } from "./demand";
import { monthlyTargetMinutesFor, weeklyBudgetMinutes, weeklyTargetMinutes } from "./contract";
import { calculatePause } from "./time";
import { mayWorkOn } from "./availability";
import { consecutiveRunLengthWith } from "./consecutive";
import { effectiveWeekdayKey, resolveDay, type DayBlocks, type DayWindow, type OverrideMap, type WorkHoursConfig } from "./workHours";
import { publicHolidays } from "./holidays";
import { weekStartOf } from "./weeks";
import { minutesOutsidePreferred, ownShiftRangeMinutes, preferredWindowsOf } from "./preferredWindows";
import {
  PEAK_END,
  PEAK_START,
  STAFFING_RULES,
  minimumStaffHours,
  slotTargets,
  staffingWindows,
  weightedDailyTargets,
  workingAt,
  workloadAt,
  type StaffingRule,
  type StaffingWindow,
} from "./staffing";

/**
 * Was an EINER Filiale anders ist: Tagesgewichte (welche Tage stark sind),
 * Besetzungsregeln und die Tage, an denen jemand schon im anderen Laden
 * eingeteilt ist. Wird durch alle Schritte gereicht, damit zwei Filialen sich
 * weder Regeln noch Zwischenergebnisse teilen.
 */
type Ctx = {
  roles: Map<string, Employee["workRole"]>;
  rules: readonly StaffingRule[];
  weights: Record<WeekdayKey, number>;
  /** employeeId -> Daten, an denen die Person im anderen Laden arbeitet. */
  blocked: Map<string, Set<string>>;
  /** Teil des Cache-Schlüssels, damit Filialen nicht dasselbe Tagesmodell nutzen. */
  tag: string;
  /** „Khung giờ ưu tiên" je employeeId – nur wer welche gesetzt hat. */
  windows: Map<string, PreferredWindow[]>;
};

type WeeklyInput = {
  year: number;
  month: number;
  workHours: WorkHoursConfig;
  overrides?: OverrideMap;
  employees: Employee[];
  holidays?: Set<string>;
  /** Besetzungsregeln dieser Filiale; fehlt = die Standardregeln. */
  rules?: readonly StaffingRule[];
  /** Tagesgewichte dieser Filiale; fehlt = DAY_WEIGHTS. */
  weights?: Record<WeekdayKey, number>;
  /** Wer im anderen Laden schon arbeitet: employeeId -> ISO-Daten. */
  blockedDays?: Record<string, readonly string[]>;
  /** Kennung der Filiale (nur für den internen Cache). */
  storeTag?: string;
};
type Option = { shifts: Shift[]; styleCost: number };
type Choice = { date: string; paid: number; option: Option };
type Allocation = { paid: number; cost: number; mask: number; choices: Choice[] };
type Day = ReturnType<typeof resolveDay>;

const SLOT = 30;
const MIN_SHIFT = 180;
/**
 * Angestrebte Dienstlänge. Früher wurde die Woche auf möglichst VIELE Tage
 * verteilt (Stunden ÷ 3 h) – heraus kamen 3-Stunden-Stafetten 9–12, 12–15,
 * 15–18 an fünf Tagen. Lieber weniger Tage mit ~5–6 h: weniger Anfahrten,
 * und eine Person trägt die Hauptzeit von Anfang bis Ende. 5 h statt 6 h: sonst
 * reichen die Personentage nicht für drei Leute an jedem Hauptzeit-Tag.
 */
const PREFERRED_SHIFT = 300;
/** Höchste bezahlte Zeit je Tag: 8 h (Vorgabe des Betriebs, siehe validation.ts). */
const MAX_PAID = 480;
/** Cost per (person deviation)² per 30-minute slot against the demand curve. */
const SLOT_DEVIATION_COST = 300;
/** Small preference for one continuous shift over a split shift on the same day. */
const SPLIT_SHIFT_COST = 8;
/**
 * „Khung giờ ưu tiên": Aufschlag je Arbeitsminute außerhalb der Wunschfenster.
 * Ein 3-h-Dienst an einem Tag ohne Fenster kostet 18.000 – mehr als die übliche
 * Abweichung vom Tagesziel (1.500 je Stunde²), damit der Wunsch nicht dem
 * Feinschliff der Kurve weicht. Fehlt eine Besetzungsregel über mehrere halbe
 * Stunden (je 15.000), geht sie trotzdem vor.
 */
const OUTSIDE_WINDOW_COST = 100;

function hash(value: string): number {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result;
}

function dayOf(date: string): WeekdayKey {
  return weekdayKeyOf(parseIsoDate(date));
}

const openMinutesOfBlocks = (blocks: DayBlocks) =>
  blocks.reduce((sum, block) => sum + (block.endMinutes - block.startMinutes), 0);

function fixedPaid(window: DayWindow): number {
  const presence = window.endMinutes - window.startMinutes;
  for (const pause of [0, 30, 60]) {
    const paid = presence - pause;
    if (paid > 0 && calculatePause(paid) === pause) return paid;
  }
  return 0;
}

/**
 * Valid pause starts (§ 4 ArbZG): at least 1 h after the start and before the
 * end, at most 6 h of work before and after the pause, on the 30-minute grid.
 */
function pauseStartCandidates(startMinutes: number, endMinutes: number, pauseMinutes: number): number[] {
  if (pauseMinutes <= 0) return [];
  return Array.from(
    { length: Math.max(0, Math.floor((endMinutes - pauseMinutes - 60 - (startMinutes + 60)) / SLOT) + 1) },
    (_, index) => startMinutes + 60 + index * SLOT,
  ).filter((start) => start - startMinutes <= 360 && endMinutes - start - pauseMinutes <= 360);
}

function makeShift(
  employeeId: string,
  date: string,
  startMinutes: number,
  paidMinutes: number,
  shiftType: "EARLY" | "LATE",
  effectiveWeekday: WeekdayKey | undefined,
  ctx: Ctx,
): Shift {
  const pauseMinutes = calculatePause(paidMinutes);
  const endMinutes = startMinutes + paidMinutes + pauseMinutes;
  const weekday = effectiveWeekday ?? dayOf(date);
  // First guess: quietest part of the demand curve, never the peak window.
  // improveCoverage later moves pauses by the REAL headcount of the day.
  const pauseStartMinutes = pauseMinutes > 0 ? pauseStartCandidates(startMinutes, endMinutes, pauseMinutes).sort((a, b) => {
    const score = (start: number) => Array.from({ length: pauseMinutes / SLOT }, (_, index) => start + index * SLOT)
      .reduce((sum, minute) => sum + workloadAt(minute, weekday, ctx.weights) + (minute >= PEAK_START && minute < PEAK_END ? 100 : 0), 0);
    return score(a) - score(b) || ((a / SLOT + hash(employeeId)) % 7) - ((b / SLOT + hash(employeeId)) % 7);
  })[0] : undefined;
  return {
    id: `weekly-${employeeId}-${date}-${startMinutes}-${paidMinutes}`,
    employeeId, date, startMinutes,
    endMinutes,
    ...(pauseStartMinutes == null ? {} : { pauseStartMinutes }),
    pauseMinutes, paidMinutes, shiftType, generated: true,
  };
}

/** Every start on the 30-minute grid inside the block (plus the block-end anchor). */
function startsInBlock(block: DayWindow, presence: number): number[] {
  const starts: number[] = [];
  for (let start = block.startMinutes; start + presence <= block.endMinutes; start += SLOT) starts.push(start);
  const endAnchored = block.endMinutes - presence;
  if (endAnchored >= block.startMinutes && !starts.includes(endAnchored)) starts.push(endAnchored);
  return starts;
}

function optionsFor(
  employee: Employee,
  date: string,
  paid: number,
  blocks: DayBlocks,
  partialWeek: boolean,
  effectiveWeekday: WeekdayKey | undefined,
  ctx: Ctx,
): Option[] {
  if (paid <= 0 || paid > MAX_PAID) return [];
  if (employee.fixedShift) {
    return fixedPaid(employee.fixedShift) === paid
      ? [{ shifts: [makeShift(employee.id, date, employee.fixedShift.startMinutes, paid, "EARLY", effectiveWeekday, ctx)], styleCost: 0 }]
      : [];
  }
  const options: Option[] = [];
  const add = (shifts: Shift[]) => options.push({ shifts, styleCost: (shifts.length - 1) * SPLIT_SHIFT_COST });
  const placements = (block: DayWindow, duration: number, early: boolean): Shift[] => {
    const presence = duration + calculatePause(duration);
    const mitte = (block.startMinutes + block.endMinutes) / 2;
    return startsInBlock(block, presence).map((start) =>
      makeShift(
        employee.id,
        date,
        start,
        duration,
        // Durchgehend offener Tag (ein Block): „früh" oder „spät" entscheidet
        // die LAGE der Schicht im Tag – sonst hiesse jede Schicht „Ca sáng".
        // Bei mehreren Blöcken zählt weiter der Block.
        blocks.length === 1 ? (start + presence / 2 <= mitte ? "EARLY" : "LATE") : early ? "EARLY" : "LATE",
        effectiveWeekday,
        ctx,
      ),
    );
  };

  blocks.forEach((block, index) => {
    for (const shift of placements(block, paid, index === 0 && block.startMinutes < 16 * 60)) add([shift]);
  });
  // Split shift: one part in the first block, one in the last; the lunch closure is unpaid.
  const minimumEvening = partialWeek ? 120 : MIN_SHIFT;
  if (paid >= MIN_SHIFT + minimumEvening && blocks.length >= 2) {
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    for (let morning = MIN_SHIFT; morning <= Math.min(paid - minimumEvening, first.endMinutes - first.startMinutes); morning += SLOT) {
      const evenings = placements(last, paid - morning, false);
      for (const early of placements(first, morning, true)) {
        for (const late of evenings) {
          if (early.endMinutes <= late.startMinutes) add([early, late]);
        }
      }
    }
  }
  // Ngày Chủ nhật & ngày mở liên tục (blocks.length === 1): nhân viên làm ca liên tục,
  // không có nghỉ trưa tách ca. Giờ nghỉ giải lao (pause) được xếp vào ca theo đúng luật.
  return options;
}

/**
 * Everything about a day that does not depend on the shifts, computed once:
 * the 30-minute slots of the open blocks, their target headcount (demand curve)
 * and, per staffing window, which slots it covers and for how many minutes.
 */
type DayModel = {
  minutes: number[];
  targets: number[];
  windows: { slots: number[]; overlap: number[]; minStaff: number; maxStaff: number }[];
};
const dayModelCache = new Map<string, DayModel>();
function dayModel(blocks: DayBlocks, weekday: WeekdayKey, targetHours: number, ctx: Ctx): DayModel {
  const key = `${ctx.tag}|${weekday}|${blocks.map((b) => `${b.startMinutes}-${b.endMinutes}`).join(",")}|${targetHours.toFixed(4)}`;
  const cached = dayModelCache.get(key);
  if (cached) return cached;
  const slotList = slotTargets(blocks, weekday, targetHours, SLOT, ctx.weights);
  const minutes = slotList.map(([minute]) => minute);
  const windows = staffingWindows(blocks, weekday, ctx.rules).map((window: StaffingWindow) => {
    const slots: number[] = [];
    const overlap: number[] = [];
    minutes.forEach((minute, index) => {
      const covered = Math.min(window.endMinutes, minute + SLOT) - Math.max(window.startMinutes, minute);
      if (covered > 0) { slots.push(index); overlap.push(covered); }
    });
    return { slots, overlap, minStaff: window.minStaff, maxStaff: window.maxStaff };
  });
  const model = { minutes, targets: slotList.map(([, target]) => target), windows };
  if (dayModelCache.size > 5000) dayModelCache.clear();
  dayModelCache.set(key, model);
  return model;
}

/**
 * Day cost from headcounts per 30-minute slot (shifts and pauses lie on that grid):
 *  - an EMPTY shop during opening hours costs ten times a normal shortfall,
 *  - staffing windows: every missing/extra person-minute costs 500,
 *  - demand curve: squared deviation from the slot target (smooth "mountain"),
 *  - paid hours: squared deviation from the day's weighted hours.
 *
 * Ohne den ersten Punkt sind beide Lücken gleich teuer, und der Planer holt
 * jemanden aus einer schwach besetzten Randstunde in die Hauptzeit – dann steht
 * niemand mehr im Laden. Offen mit einer Person ist immer besser als zu.
 */
function restaurantRoleShortage(shifts: Shift[], minute: number, ctx: Ctx): number {
 if(isOptionalCoverageTime(minute))return 0;
 // Generic fixtures without role data retain the ordinary headcount model.
 if (![...ctx.roles.values()].some(Boolean)) return 0;
 let kitchen=0, service=0, flexible=0;
 for (const shift of shifts) {
  if (!workingAt(shift,minute)) continue;
  const role=ctx.roles.get(shift.employeeId);
  if(role==="KITCHEN") kitchen++;
  else if(role==="SERVICE_SUSHI") service++;
  else if(role==="BOTH") flexible++;
 }
 return missingRestaurantRoles(kitchen,service,flexible);
}
function roleGapMinutes(shifts: Shift[], blocks: DayBlocks, ctx: Ctx): number {
 let total=0;
 for(const block of blocks) for(let minute=block.startMinutes;minute<block.endMinutes;minute+=SLOT)
  total+=restaurantRoleShortage(shifts,minute,ctx)*SLOT;
 return total;
}

function dayCost(shifts: Shift[], blocks: DayBlocks, weekday: WeekdayKey, targetHours: number | undefined, ctx: Ctx): number {
  if (blocks.length === 0) return 0;
  const model = dayModel(blocks, weekday, targetHours ?? 0, ctx);
  const counts = model.minutes.map((minute) => {
    let staff = 0;
    for (const shift of shifts) if (workingAt(shift, minute)) staff++;
    return staff;
  });
  // An Sushibar: kitchen and service must be staffed separately. Flexible staff
  // can fill either role, never both at the same time. Every open day needs an
  // extra person during 17:30–19:30.
  let cost = model.minutes.reduce((sum, minute) => sum + restaurantRoleShortage(shifts,minute,ctx) * SLOT * RESTAURANT_POLICY.missingRoleMinuteCost, 0);
  const mussBesetzt = new Set<number>();
  for (const window of model.windows) {
    for (let k = 0; k < window.slots.length; k++) {
      const staff = counts[window.slots[k]];
      cost += (Math.max(0, window.minStaff - staff) + Math.max(0, staff - window.maxStaff)) * window.overlap[k] * (window.minStaff >= RESTAURANT_POLICY.peakStaff ? RESTAURANT_POLICY.peakMissingMinuteCost : 500);
      if (window.minStaff > 0) mussBesetzt.add(window.slots[k]);
    }
  }
  // Count empty opening slots once, independently of overlapping coverage rules.
  for (const slot of mussBesetzt) if (counts[slot] === 0) cost += SLOT * RESTAURANT_POLICY.emptyMinuteCost;
  for (let i = 0; i < counts.length; i++) cost += (counts[i] - model.targets[i]) ** 2 * SLOT_DEVIATION_COST;
  const paidHours = shifts.reduce((sum, shift) => sum + shift.paidMinutes, 0) / 60;
  cost += (paidHours - (targetHours ?? 0)) ** 2 * RESTAURANT_POLICY.balanceHourCost;
  for (const shift of shifts) {
    const windows = ctx.windows.get(shift.employeeId);
    if (windows) cost += minutesOutsidePreferred(windows, dayOf(shift.date), shift) * OUTSIDE_WINDOW_COST;
  }
  return cost;
}

function dayLimit(employee: Employee): number {
  return Math.min(6, employee.maxDaysPerWeek ?? 6);
}

/**
 * Woche einer Person planen. Mit „Độ dài ca" zuerst nur in dieser Länge; reicht
 * das für das Wochensoll nicht, gilt die Standardlänge (die Regel ist weich).
 */
function chooseWeek(
  employee: Employee,
  dates: string[],
  target: number,
  existing: Shift[],
  days: Map<string, Day>,
  holidays: Set<string>,
  dailyTargets: Map<string, number>,
  ctx: Ctx,
): Choice[] {
  const own = employee.fixedShift ? null : ownShiftRangeMinutes(employee);
  const withOwn = chooseWeekWith(employee, dates, target, existing, days, holidays, dailyTargets, ctx, own);
  if (!own) return withOwn;
  const paidOf = (choices: Choice[]) => choices.reduce((sum, choice) => sum + choice.paid, 0);
  if (paidOf(withOwn) >= target) return withOwn;
  const plain = chooseWeekWith(employee, dates, target, existing, days, holidays, dailyTargets, ctx, null);
  return paidOf(plain) > paidOf(withOwn) ? plain : withOwn;
}

function chooseWeekWith(
  employee: Employee,
  dates: string[],
  target: number,
  existing: Shift[],
  days: Map<string, Day>,
  holidays: Set<string>,
  dailyTargets: Map<string, number>,
  ctx: Ctx,
  own: { min: number; max: number } | null,
): Choice[] {
  // Wer an diesem Tag schon im anderen Laden steht, ist hier nicht verfügbar –
  // die Läden liegen weit auseinander, zwei Dienste am selben Tag gehen nicht.
  const busy = ctx.blocked.get(employee.id);
  const eligible = dates.filter((date) => mayWorkOn(employee, date) && !busy?.has(date));
  const limit = Math.min(dayLimit(employee), eligible.length);
  if (target <= 0 || limit <= 0) return [];
  const fixed = employee.fixedShift ? fixedPaid(employee.fixedShift) : 0;
  if (employee.fixedShift && fixed === 0) return [];
  // Mit „Độ dài ca" folgt die Tageszahl der Wunschlänge; „Rải đều" nimmt das
  // kurze Ende (mehr, dafür kürzere Tage).
  const ownCount = own
    ? employee.spreadEvenly
      ? Math.floor(target / own.min)
      : Math.round(target / ((own.min + own.max) / 2))
    : 0;
  const preferredCount = fixed
    ? Math.min(limit, Math.floor(target / fixed))
    : own
      ? Math.min(limit, Math.max(1, ownCount))
      : Math.min(limit, Math.max(1, Math.ceil(target / PREFERRED_SHIFT - 1e-9)));

  // ±1,5 h um den Durchschnitt: genug Spielraum, damit Stoßtage (Gewicht 1,5)
  // längere und Normaltage kürzere Dienste bekommen können.
  const base = Math.round(target / Math.max(1, preferredCount) / SLOT) * SLOT;
  let lo = Math.max(MIN_SHIFT, base - 3 * SLOT);
  let hi = Math.min(MAX_PAID, base + 3 * SLOT);
  while (hi * preferredCount < target && hi < MAX_PAID) hi += SLOT;
  while (lo * preferredCount > target && lo > MIN_SHIFT) lo -= SLOT;

  const durations = new Set<number>();
  if (fixed) durations.add(fixed);
  else if (own) {
    for (let duration = own.min; duration <= own.max; duration += SLOT) {
      if (duration <= target) durations.add(duration);
    }
  } else if (target < MIN_SHIFT) durations.add(target);
  else {
    for (let duration = lo; duration <= hi; duration += SLOT) {
      if (duration <= target) durations.add(duration);
    }
  }

  const worked = new Set(existing.filter((shift) => shift.employeeId === employee.id).map((shift) => shift.date));
  const validMasks = new Map<number, boolean>();
  const valid = (mask: number) => {
    const cached = validMasks.get(mask);
    if (cached != null) return cached;
    const set = new Set(worked);
    let ok = true;
    eligible.forEach((date, index) => {
      if ((mask & (1 << index)) === 0) return;
      if (consecutiveRunLengthWith(set, date) > 6) ok = false;
      set.add(date);
    });
    validMasks.set(mask, ok);
    return ok;
  };

  // Ideale Dienstlänge je Tag folgt demselben Faktor wie das Tagesziel
  // (Gewicht × Öffnungsdauer, Tab „Tài liệu") – bei gleicher Wochensumme.
  const factorOf = (date: string) =>
    ctx.weights[effectiveWeekdayKey(date, holidays)] * openMinutesOfBlocks(days.get(date)!.blocks);
  const averageFactor = eligible.reduce((sum, date) => sum + factorOf(date), 0) / eligible.length;

  let states = new Map<number, Allocation>([[0, { paid: 0, cost: 0, mask: 0, choices: [] }]]);
  for (let index = 0; index < eligible.length; index++) {
    const date = eligible[index];
    const day = days.get(date)!;
    const occupied = existing.filter((shift) => shift.date === date);
    const weekday = effectiveWeekdayKey(date, holidays);
    const ideal = averageFactor > 0 ? target / Math.max(1, preferredCount) * factorOf(date) / averageFactor : 0;
    const before = dayCost(occupied, day.blocks, weekday, dailyTargets.get(date), ctx);
    const candidates: { choice: Choice; cost: number }[] = [];
    // Explore 3–8 paid hours for continuous restaurant opening days.
    const continuous = day.blocks.length === 1 && !fixed && !own && target >= MIN_SHIFT;
    const dayDurations = continuous
      ? Array.from({ length: Math.floor((Math.min(MAX_PAID, target) - MIN_SHIFT) / SLOT) + 1 }, (_, i) => MIN_SHIFT + i * SLOT)
      : [...durations];
    const lengthCost = continuous ? 40 : 300;
    for (const paid of dayDurations) {
      let best: Option | undefined;
      let score = Infinity;
      for (const option of optionsFor(employee, date, paid, day.blocks, dates.length < 6, weekday, ctx)) {
        const cost = dayCost([...occupied, ...option.shifts], day.blocks, weekday, dailyTargets.get(date), ctx) - before + option.styleCost;
        if (cost < score) { best = option; score = cost; }
      }
      if (best) candidates.push({
        choice: { date, paid, option: best },
        cost: score + ((paid - ideal) / SLOT) ** 2 * lengthCost,
      });
    }
    const next = new Map(states);
    for (const state of states.values()) {
      if (state.choices.length >= limit) continue;
      const mask = state.mask | (1 << index);
      if (!valid(mask)) continue;
      for (const candidate of candidates) {
        const paid = state.paid + candidate.choice.paid;
        if (paid > target) continue;
        const key = paid * 128 + mask;
        const cost = state.cost + candidate.cost;
        if (cost >= (next.get(key)?.cost ?? Infinity)) continue;
        next.set(key, { paid, cost, mask, choices: [...state.choices, candidate.choice] });
      }
    }
    states = next;
  }
  // Exact weekly minutes take priority. An impossible quota stays short and
  // is reported by validation, never transferred to another week.
  // Feiertagspflicht (requiredOnHolidays): wer an Feiertagen im Dienst sein
  // muss, verliert diesen Tag nicht an eine sonst leicht bessere Verteilung.
  // Unmöglich (Feiertag vor Eintritt, Laden zu) bleibt folgenlos.
  const requiredIndexes = employee.requiredOnHolidays
    ? eligible.map((date, index) => (holidays.has(date) ? index : -1)).filter((index) => index >= 0)
    : [];
  const missingRequired = (mask: number) =>
    requiredIndexes.filter((index) => (mask & (1 << index)) === 0).length;

  let best: Allocation | undefined;
  let bestCost = Infinity;
  for (const state of states.values()) {
    // Vollzeit „thường 6 ngày/tuần": die Tageszahl hält, die Länge je Tag folgt dem Gewicht.
    const cost = state.cost + (state.choices.length - preferredCount) ** 2 * 50000 + missingRequired(state.mask) * 500000;
    if (!best || state.paid > best.paid || (state.paid === best.paid && cost < bestCost)) {
      best = state;
      bestCost = cost;
    }
  }
  return best?.choices ?? [];
}

/**
 * Nachschlag: die letzten Rest-Minuten an bestehende Dienste hängen.
 *
 * Das Monats-Soll wird je ISO-Woche verteilt und dort exakt geplant. Was beim
 * Runden auf das 30-Minuten-Raster übrig bleibt (oft 30–120 min), konnte bisher
 * nirgendwo mehr unterkommen und endete als Warnung „zu wenig geplant". Hier
 * wächst deshalb zum Schluss ein passender Dienst um 30 Minuten – solange
 * Tagesgrenze, Öffnungsblock und (bei Wochenverträgen) das Wochenbudget das
 * hergeben. Gewählt wird die Stelle, die der Nachfragekurve am wenigsten
 * schadet.
 */
function topUpShortfalls(
  result: Shift[],
  employees: Employee[],
  days: Map<string, Day>,
  holidays: Set<string>,
  dailyTargets: Map<string, number>,
  targets: Map<string, number>,
  weeklyCaps: Map<string, Map<string, number>>,
  weeklyTargets: Map<string, Map<string, number>>,
  ctx: Ctx,
): Shift[] {
  let shifts = [...result];
  for (const employee of employees) {
    if (employee.fixedShift) continue; // feste Schicht bleibt unangetastet
    const target = targets.get(employee.id) ?? 0;
    const paidOf = (list: Shift[]) => list.reduce((sum, shift) => sum + shift.paidMinutes, 0);
    // „Độ dài ca": lieber einen Tag wachsen lassen, der danach noch darin liegt.
    const ownMax = ownShiftRangeMinutes(employee)?.max;
    let guard = 0;
    while (guard++ < 60) {
      const own = shifts.filter((shift) => shift.employeeId === employee.id);
      if (target - paidOf(own) < SLOT) break;
      let best: { old: Shift; next: Shift; cost: number; over: boolean } | undefined;
      for (const shift of own) {
        const day = days.get(shift.date);
        if (!day || day.closed) continue;
        const block = day.blocks.find(
          (candidate) => shift.startMinutes >= candidate.startMinutes && shift.endMinutes <= candidate.endMinutes,
        );
        if (!block) continue;
        const sameDay = own.filter((other) => other.date === shift.date);
        if (paidOf(sameDay) + SLOT > MAX_PAID) continue;
        const over = ownMax != null && paidOf(sameDay) + SLOT > ownMax;
        const paid = shift.paidMinutes + SLOT;
        if (paid > MAX_PAID) continue;
        const week = weekStartOf(shift.date);
        const cap = weeklyCaps.get(employee.id)?.get(week);
        if (cap != null) {
          const inWeek = own.filter((other) => weekStartOf(other.date) === week);
          if (paidOf(inWeek) + SLOT > cap) continue;
        }
        const presence = paid + calculatePause(paid);
        const weekday = effectiveWeekdayKey(shift.date, holidays);
        const onDay = shifts.filter((other) => other.date === shift.date);
        const others = onDay.filter((other) => other !== shift);
        const before = dayCost(onDay, day.blocks, weekday, dailyTargets.get(shift.date), ctx);
        for (const start of [shift.startMinutes, shift.endMinutes - presence, block.endMinutes - presence]) {
          if (start < block.startMinutes || start + presence > block.endMinutes) continue;
          const grown = makeShift(employee.id, shift.date, start, paid, shift.shiftType === "EARLY" ? "EARLY" : "LATE", weekday, ctx);
          const clash = sameDay.some(
            (other) => other !== shift && other.startMinutes < grown.endMinutes && grown.startMinutes < other.endMinutes,
          );
          if (clash) continue;
          // Keep rounding leftovers near the employee's apportioned weekly target.
          // A full week receives comparable hours; partial/vacation weeks receive less.
          const weekPaid = paidOf(own.filter((other) => weekStartOf(other.date) === week));
          const weekTarget = weeklyTargets.get(employee.id)?.get(week) ?? weekPaid;
          const balanceCost = (((weekPaid + SLOT - weekTarget) / 60) ** 2 - ((weekPaid - weekTarget) / 60) ** 2) * 30000;
          const cost = dayCost([...others, grown], day.blocks, weekday, dailyTargets.get(shift.date), ctx) - before + balanceCost;
          if (!best || (best.over && !over) || (best.over === over && cost < best.cost)) {
            best = { old: shift, next: grown, cost, over };
          }
        }
      }
      if (!best) break;
      shifts = shifts.map((shift) => (shift === best!.old ? best!.next : shift));
    }
  }
  return shifts;
}
/**
 * Stundentausch ZWISCHEN zwei Personen – der Schritt, den improveCoverage nicht
 * kann, weil es die bezahlte Zeit jeder Person je Tag festhält.
 *
 * Typischer Fall im Studio: am Tag sind 16,5 h verplant, gebraucht werden 14 h,
 * und trotzdem fehlt von 18:30 bis 19:00 die zweite Person – weil die halbe
 * Stunde bei jemandem liegt, der schon um 12 Uhr anfängt. Ein Tausch von 30
 * Minuten zwischen A und B an einem knappen Tag, zurückgetauscht an einem
 * anderen Tag DERSELBEN Woche, lässt beide Wochen- und Monatssummen unberührt
 * und schließt die Lücke.
 *
 * Gesucht wird nur dort, wo wirklich jemand fehlt (unterbesetzte Tage), sonst
 * wäre die Paarsuche zu teuer.
 */
/** Mögliche Tauschmengen: 30' bis zur ganzen Schicht des Gebers. */
function tradeAmounts(giverPaid: number, takerBackPaid: number): number[] {
  const out: number[] = [];
  for (let menge = SLOT; menge <= Math.min(giverPaid, takerBackPaid); menge += SLOT) {
    const giverRest = giverPaid - menge;
    const takerRest = takerBackPaid - menge;
    if ((giverRest === 0 || giverRest >= MIN_SHIFT) && (takerRest === 0 || takerRest >= MIN_SHIFT)) out.push(menge);
  }
  return out;
}

function tradeMinutes(
  result: Shift[],
  employees: Employee[],
  days: Map<string, Day>,
  holidays: Set<string>,
  dailyTargets: Map<string, number>,
  ctx: Ctx,
): Shift[] {
  const open = [...days].filter(([, day]) => !day.closed);
  const byWeek = new Map<string, string[]>();
  for (const [date] of open) byWeek.set(weekStartOf(date), [...(byWeek.get(weekStartOf(date)) ?? []), date]);
  const movable = employees.filter((employee) => !employee.fixedShift);
  if (movable.length < 2) return result;
  let current = result;

  const costOf = (shifts: Shift[], date: string): number =>
    dayCost(shifts.filter((s) => s.date === date), days.get(date)!.blocks,
      effectiveWeekdayKey(date, holidays), dailyTargets.get(date), ctx);

  /** Fehlt an diesem Tag irgendwo jemand gegenüber der Untergrenze? */
  const understaffed = (shifts: Shift[], date: string): boolean => {
    const onDay = shifts.filter((s) => s.date === date);
    if(roleGapMinutes(onDay,days.get(date)!.blocks,ctx)>0) return true;
    for (const window of staffingWindows(days.get(date)!.blocks, effectiveWeekdayKey(date, holidays), ctx.rules)) {
      for (let minute = window.startMinutes; minute < window.endMinutes; minute += SLOT) {
        let staff = 0;
        for (const shift of onDay) if (workingAt(shift, minute)) staff++;
        if (staff < window.minStaff) return true;
      }
    }
    return false;
  };

  /**
   * Beste Lage für BEIDE Personen an einem Tag, gemeinsam gesucht. Nacheinander
   * zu legen reicht nicht: wer zuerst dran ist, sieht den anderen noch nicht und
   * stopft das Loch, das der andere ohnehin füllt.
   */
  const placePair = (
    date: string,
    first: Employee, firstPaid: number,
    second: Employee, secondPaid: number,
    others: Shift[],
  ): Shift[] | undefined => {
    const day = days.get(date)!;
    const weekday = effectiveWeekdayKey(date, holidays);
    const partialWeek = (byWeek.get(weekStartOf(date))?.length ?? 0) < 6;
    // Bezahlte Zeit 0 = der Dienst entfällt an diesem Tag (eine leere Wahl).
    const leer: Option[] = [{ shifts: [], styleCost: 0 }];
    const optionsA = firstPaid === 0 ? leer : optionsFor(first, date, firstPaid, day.blocks, partialWeek, weekday, ctx);
    const optionsB = secondPaid === 0 ? leer : optionsFor(second, date, secondPaid, day.blocks, partialWeek, weekday, ctx);
    if (optionsA.length === 0 || optionsB.length === 0) return undefined;
    let best: Shift[] | undefined;
    let bestCost = Infinity;
    for (const a of optionsA) {
      for (const b of optionsB) {
        const shifts = [...a.shifts, ...b.shifts];
        const cost = dayCost([...others, ...shifts], day.blocks, weekday, dailyTargets.get(date), ctx)
          + a.styleCost + b.styleCost;
        if (cost < bestCost) { bestCost = cost; best = shifts; }
      }
    }
    return best;
  };

  /** Steht der Laden an diesem Tag zeitweise leer? */
  const leerAm = (shifts: Shift[], date: string): boolean =>
    leerMinuten(shifts.filter((s) => s.date === date), days.get(date)!.blocks) > 0;

  const paidOf = (shifts: Shift[], id: string, date: string): number =>
    shifts.filter((s) => s.employeeId === id && s.date === date).reduce((sum, s) => sum + s.paidMinutes, 0);

  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    for (const [weekStart, weekDates] of byWeek) {
      void weekStart;
      for (const needy of weekDates) {
        if (!understaffed(current, needy)) continue;
        // Zuerst der einfache Fall: EINE Person holt Zeit von einem anderen Tag
        // derselben Woche auf den knappen Tag. Das ist der einzige Schritt, der
        // die STUNDENSUMME eines Tages ändert – der Tausch unten verschiebt nur
        // zwischen Personen. Ohne ihn bleibt ein Tag mit 10,0 h für 10,5 h
        // Öffnungszeit unterbesetzt, egal wie man die Dienste legt.
        for (const person of movable) {
          // Auch wer am knappen Tag noch GAR NICHT arbeitet, darf Zeit dorthin
          // mitnehmen (am Monatsende reicht sonst oft niemand) – aber nur, wenn
          // er dort arbeiten darf und die Tage je Woche nicht überschritten werden.
          if (!paidOf(current, person.id, needy) && (!mayWorkOn(person, needy) || ctx.blocked.get(person.id)?.has(needy))) continue;
          // Ein MONATSvertrag darf Zeit aus einer anderen Woche holen – nötig für
          // eine Rumpfwoche am Monatsende (z. B. nur Montag, der 30.). Ein
          // Wochenvertrag bleibt in seiner Woche.
          const quellen = person.weeklyHours == null && weekDates.length < 6 && leerAm(current, needy)
            ? open.map(([date]) => date)
            : weekDates;
          for (const quelle of quellen) {
            if (quelle === needy) continue;
            const gleicheWoche = weekDates.includes(quelle);
            // Nach jedem angenommenen Schritt NEU lesen – sonst rechnet der nächste
            // Schritt mit dem alten Stand und verliert Minuten.
            const aufTag = paidOf(current, person.id, needy);
            const arbeitstage = new Set(current.filter((s) => s.employeeId === person.id && weekDates.includes(s.date)).map((s) => s.date)).size;
            const abgeben = paidOf(current, person.id, quelle);
            if (!abgeben) continue;
            for (const menge of tradeAmounts(abgeben, aufTag + MAX_PAID)) {
              if (aufTag + menge > MAX_PAID) break;
              if (!aufTag && aufTag + menge < MIN_SHIFT) continue;
              if (!aufTag && (!gleicheWoche || abgeben - menge > 0) && arbeitstage + 1 > dayLimit(person)) continue;
              const rest = current.filter(
                (s) => !(s.employeeId === person.id && (s.date === needy || s.date === quelle)),
              );
              const worked = new Set(rest.filter(s => s.employeeId === person.id).map(s => s.date));
              if (abgeben - menge > 0) worked.add(quelle);
              if (consecutiveRunLengthWith(worked, needy) > 6) continue;
              const vorher = costOf(current, needy) + costOf(current, quelle);
              const mehr = placePair(needy, person, aufTag + menge, person, 0, rest.filter((s) => s.date === needy));
              const weniger = placePair(quelle, person, abgeben - menge, person, 0, rest.filter((s) => s.date === quelle));
              if (!mehr || !weniger) continue;
              let nachher = [...rest, ...mehr, ...weniger];
              // Die zusätzliche Zeit hilft oft erst, wenn die ANDEREN an dem Tag
              // mitrücken (Loch um 9:00, die neue Stunde landet sonst am Nachmittag).
              if (leerAm(nachher, needy) && costOf(nachher, needy) + costOf(nachher, quelle) >= vorher - 0.01) {
                nachher = improveCoverage(nachher, employees, days, holidays, dailyTargets, ctx, new Set([needy, quelle]));
              }
              if (costOf(nachher, needy) + costOf(nachher, quelle) < vorher - 0.01) {
                current = nachher;
                changed = true;
                break;
              }
            }
          }
        }
        for (const giver of movable) {
          for (const taker of movable) {
            if (giver === taker) continue;
            if (!paidOf(current, giver.id, needy) || !paidOf(current, taker.id, needy)) continue;
            for (const back of weekDates) {
              if (back === needy) continue;
              // Beide müssen an beiden Tagen schon arbeiten – hier entstehen
              // keine neuen Arbeitstage (sonst kippen Ruhetage und Wochenrhythmus).
              if (!paidOf(current, giver.id, back) || !paidOf(current, taker.id, back)) continue;
              // Getauscht werden 30 Minuten bis zur ganzen Schicht: manchmal muss
              // ein 3-Stunden-Dienst ganz weichen, damit ein anderer lang genug
              // wird, um die Hauptzeit von Anfang bis Ende zu tragen.
              for (const menge of tradeAmounts(paidOf(current, giver.id, needy), paidOf(current, taker.id, back))) {
              const amounts = [
                paidOf(current, giver.id, needy) - menge,
                paidOf(current, taker.id, needy) + menge,
                paidOf(current, giver.id, back) + menge,
                paidOf(current, taker.id, back) - menge,
              ];
              if (amounts.some((paid) => paid > MAX_PAID)) continue;
              // 0 heisst: der Dienst entfällt an diesem Tag; sonst gilt die
              // Mindestlänge.
              if (amounts.some((paid) => paid !== 0 && paid < MIN_SHIFT)) continue;
              const rest = current.filter(
                (s) => !((s.employeeId === giver.id || s.employeeId === taker.id) && (s.date === needy || s.date === back)),
              );
              const vorher = costOf(current, needy) + costOf(current, back);
              const neu: Shift[] = [];
              let moeglich = true;
              for (const [date, firstPaid, secondPaid] of [
                [needy, amounts[1], amounts[0]],
                [back, amounts[2], amounts[3]],
              ] as const) {
                const paare = date === needy
                  ? placePair(date, taker, firstPaid, giver, secondPaid, rest.filter((s) => s.date === date))
                  : placePair(date, giver, firstPaid, taker, secondPaid, rest.filter((s) => s.date === date));
                if (!paare) { moeglich = false; break; }
                neu.push(...paare);
              }
              if (!moeglich) continue;
              const nachher = [...rest, ...neu];
              if (costOf(nachher, needy) + costOf(nachher, back) < vorher - 0.01) {
                current = nachher;
                changed = true;
                break;
              }
              }
            }
          }
        }
      }
    }
    if (!changed) break;
  }
  return current;
}

/**
 * Final per-day polish, keeping every person's paid minutes for the day:
 *  1. move a person's shift(s) to a better start (all 30-minute options),
 *  2. move each pause to the valid pause start that fits the REAL headcount –
 *     pauses chosen only by the demand curve all landed on the same hour
 *     (Sunday: 4 people 14–15 h, 5 people 15–16 h → dip, then a jump at 16 h).
 */
/** Minuten der Öffnungszeit, in denen NIEMAND im Laden ist. */
function leerMinuten(shifts: Shift[], blocks: DayBlocks): number {
  let leer = 0;
  for (const block of blocks) {
    for (let minute = block.startMinutes; minute < block.endMinutes; minute += SLOT) {
      if (!shifts.some((shift) => workingAt(shift, minute))) leer += SLOT;
    }
  }
  return leer;
}

/**
 * Tageskosten, nachdem jede Pause einmal auf ihren besten Platz geschoben
 * wurde. Nur zum BEWERTEN einer Schichtlage – die Pausen selbst rückt der
 * eigene Durchgang weiter unten.
 */
function costWithBestPauses(
  shifts: Shift[],
  blocks: DayBlocks,
  weekday: WeekdayKey,
  target: number | undefined,
  ctx: Ctx,
): number {
  let aktuell = shifts;
  for (let i = 0; i < aktuell.length; i++) {
    const shift = aktuell[i];
    if (shift.pauseMinutes <= 0) continue;
    const others = aktuell.filter((_, k) => k !== i);
    let bestCost = dayCost(aktuell, blocks, weekday, target, ctx);
    let best: Shift | undefined;
    for (const start of pauseStartCandidates(shift.startMinutes, shift.endMinutes, shift.pauseMinutes)) {
      if (start === shift.pauseStartMinutes) continue;
      const moved = { ...shift, pauseStartMinutes: start };
      const cost = dayCost([...others, moved], blocks, weekday, target, ctx);
      if (cost < bestCost - 1e-9) { best = moved; bestCost = cost; }
    }
    if (best) aktuell = aktuell.map((s, k) => (k === i ? best! : s));
  }
  return dayCost(aktuell, blocks, weekday, target, ctx);
}

function improveCoverage(result: Shift[], employees: Employee[], days: Map<string, Day>, holidays: Set<string>, dailyTargets: Map<string, number>, ctx: Ctx, only?: Set<string>): Shift[] {
  const output: Shift[] = [];
  for (const [date, day] of days) {
    let onDay = result.filter((shift) => shift.date === date);
    if (only && !only.has(date)) { output.push(...onDay); continue; }
    const weekday = effectiveWeekdayKey(date, holidays);
    const target = dailyTargets.get(date);
    const partialWeek = [...days].filter(([otherDate, otherDay]) => !otherDay.closed && weekStartOf(otherDate) === weekStartOf(date)).length < 6;
    for (let pass = 0; pass < 4; pass++) {
      const baseline = dayCost(onDay, day.blocks, weekday, target, ctx);
      let changed = false;
      for (const employee of employees) {
        const own = onDay.filter((shift) => shift.employeeId === employee.id);
        if (own.length === 0) continue;
        const paid = own.reduce((sum, shift) => sum + shift.paidMinutes, 0);
        const others = onDay.filter((shift) => shift.employeeId !== employee.id);
        // Steht der Laden zeitweise leer, muss die Lage der Schicht ZUSAMMEN
        // mit den Pausen der anderen bewertet werden: eine Person früher
        // anfangen zu lassen hilft nur, wenn die Pause der zweiten Person
        // gleichzeitig dorthin rutscht, wo die erste noch da ist. Nacheinander
        // betrachtet ist jeder Schritt für sich wertlos, und der Planer bleibt
        // auf dem Loch sitzen.
        const preis = (shifts: Shift[]): number =>
          leerMinuten(shifts, day.blocks) > 0
            ? costWithBestPauses(shifts, day.blocks, weekday, target, ctx)
            : dayCost(shifts, day.blocks, weekday, target, ctx);
        let bestCost = preis(onDay);
        let best: Shift[] | undefined;
        for (const option of optionsFor(employee, date, paid, day.blocks, partialWeek, weekday, ctx)) {
          const cost = preis([...others, ...option.shifts]);
          if (cost < bestCost - 1e-9) { best = option.shifts; bestCost = cost; }
        }
        if (best) { onDay = [...others, ...best]; changed = true; }
      }
      for (let i = 0; i < onDay.length; i++) {
        const shift = onDay[i];
        if (shift.pauseMinutes <= 0) continue;
        const others = onDay.filter((_, k) => k !== i);
        let bestCost = dayCost(onDay, day.blocks, weekday, target, ctx);
        let best: Shift | undefined;
        for (const start of pauseStartCandidates(shift.startMinutes, shift.endMinutes, shift.pauseMinutes)) {
          if (start === shift.pauseStartMinutes) continue;
          const moved = { ...shift, pauseStartMinutes: start };
          const cost = dayCost([...others, moved], day.blocks, weekday, target, ctx);
          if (cost < bestCost - 1e-9) { best = moved; bestCost = cost; }
        }
        if (best) { onDay = [...others.slice(0, i), best, ...others.slice(i)]; changed = true; }
      }
      // Continuous days (CN/lễ): hand over the closing role. With 9 h shifts the
      // closers can only start at noon, so nobody ramps up before the lunch peak;
      // a single-person move never sees "B closes instead, A starts earlier".
      if (day.blocks.length === 1) {
        const blockEnd = day.blocks[0].endMinutes;
        const byId = new Map(employees.map((employee) => [employee.id, employee] as const));
        for (const closer of onDay.filter((shift) => shift.endMinutes === blockEnd)) {
          for (const other of onDay.filter((shift) => shift.endMinutes !== blockEnd)) {
            if (!onDay.includes(closer) || !onDay.includes(other)) continue;
            const empA = byId.get(closer.employeeId);
            const empB = byId.get(other.employeeId);
            if (!empA || !empB || empA.fixedShift || empB.fixedShift) continue;
            const rest = onDay.filter((shift) => shift !== closer && shift !== other);
            const newClosers = optionsFor(empB, date, other.paidMinutes, day.blocks, partialWeek, weekday, ctx)
              .filter((option) => option.shifts[option.shifts.length - 1].endMinutes === blockEnd);
            if (newClosers.length === 0) continue;
            const movesA = optionsFor(empA, date, closer.paidMinutes, day.blocks, partialWeek, weekday, ctx);
            let bestCost = dayCost(onDay, day.blocks, weekday, target, ctx);
            let best: Shift[] | undefined;
            for (const optionB of newClosers) for (const optionA of movesA) {
              const cost = dayCost([...rest, ...optionB.shifts, ...optionA.shifts], day.blocks, weekday, target, ctx);
              if (cost < bestCost - 1e-9) { best = [...optionB.shifts, ...optionA.shifts]; bestCost = cost; }
            }
            if (best) { onDay = [...rest, ...best]; changed = true; }
          }
        }
      }
      if (!changed || dayCost(onDay, day.blocks, weekday, target, ctx) >= baseline) break;
    }
    output.push(...onDay);
  }
  return output;
}

export function generateWeeklySchedule(input: WeeklyInput, existing: Shift[] = []): Shift[] {
  input = { ...input, employees: input.employees.map((e) => employeeForMonth(e, `${input.year}-${String(input.month).padStart(2, "0")}`)) };
  input = { ...input, employees: input.employees.filter((e) => !e.isOwner) };
  const ctx: Ctx = {
    roles: new Map(input.employees.map(e=>[e.id,e.workRole])),
    rules: input.rules ?? STAFFING_RULES,
    weights: input.weights ?? DAY_WEIGHTS,
    blocked: new Map(Object.entries(input.blockedDays ?? {}).map(([id, dates]) => [id, new Set(dates)])),
    tag: input.storeTag ?? "default",
    windows: new Map(
      input.employees
        .map((employee) => [employee.id, preferredWindowsOf(employee)] as const)
        .filter(([, windows]) => windows.length > 0),
    ),
  };
  const holidays = input.holidays ?? publicHolidays(input.year);
  const days = new Map(datesOfMonth(input.year, input.month).map((date) => [
    date, resolveDay(input.workHours, date, holidays, input.overrides ?? {}),
  ]));
  const openDates = [...days].filter(([, day]) => !day.closed).map(([date]) => date);
  const byWeek = new Map<string, string[]>();
  for (const date of openDates) {
    const week = weekStartOf(date);
    byWeek.set(week, [...(byWeek.get(week) ?? []), date]);
  }
  const weekInfo = [...byWeek].map(([weekStart, weekDates]) => ({ weekStart, openDays: weekDates.length }));
  const weeks = [...byWeek].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const typeRank = (employee: Employee) => employee.employmentType === "VOLLZEIT" ? 0 : employee.employmentType === "TEILZEIT" ? 1 : 2;
  // Place constrained availability first, so regular staff can cover around it.
  const availableCount = (employee: Employee) => openDates.filter(date => mayWorkOn(employee,date) && !ctx.blocked.get(employee.id)?.has(date)).length;
  const employees = [...input.employees].sort((a, b) =>
    Number(Boolean(b.fixedShift)) - Number(Boolean(a.fixedShift)) || availableCount(a) - availableCount(b) || typeRank(a) - typeRank(b) || a.id.localeCompare(b.id),
  );
  let result = [...existing];
  const monthDates = [...days.keys()];
  const monthBounds = { first: monthDates[0], last: monthDates[monthDates.length - 1] };
  // Wochenbudget je Person: Wochenvertrag × Anteil der Woche in diesem Monat nach
  // Tagesgewicht (contract.ts) – Randtage am Monatsende werden nicht überbesetzt.
  // Ohne Wochenvertrag: Monats-Soll nach offenen Tagen (ab Eintritt) verteilt.
  const budgets = new Map(employees.map((employee) => {
    if (employee.weeklyHours != null) return [employee.id, weeklyBudgetMinutes(employee, openDates, monthBounds, input.workHours)] as const;
    const empWeekInfo = weekInfo.map((week) => ({
      weekStart: week.weekStart,
      openDays: (byWeek.get(week.weekStart) ?? []).filter((date) => mayWorkOn(employee, date) && !ctx.blocked.get(employee.id)?.has(date)).length,
    }));
    // Volles Monats-Soll auf die verfügbaren Tage verteilen.
    return [employee.id, weeklyTargetMinutes(monthlyTargetMinutesFor(employee, openDates, input.workHours), empWeekInfo)] as const;
  }));
  // Ein Wochenbudget unter der Mindestschichtlänge (Monatsrand: ein oder zwei
  // offene Tage) ergäbe einen 1–2-Stunden-Dienst. Bei einem MONATSvertrag darf
  // dieser Rest in die Nachbarwoche wandern; ein WOCHENvertrag bleibt hart an
  // seiner Woche.
  for (const employee of employees) {
    if (employee.weeklyHours != null) continue;
    const weekly = budgets.get(employee.id)!;
    const order = [...weekly.keys()].sort();
    for (let index = 0; index < order.length; index++) {
      const week = order[index];
      const minutes = weekly.get(week) ?? 0;
      if (minutes <= 0 || minutes >= MIN_SHIFT) continue;
      const room = (other: string) =>
        (byWeek.get(other)?.length ?? 0) * MAX_PAID - (weekly.get(other) ?? 0);
      const neighbour = [order[index - 1], order[index + 1]]
        .filter((other): other is string => Boolean(other) && room(other) >= minutes)
        .sort((a, b) => room(b) - room(a))[0];
      if (!neighbour) continue;
      weekly.set(neighbour, (weekly.get(neighbour) ?? 0) + minutes);
      weekly.set(week, 0);
    }
  }

  // Tab „Tài liệu": giờ ngày = giờ tuần × (hệ số × phút mở) ÷ Σ(hệ số × phút mở),
  // chuẩn hoá trong từng ISO-week; ngày lễ tính như Chủ nhật (effectiveWeekdayKey).
  const dailyTargets = new Map<string, number>();
  const spreadByWeight = (weekDates: string[], total: number) => {
    const targets = weightedDailyTargets(
      weekDates,
      total,
      (date) => effectiveWeekdayKey(date, holidays),
      (date) => openMinutesOfBlocks(days.get(date)!.blocks),
      ctx.weights,
      // Sàn: giờ công tối thiểu để phủ cửa VÀ đủ người các khung cao điểm.
      (date) => minimumStaffHours(days.get(date)!.blocks, effectiveWeekdayKey(date, holidays), ctx.rules),
      // Reicht das nicht: wenigstens eine Person über die ganze Öffnungszeit,
      // plus eine halbe Stunde, damit die Pause einer langen Schicht nicht als
      // Loch übrig bleibt (zwei Dienste müssen sich dort überlappen können).
      (date) => openMinutesOfBlocks(days.get(date)!.blocks) / 60 + 0.5,
    );
    for (const [date, hours] of targets) dailyTargets.set(date, hours);
  };
  for (const [weekStart, weekDates] of byWeek) {
    const weekMinutes = [...budgets.values()].reduce((sum, weekly) => sum + (weekly.get(weekStart) ?? 0), 0);
    spreadByWeight(weekDates, weekMinutes / 60);
  }
  for (const employee of employees) {
    const weekly = budgets.get(employee.id)!;
    for (const [weekStart, weekDates] of weeks) {
      const choices = chooseWeek(employee, weekDates, weekly.get(weekStart) ?? 0, result, days, holidays, dailyTargets, ctx);
      result.push(...choices.flatMap((choice) => choice.option.shifts));
    }
  }
  // Refit to actual available hours (new hires can reduce a week's budget).
  for (const [, weekDates] of byWeek) {
    const actual = result.filter((s) => weekDates.includes(s.date)).reduce((sum, s) => sum + s.paidMinutes, 0) / 60;
    spreadByWeight(weekDates, actual);
  }
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const [weekStart, weekDates] of weeks) for (const employee of [...employees].reverse()) {
      const own = result.filter((s) => s.employeeId === employee.id && weekStartOf(s.date) === weekStart);
      const paid = own.reduce((sum, s) => sum + s.paidMinutes, 0);
      if (!paid || employee.fixedShift) continue;
      const others = result.filter((s) => !own.includes(s));
      const choices = chooseWeek(employee, weekDates, paid, others, days, holidays, dailyTargets, ctx);
      const next = choices.flatMap((choice) => choice.option.shifts);
      if (next.reduce((sum, s) => sum + s.paidMinutes, 0) !== paid) continue;
      const score = (shifts: Shift[]) => weekDates.reduce((sum, date) => sum + dayCost(
        [...others.filter((s) => s.date === date), ...shifts.filter((s) => s.date === date)],
        days.get(date)!.blocks, effectiveWeekdayKey(date, holidays), dailyTargets.get(date), ctx), 0);
      if (score(next) < score(own) - 0.01) {
        result = [...others, ...next];
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Rest-Minuten aus der Wochenrundung noch unterbringen (siehe topUpShortfalls).
  const monthlyTargets = new Map(
    employees.map((employee) => [
      employee.id,
      employee.weeklyHours != null
        ? [...(budgets.get(employee.id)?.values() ?? [])].reduce((sum, minutes) => sum + minutes, 0)
        : monthlyTargetMinutesFor(employee, openDates, input.workHours),
    ] as const),
  );
  // Ein WOCHENvertrag ist eine harte Grenze je Woche; ein Monatsvertrag nicht.
  const weeklyCaps = new Map(
    employees
      .filter((employee) => employee.weeklyHours != null)
      .map((employee) => [employee.id, budgets.get(employee.id)!] as const),
  );
  result = topUpShortfalls(result, employees, days, holidays, dailyTargets, monthlyTargets, weeklyCaps, budgets, ctx);

  // Feinschliff und Tausch wechseln sich ab: der Tausch verschiebt Stunden
  // zwischen zwei Personen, der Feinschliff legt danach alles neu zurecht – und
  // öffnet damit oft den nächsten sinnvollen Tausch.
  for (let runde = 0; runde < 3; runde++) {
    result = improveCoverage(result, employees, days, holidays, dailyTargets, ctx);
    const getauscht = tradeMinutes(result, employees, days, holidays, dailyTargets, ctx);
    if (getauscht === result) break;
    result = getauscht;
  }
  return improveCoverage(result, employees, days, holidays, dailyTargets, ctx)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes || a.employeeId.localeCompare(b.employeeId));
}

/** Restore feasible contract hours after rest-day repair, without creating invalid days. */
export function completeContractHours(input: WeeklyInput, initial: Shift[]): Shift[] {
 const employees = input.employees.map(e => employeeForMonth(e, `${input.year}-${String(input.month).padStart(2,"0")}`)).filter(e=>!e.isOwner);
 const holidays = input.holidays ?? publicHolidays(input.year);
 const days = new Map(datesOfMonth(input.year,input.month).map(date=>[date,resolveDay(input.workHours,date,holidays,input.overrides ?? {})]));
 const openDates = [...days].filter(([,d])=>!d.closed).map(([date])=>date);
 const ctx: Ctx = { roles: new Map(employees.map(e=>[e.id,e.workRole])), rules: input.rules ?? STAFFING_RULES, weights: input.weights ?? DAY_WEIGHTS,
 blocked: new Map(Object.entries(input.blockedDays ?? {}).map(([id,dates])=>[id,new Set(dates)])),
 tag: input.storeTag ?? "default", windows: new Map(employees.map(e=>[e.id,preferredWindowsOf(e)])) };
 const targets = new Map(employees.map(e=>[e.id,Math.floor(monthlyTargetMinutesFor(e,openDates,input.workHours)/SLOT)*SLOT]));
 const bounds = {first:days.keys().next().value!,last:[...days.keys()].pop()!};
 const caps = new Map(employees.filter(e=>e.weeklyHours!=null).map(e=>[e.id,weeklyBudgetMinutes(e,openDates,bounds,input.workHours)]));
 const dailyTargets = new Map(openDates.map(date=>[date,initial.filter(s=>s.date===date).reduce((n,s)=>n+s.paidMinutes,0)/60]));
 let result = initial;
 for (const employee of employees) {
  for (let pass=0;pass<40;pass++) {
   result = topUpShortfalls(result,[employee],days,holidays,dailyTargets,targets,caps,new Map(),ctx);
   const own=result.filter(s=>s.employeeId===employee.id);
   const remaining=(targets.get(employee.id) ?? 0)-own.reduce((n,s)=>n+s.paidMinutes,0);
   if(remaining<SLOT || employee.fixedShift) break;
   const worked=new Set(own.map(s=>s.date));
   let best: {shifts:Shift[];cost:number} | undefined;
   for(const date of openDates) {
    if(worked.has(date) || !mayWorkOn(employee,date) || ctx.blocked.get(employee.id)?.has(date)) continue;
    if(consecutiveRunLengthWith(worked,date)>6) continue;
    const week=weekStartOf(date);
    const inWeek=own.filter(s=>weekStartOf(s.date)===week);
    if(new Set(inWeek.map(s=>s.date)).size>=dayLimit(employee)) continue;
    const cap=caps.get(employee.id)?.get(week) ?? Infinity;
    const room=Math.min(MAX_PAID,remaining,cap-inWeek.reduce((n,s)=>n+s.paidMinutes,0));
    const day=days.get(date)!;
    const others=result.filter(s=>s.date===date);
    const weekday=effectiveWeekdayKey(date,holidays);
    for(let paid=Math.floor(room/SLOT)*SLOT;paid>=MIN_SHIFT;paid-=SLOT) {
     const options=optionsFor(employee,date,paid,day.blocks,true,weekday,ctx);
     for(const option of options) {
      const cost=dayCost([...others,...option.shifts],day.blocks,weekday,dailyTargets.get(date),ctx)-dayCost(others,day.blocks,weekday,dailyTargets.get(date),ctx)-paid*100000;
      if(!best || cost<best.cost) best={shifts:option.shifts,cost};
     }
     if(options.length) break;
    }
   }
   if(!best) break;
   result=[...result,...best.shifts];
  }
 }
 // Monthly contracts may move across ISO weeks: equal weekdays share one monthly target.
 const totalHours = result.reduce((n,s)=>n+s.paidMinutes,0)/60;
 const balancedTargets = weightedDailyTargets(openDates,totalHours,date=>effectiveWeekdayKey(date,holidays),
  date=>openMinutesOfBlocks(days.get(date)!.blocks),ctx.weights,
  date=>minimumStaffHours(days.get(date)!.blocks,effectiveWeekdayKey(date,holidays),ctx.rules),
  date=>openMinutesOfBlocks(days.get(date)!.blocks)/60);
 const rebalance = () => {
 for(let pass=0;pass<100;pass++) {
  const totals=new Map(openDates.map(date=>[date,result.filter(s=>s.date===date).reduce((n,s)=>n+s.paidMinutes,0)/60]));
  const delta=(date:string)=>(totals.get(date) ?? 0)-(balancedTargets.get(date) ?? 0);
  const donors=[...openDates].sort((a,b)=>delta(b)-delta(a));
  const gaps = new Map(openDates.map(date=>[date,roleGapMinutes(result.filter(s=>s.date===date),days.get(date)!.blocks,ctx)]));
  const receivers=[...openDates].sort((a,b)=>(gaps.get(b)!-gaps.get(a)!) || delta(a)-delta(b)).slice(0,8);
  let best: {result:Shift[];gain:number} | undefined;
  const placementCache=new Map<string,Shift[]|undefined>();
  for(const from of donors) for(const to of receivers) {
   if(from===to || (delta(from)-delta(to)<0.75 && !gaps.get(to))) continue;
   for(const employee of employees) {
    if(employee.fixedShift || (employee.weeklyHours!=null && weekStartOf(from)!==weekStartOf(to))) continue;
    if(!mayWorkOn(employee,to) || ctx.blocked.get(employee.id)?.has(to)) continue;
    const own=result.filter(s=>s.employeeId===employee.id);
    const source=own.filter(s=>s.date===from), dest=own.filter(s=>s.date===to);
    const sourcePaid=source.reduce((n,s)=>n+s.paidMinutes,0), destPaid=dest.reduce((n,s)=>n+s.paidMinutes,0);
    const amount=destPaid ? SLOT : MIN_SHIFT;
    if(sourcePaid<amount || (sourcePaid-amount>0 && sourcePaid-amount<MIN_SHIFT) || destPaid+amount>MAX_PAID) continue;
    if(!gaps.get(to) && (delta(from)**2+delta(to)**2)-((delta(from)-amount/60)**2+(delta(to)+amount/60)**2)<0.1) continue;
    const worked=new Set(own.filter(s=>s.date!==from || sourcePaid>amount).map(s=>s.date));
    if(consecutiveRunLengthWith(worked,to)>6) continue;
    if(!worked.has(to) && [...worked].filter(date=>weekStartOf(date)===weekStartOf(to)).length>=dayLimit(employee)) continue;
    const rest=result.filter(s=>!source.includes(s)&&!dest.includes(s));
    const place=(date:string,paid:number):Shift[]|undefined=>{
     const key=`${employee.id}:${date}:${paid}`;
     if(placementCache.has(key)) return placementCache.get(key);
     const day=days.get(date)!, weekday=effectiveWeekdayKey(date,holidays);
     const others=rest.filter(s=>s.date===date);
     const colleague=employees.find(e=>e.id!==employee.id && !e.fixedShift && e.workRole===employee.workRole && others.some(s=>s.employeeId===e.id));
     const otherPaid=colleague ? others.filter(s=>s.employeeId===colleague.id).reduce((n,s)=>n+s.paidMinutes,0) : 0;
     const untouched=colleague ? others.filter(s=>s.employeeId!==colleague.id) : others;
     const colleagueOptions=colleague ? optionsFor(colleague,date,otherPaid,day.blocks,true,weekday,ctx) : [{shifts:[],styleCost:0}];
     const ownOptions=paid ? optionsFor(employee,date,paid,day.blocks,true,weekday,ctx) : [{shifts:[],styleCost:0}];
     let chosen:Shift[]|undefined, cost=Infinity;
     for(const option of ownOptions) for(const other of colleagueOptions) {
      const shifts=[...untouched,...option.shifts,...other.shifts];
      const next=dayCost(shifts,day.blocks,weekday,balancedTargets.get(date),ctx);
      if(next<cost) {cost=next;chosen=shifts;}
     }
     placementCache.set(key,chosen);
     return chosen;
    };
    const nextSource=place(from,sourcePaid-amount), nextDest=place(to,destPaid+amount);
    if(!nextSource || !nextDest) continue;
    const next=[...rest.filter(s=>s.date!==from && s.date!==to),...nextSource,...nextDest];
    const score=(list:Shift[])=>[from,to].reduce((n,date)=>{
      const onDay=list.filter(s=>s.date===date), day=days.get(date)!;
      return n+dayCost(onDay,day.blocks,effectiveWeekdayKey(date,holidays),balancedTargets.get(date),ctx)
       +(((onDay.reduce((n,s)=>n+s.paidMinutes,0)/60)-(balancedTargets.get(date) ?? 0))**2)*RESTAURANT_POLICY.balanceHourCost;
    },0);
    if([from,to].some(date=>leerMinuten(next.filter(s=>s.date===date),days.get(date)!.blocks)>leerMinuten(result.filter(s=>s.date===date),days.get(date)!.blocks))) continue;
    const gain=score(result)-score(next);
    if(gain>0.01 && (!best || gain>best.gain)) best={result:next,gain};
   }
  }
  if(!best) break;
  result=best.result;
 }
 };
 rebalance();
 result = relocateRestDays(result,employees,days,holidays,balancedTargets,ctx);
 rebalance();
 result = exchangeRoleHours(result,employees,days,holidays,balancedTargets,ctx);
 result = polishRestaurantPairs(result,employees,days,holidays,balancedTargets,ctx);
 result = improveCoverage(result,employees,days,holidays,balancedTargets,ctx);
 result = repairCoverageTransfers(result,employees,days,holidays,balancedTargets,ctx);
 result = repairCoverageTransfers(result,employees,days,holidays,balancedTargets,ctx,true);
 result = relocateRestDays(result,employees,days,holidays,balancedTargets,ctx,true);
 result = exchangeRoleHours(result,employees,days,holidays,balancedTargets,ctx,true);
 return result.sort((a,b)=>a.date.localeCompare(b.date)||a.startMinutes-b.startMinutes||a.employeeId.localeCompare(b.employeeId));
}

/** Simultaneous role handovers escape the one-person-at-a-time local minimum. */
function polishRestaurantPairs(result: Shift[], employees: Employee[], days: Map<string,Day>, holidays: Set<string>, targets: Map<string,number>, ctx: Ctx): Shift[] {
 const output:Shift[]=[];
 for(const [date,day] of days) {
  let onDay=result.filter(s=>s.date===date);
  if(day.closed || !roleGapMinutes(onDay,day.blocks,ctx)) {output.push(...onDay);continue;}
  const weekday=effectiveWeekdayKey(date,holidays);
  for(let pass=0;pass<2;pass++) {
   let changed=false;
   const active=employees.filter(e=>!e.fixedShift && onDay.some(s=>s.employeeId===e.id));
   for(let i=0;i<active.length;i++) for(let j=i+1;j<active.length;j++) {
    const a=active[i],b=active[j];
    const ownA=onDay.filter(s=>s.employeeId===a.id),ownB=onDay.filter(s=>s.employeeId===b.id);
    const rest=onDay.filter(s=>s.employeeId!==a.id && s.employeeId!==b.id);
    const options=(employee:Employee,own:Shift[])=>[
     {shifts:own,styleCost:0},
     ...optionsFor(employee,date,own.reduce((n,s)=>n+s.paidMinutes,0),day.blocks,true,weekday,ctx).filter(option=>option.shifts.some(s=>s.startMinutes===day.window.startMinutes || s.endMinutes===day.window.endMinutes))
    ];
    let best=onDay, cost=dayCost(onDay,day.blocks,weekday,targets.get(date),ctx);
    for(const x of options(a,ownA)) for(const y of options(b,ownB)) {
     const next=[...rest,...x.shifts,...y.shifts];
     const value=dayCost(next,day.blocks,weekday,targets.get(date),ctx);
     if(value<cost-0.01) {best=next;cost=value;}
    }
    if(best!==onDay) {onDay=best;changed=true;}
   }
   if(!changed) break;
  }
  output.push(...onDay);
 }
 return output;
}

/** Department coverage comes before the optional third peak worker. */
function coveragePriorityCost(shifts:Shift[],blocks:DayBlocks,ctx:Ctx):number {
 let closing=0,peak=0;
 for(const block of blocks)for(let t=block.startMinutes;t<block.endMinutes;t+=SLOT){
  if(t>=PEAK_END)closing+=restaurantRoleShortage(shifts,t,ctx)*SLOT;
  if(t>=PEAK_START && t<PEAK_END)peak+=Math.max(0,RESTAURANT_POLICY.peakStaff-shifts.filter(s=>workingAt(s,t)).length)*SLOT;
 }
 return roleGapMinutes(shifts,blocks,ctx)*1e9+closing*1e6+peak*1000;
}

/** Exchange hours on two dates together: preserve both contracts and daily totals.
 * A one-person move cannot repair a long shift's uncovered break when another
 * employee must receive those hours on the same day. */
function exchangeRoleHours(result: Shift[], employees: Employee[], days: Map<string, Day>, holidays: Set<string>, targets: Map<string, number>, ctx: Ctx, coverageFirst=false): Shift[] {
 const dates=[...days].filter(([,day])=>!day.closed).map(([date])=>date);
 for(let pass=0;pass<20;pass++) {
  let best: {shifts:Shift[];gain:number} | undefined;
  for(let i=0;i<employees.length;i++) for(let j=i+1;j<employees.length;j++) {
   const a=employees[i],b=employees[j];
   if(a.fixedShift || b.fixedShift || a.weeklyHours!=null || b.weeklyHours!=null || a.workRole!==b.workRole || a.workRole==="BOTH") continue;
   const candidates=new Map<number,{date:string;shifts:Shift[];gain:number}[]>();
   for(const date of dates) {
    const day=days.get(date)!,weekday=effectiveWeekdayKey(date,holidays);
    const onDay=result.filter(s=>s.date===date);
    const ownA=onDay.filter(s=>s.employeeId===a.id),ownB=onDay.filter(s=>s.employeeId===b.id);
    const paidA=ownA.reduce((n,s)=>n+s.paidMinutes,0),paidB=ownB.reduce((n,s)=>n+s.paidMinutes,0);
    if(!paidA && !paidB) continue;
    const rest=onDay.filter(s=>s.employeeId!==a.id && s.employeeId!==b.id);
    const before=coverageFirst ? coveragePriorityCost(onDay,days.get(date)!.blocks,ctx) : dayCost(onDay,day.blocks,weekday,targets.get(date),ctx);
    const options=(employee:Employee,paid:number):Option[]=>{
     if(!paid) return [{shifts:[],styleCost:0}];
     if(paid<MIN_SHIFT || paid>MAX_PAID || !mayWorkOn(employee,date) || ctx.blocked.get(employee.id)?.has(date)) return [];
     return optionsFor(employee,date,paid,day.blocks,true,weekday,ctx).filter(option=>option.shifts.some(s=>s.startMinutes===day.window.startMinutes || s.endMinutes===day.window.endMinutes));
    };
    for(let delta=-MAX_PAID;delta<=MAX_PAID;delta+=SLOT) {
     if(!delta) continue;
     const nextA=paidA+delta,nextB=paidB-delta;
     const optionsA=options(a,nextA),optionsB=options(b,nextB);
     let shifts:Shift[]|undefined,cost=Infinity;
     for(const x of optionsA) for(const y of optionsB) {
      const next=[...rest,...x.shifts,...y.shifts];
      const value=coverageFirst ? coveragePriorityCost(next,days.get(date)!.blocks,ctx) : dayCost(next,day.blocks,weekday,targets.get(date),ctx);
      if(value<cost) {cost=value;shifts=next;}
     }
     if(shifts) candidates.set(delta,[...(candidates.get(delta) ?? []),{date,shifts,gain:before-cost}]);
    }
   }
   for(const [delta,forward] of candidates) {
    if(delta<=0) continue;
    for(const x of forward) for(const y of candidates.get(-delta) ?? []) {
     const gain=x.gain+y.gain;
     if(x.date===y.date || gain<=0.01 || gain<=(best?.gain ?? 0)) continue;
     const next=[...result.filter(s=>s.date!==x.date && s.date!==y.date),...x.shifts,...y.shifts];
     let valid=true;
     for(const employee of [a,b]) {
      const worked=new Set(next.filter(s=>s.employeeId===employee.id).map(s=>s.date));
      if([...worked].some(date=>consecutiveRunLengthWith(worked,date)>6)) {valid=false;break;}
      for(const week of new Set([...worked].map(weekStartOf))) {
       if([...worked].filter(date=>weekStartOf(date)===week).length>dayLimit(employee)) valid=false;
      }
     }
     if(valid) best={shifts:next,gain};
    }
   }
  }
  if(!best) break;
  result=best.shifts;
 }
 return result;
}

/** Move a day off together with a colleague's hours. Neither independent move
 * need improve coverage; accept only the combined improvement, keeping contracts. */
function relocateRestDays(result: Shift[], employees: Employee[], days: Map<string,Day>, holidays: Set<string>, targets: Map<string,number>, ctx: Ctx, coverageFirst=false): Shift[] {
 const costOf=(shifts:Shift[],date:string)=>{
  const day=days.get(date)!;
  if(!coverageFirst)return dayCost(shifts,day.blocks,effectiveWeekdayKey(date,holidays),targets.get(date),ctx);
  return coveragePriorityCost(shifts,day.blocks,ctx);
 };
 const dates=[...days].filter(([,day])=>!day.closed).map(([date])=>date);
 const movable=employees.filter(e=>!e.fixedShift && e.weeklyHours==null);
 for(let pass=0;pass<(coverageFirst ? 32 : 8);pass++) {
  let best:{shifts:Shift[];gain:number}|undefined;
  for(const a of movable) for(const b of movable) {
   if(a===b || a.workRole!==b.workRole || a.workRole==="BOTH") continue;
   const own=result.filter(s=>s.employeeId===a.id);
   const worked=new Set(own.map(s=>s.date));
   const paidOf=(id:string,date:string)=>result.filter(s=>s.employeeId===id && s.date===date).reduce((n,s)=>n+s.paidMinutes,0);
   const cache=new Map<string,{shifts:Shift[];cost:number}|null>();
   const place=(date:string,paidA:number,paidB:number)=>{
    const key=`${date}:${paidA}:${paidB}`;
    if(cache.has(key)) return cache.get(key);
    const day=days.get(date)!,weekday=effectiveWeekdayKey(date,holidays);
    const rest=result.filter(s=>s.date===date && s.employeeId!==a.id && s.employeeId!==b.id);
    const options=(e:Employee,paid:number):Option[]=>{
     if(!paid) return [{shifts:[],styleCost:0}];
     if(paid<MIN_SHIFT || paid>MAX_PAID || !mayWorkOn(e,date) || ctx.blocked.get(e.id)?.has(date)) return [];
     return optionsFor(e,date,paid,day.blocks,true,weekday,ctx);
    };
    let bestDay:{shifts:Shift[];cost:number}|null=null;
    for(const x of options(a,paidA)) for(const y of options(b,paidB)) {
     const shifts=[...rest,...x.shifts,...y.shifts];
     const cost=costOf(shifts,date);
     if(!bestDay || cost<bestDay.cost) bestDay={shifts,cost};
    }
    cache.set(key,bestDay);return bestDay;
   };
   for(const to of dates) {
    if(worked.has(to) || !mayWorkOn(a,to) || ctx.blocked.get(a.id)?.has(to)) continue;
    const onTo=result.filter(s=>s.date===to);
    if(!roleGapMinutes(onTo,days.get(to)!.blocks,ctx)) continue;
    const bTo=paidOf(b.id,to);
    if(!bTo) continue;
    for(const from of worked) {
     const nextWorked=new Set(worked);nextWorked.delete(from);nextWorked.add(to);
     if([...nextWorked].some(date=>consecutiveRunLengthWith(nextWorked,date)>6)) continue;
     if([...nextWorked].filter(date=>weekStartOf(date)===weekStartOf(to)).length>dayLimit(a)) continue;
     const bFrom=paidOf(b.id,from);
     // Opening another workday for B requires its own availability/rest check.
     if(!bFrom){
      if(!coverageFirst || !mayWorkOn(b,from) || ctx.blocked.get(b.id)?.has(from))continue;
      const bWorked=new Set(result.filter(s=>s.employeeId===b.id).map(s=>s.date));bWorked.add(from);
      if([...bWorked].some(date=>consecutiveRunLengthWith(bWorked,date)>6) || [...bWorked].filter(date=>weekStartOf(date)===weekStartOf(from)).length>dayLimit(b))continue;
     }
     const paidA=paidOf(a.id,from);
     const before=[from,to].reduce((n,date)=>n+costOf(result.filter(s=>s.date===date),date),0);
     for(let transfer=SLOT;transfer<=Math.min(bTo-MIN_SHIFT,MAX_PAID-bFrom);transfer+=SLOT) {
      const dest=place(to,paidA,bTo-transfer),source=place(from,0,bFrom+transfer);
      if(!dest || !source) continue;
      const gain=before-dest.cost-source.cost;
      if(gain>0.01 && gain>(best?.gain ?? 0)) best={shifts:[...result.filter(s=>s.date!==from && s.date!==to),...dest.shifts,...source.shifts],gain};
     }
    }
   }
  }
  if(!best) break;
  result=best.shifts;
 }
 return result;
}

/** Repair small handover/closing gaps after monthly balancing. Move paid time,
 * not contract budgets; existing workdays stay fixed, preserving rest patterns. */
function repairCoverageTransfers(result:Shift[],employees:Employee[],days:Map<string,Day>,holidays:Set<string>,targets:Map<string,number>,ctx:Ctx,morningPriority=false):Shift[] {
 const dates=[...days].filter(([,day])=>!day.closed).map(([date])=>date);
 const metrics=(shifts:Shift[],date:string)=>{
  const day=days.get(date)!;
  let role=0,closing=0,peak=0,morning=0;
  for(const block of day.blocks)for(let t=block.startMinutes;t<block.endMinutes;t+=SLOT){
   const missing=restaurantRoleShortage(shifts,t,ctx);
   role+=missing*SLOT;
   if(morningPriority && t<780 && !shifts.some(s=>ctx.roles.get(s.employeeId)==="KITCHEN" && workingAt(s,t)))morning+=SLOT;
   if(t>=PEAK_END)closing+=missing*SLOT;
   if(t>=PEAK_START && t<PEAK_END)peak+=Math.max(0,RESTAURANT_POLICY.peakStaff-shifts.filter(s=>workingAt(s,t)).length)*SLOT;
  }
  const long=shifts.reduce((n,s)=>n+(Math.max(0,s.paidMinutes-360)/SLOT)**2,0);
  return {role,closing,peak,morning,long};
 };
 const initialRole=dates.reduce((n,date)=>n+metrics(result.filter(s=>s.date===date),date).role,0);
 const initialPeak=dates.reduce((n,date)=>n+metrics(result.filter(s=>s.date===date),date).peak,0);
 const byDate=new Map(dates.map(date=>[date,result.filter(s=>s.date===date)]));
 const before=new Map(dates.map(date=>[date,metrics(byDate.get(date)!,date)]));
 // Day placements depend only on that day's shifts: retain unaffected entries.
 const cache=new Map<string,{shifts:Shift[];m:ReturnType<typeof metrics>;cost:number}|undefined>();
 for(let pass=0;pass<16;pass++){
  const totalPeak=[...before.values()].reduce((n,m)=>n+m.peak,0);
  const roleSaved=initialRole-[...before.values()].reduce((n,m)=>n+m.role,0);
  const place=(date:string,employee:Employee,paid:number)=>{
   const key=`${date}:${employee.id}:${paid}`;
   if(cache.has(key))return cache.get(key);
   const day=days.get(date)!,weekday=effectiveWeekdayKey(date,holidays),onDay=byDate.get(date)!;
   const colleague=employees.find(e=>e.id!==employee.id && !e.fixedShift && e.workRole===employee.workRole && onDay.some(s=>s.employeeId===e.id));
   const others=onDay.filter(s=>s.employeeId!==employee.id && s.employeeId!==colleague?.id);
   const colleaguePaid=onDay.filter(s=>s.employeeId===colleague?.id).reduce((n,s)=>n+s.paidMinutes,0);
   const placements=(person:Employee,minutes:number)=>{
    const options=optionsFor(person,date,minutes,day.blocks,true,weekday,ctx);
    if(!morningPriority || employee.workRole!=="KITCHEN")return options;
    return options.flatMap(option=>option.shifts.length===1 && option.shifts[0].pauseMinutes>0
     ? pauseStartCandidates(option.shifts[0].startMinutes,option.shifts[0].endMinutes,option.shifts[0].pauseMinutes).map(pauseStartMinutes=>({...option,shifts:[{...option.shifts[0],pauseStartMinutes}]})) : [option]);
   };
   const otherOptions=colleague ? placements(colleague,colleaguePaid) : [{shifts:[],styleCost:0}];
   let best:{shifts:Shift[];m:ReturnType<typeof metrics>;cost:number}|undefined;
   for(const a of placements(employee,paid))for(const b of otherOptions){
    const shifts=[...others,...a.shifts,...b.shifts],m=metrics(shifts,date);
    const cost=m.role*1e9+m.closing*1e6+m.peak*10000+m.morning*10+m.long+dayCost(shifts,day.blocks,weekday,targets.get(date),ctx)/1e7;
    if(!best || cost<best.cost)best={shifts,m,cost};
   }
   cache.set(key,best);return best;
  };
  let best:{shifts:Shift[];gain:number;dates:string[]}|undefined;
  for(const date of dates)for(const employee of employees){
   if(employee.fixedShift || employee.workRole==="BOTH")continue;
   const old=before.get(date)!;
   if(!old.role)continue;
   const paid=byDate.get(date)!.filter(s=>s.employeeId===employee.id).reduce((n,s)=>n+s.paidMinutes,0);
   if(!paid)continue;
   const next=place(date,employee,paid);
   if(!next)continue;
   const roleGain=old.role-next.m.role,closingGain=old.closing-next.m.closing,peakGain=old.peak-next.m.peak;
   const morningGain=old.morning-next.m.morning;
   if(roleGain<0 || closingGain<0 || morningGain<0 || totalPeak-peakGain>initialPeak+(morningPriority ? roleSaved+roleGain : 0) || (roleGain===0 && closingGain===0 && (morningGain<=0 || peakGain<0)))continue;
   const gain=roleGain*1e9+closingGain*1e6+peakGain*10000+morningGain*10;
   if(!best || gain>best.gain)best={shifts:[...result.filter(s=>s.date!==date),...next.shifts],gain,dates:[date]};
  }

  for(const to of dates.filter(date=>!morningPriority && before.get(date)!.role>0))for(const employee of employees){
   if(employee.fixedShift || employee.workRole==="BOTH")continue;
   const destPaid=byDate.get(to)!.filter(s=>s.employeeId===employee.id).reduce((n,s)=>n+s.paidMinutes,0);
   if(!destPaid)continue;
   for(const amount of [SLOT,2*SLOT,3*SLOT,4*SLOT]){
   if(destPaid+amount>MAX_PAID)continue;
   const dest=place(to,employee,destPaid+amount);
   if(!dest || dest.m.role>before.get(to)!.role)continue;
   for(const from of dates){
    if(from===to || (employee.weeklyHours!=null && weekStartOf(from)!==weekStartOf(to)))continue;
    const sourcePaid=byDate.get(from)!.filter(s=>s.employeeId===employee.id).reduce((n,s)=>n+s.paidMinutes,0);
    if(sourcePaid-amount<MIN_SHIFT)continue;
    const source=place(from,employee,sourcePaid-amount);
    if(!source)continue;
    const oldA=before.get(from)!,oldB=before.get(to)!;
    const roleGain=oldA.role+oldB.role-source.m.role-dest.m.role;
    const closingGain=oldA.closing+oldB.closing-source.m.closing-dest.m.closing;
    const peakGain=oldA.peak+oldB.peak-source.m.peak-dest.m.peak;
    const morningGain=oldA.morning+oldB.morning-source.m.morning-dest.m.morning;
    const longGain=oldA.long+oldB.long-source.m.long-dest.m.long;
    // Coverage precedes the preference for 4–6h shifts.
    if(roleGain<0 || closingGain<0 || morningGain<0 || totalPeak-peakGain>initialPeak || (roleGain===0 && closingGain===0 && (peakGain<0 || (morningGain===0 && longGain<=0))))continue;
    const gain=roleGain*1e9+closingGain*1e6+peakGain*10000+morningGain*10+longGain;
    if(!best || gain>best.gain)best={shifts:[...result.filter(s=>s.date!==from && s.date!==to),...source.shifts,...dest.shifts],gain,dates:[from,to]};
   }
   }
  }
  if(!best)break;
  result=best.shifts;
  for(const date of best.dates){
   const shifts=result.filter(s=>s.date===date);
   byDate.set(date,shifts);before.set(date,metrics(shifts,date));
   for(const key of cache.keys())if(key.startsWith(`${date}:`))cache.delete(key);
  }
 }
 return result;
}
