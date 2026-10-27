// An Sushibar: tối ưu CẢ THÁNG một lượt (ngày làm, giờ bắt đầu, độ dài ca,
// giờ nghỉ, bộ phận của người làm cả hai) thay vì xếp từng tuần rồi vá.
//
// Ràng buộc cứng (luôn giữ): đúng giờ hợp đồng (lưới 30 phút), ngày được phép
// làm, tối đa 8 h công/ngày, ca 3–8 h, tối đa 6 ngày/tuần ISO và 6 ngày liên
// tiếp (tính cả tháng bên cạnh), nghỉ giải lao theo luật.
// Mục tiêu (theo thứ tự trọng số): luôn có 1 bếp + 1 bồi → đủ người theo khung
// (cao điểm T6/T7 trước, ngày thường sau) → không dồn người thừa vào một khung →
// ưu tiên ca 4–6 h.

import { RESTAURANT_POLICY, isOptionalCoverageTime, compareStaffingPriority } from "./restaurantPolicy";
import type { Employee, Shift } from "../types";
import { datesOfMonth, parseIsoDate, weekdayKeyOf } from "./demand";
import { calculatePause } from "./time";
import { mayWorkOn } from "./availability";
import { isoAddDays, seededRandom } from "./consecutive";
import { effectiveWeekdayKey, resolveDay, type OverrideMap, type WorkHoursConfig } from "./workHours";
import { publicHolidays } from "./holidays";
import { weekStartOf } from "./weeks";
import { employeeForMonth } from "./history";
import { monthlyTargetMinutesFor, weeklyBudgetMinutes } from "./contract";
import { BUSY_DAYS, STAFFING_RULES, staffingWindows, type StaffingRule } from "./staffing";

export type OptimizerInput = {
  year: number;
  month: number;
  workHours: WorkHoursConfig;
  overrides?: OverrideMap;
  employees: Employee[];
  holidays?: Set<string>;
  rules?: readonly StaffingRule[];
  blockedDays?: Record<string, readonly string[]>;
  adjacentShifts?: readonly Shift[];
  /** Số vòng tối ưu; mặc định đủ cho một tháng. */
  iterations?: number;
};

const SLOT = 30;
const MIN_PAID = 180;
const MAX_PAID = 480;

const W_ROLE = 30000; // mọi ô thiếu bộ phận có cùng ưu tiên, kể cả giờ mở cửa
const W_GAP_PIECE = 10; // độ phủ đứng trước việc gom khoảng thiếu
const W_ROLE_OVER = 80; // hạn chế chồng cùng bộ phận ngoài cao điểm
const W_EMPTY = 1000; // thêm nữa nếu tiệm trống hẳn
const W_BUSY_PEAK = 200; // T6/T7 trước cao điểm ngày thường; vẫn thấp hơn phủ bộ phận
const W_NORMAL_PEAK = 1;
const W_STAFF = 20; // mỗi người thiếu so với khung (cao điểm 3 người)
const W_OVER = 6; // (người thừa)² mỗi 30 phút
const W_LONG = 15; // ca > 6 h
const W_SHORT = 25; // ca < 4 h

type Role = 0 | 1 | 2; // 0 bếp, 1 bồi, 2 không phân bộ phận
type Kind = "K" | "S" | "B" | "G";
type Cell = { start: number; paid: number; pause: number; role: Role; split?: {from:number;to:number} } | null;
type DayInfo = { date: string; open: number; close: number; week: string; busy: boolean; need: number[] };
type Emp = {
  source: Employee; kind: Kind; target: number; allowed: boolean[]; maxPerWeek: number;
  caps?: Map<string, number>; outside: Set<string>;
};

function kindOf(employee: Employee): Kind {
  return employee.workRole === "KITCHEN" ? "K" : employee.workRole === "SERVICE_SUSHI" ? "S" : employee.workRole === "BOTH" ? "B" : "G";
}

function pauseCandidates(start: number, paid: number): number[] {
  const pause = calculatePause(paid);
  if (!pause) return [-1];
  const end = start + paid + pause;
  const out: number[] = [];
  for (let p = start + 60; p + pause <= end - 60; p += SLOT) {
    if (p - start <= 360 && end - p - pause <= 360) out.push(p);
  }
  return out;
}

export function optimizeMonth(input: OptimizerInput): Shift[] {
  const month = `${input.year}-${String(input.month).padStart(2, "0")}`;
  const holidays = input.holidays ?? publicHolidays(input.year);
  const rules = input.rules ?? STAFFING_RULES;
  const allDates = datesOfMonth(input.year, input.month);
  const resolved = allDates.map((date) => ({ date, day: resolveDay(input.workHours, date, holidays, input.overrides ?? {}) }));
  const openDates = resolved.filter((r) => !r.day.closed && r.day.window.endMinutes - r.day.window.startMinutes >= MIN_PAID).map((r) => r.date);
  const employees = input.employees.filter((e) => !e.isOwner).map((e) => employeeForMonth(e, month));
  if (!openDates.length || !employees.length) return [];

  const emps: Emp[] = employees.map((e) => {
    const blocked = new Set(input.blockedDays?.[e.id] ?? []);
    const bounds = { first: allDates[0], last: allDates[allDates.length - 1] };
    return {
      source: e,
      kind: kindOf(e),
      target: 0,
      allowed: openDates.map((date) => mayWorkOn(e, date) && !blocked.has(date)),
      maxPerWeek: Math.min(6, e.maxDaysPerWeek ?? 6),
      caps: e.weeklyHours != null ? weeklyBudgetMinutes(e, openDates, bounds, input.workHours) : undefined,
      outside: new Set((input.adjacentShifts ?? []).filter((s) => s.employeeId === e.id && !allDates.includes(s.date)).map((s) => s.date)),
    };
  });
  for (const emp of emps) {
    emp.target = emp.caps
      ? [...emp.caps.values()].reduce((n, m) => n + Math.floor(m / SLOT) * SLOT, 0)
      : Math.floor(monthlyTargetMinutesFor(emp.source, openDates, input.workHours) / SLOT) * SLOT;
  }
  const hasRoles = emps.some((e) => e.kind !== "G");

  const weekdayOf = (date: string) => effectiveWeekdayKey(date, holidays);
  const days: DayInfo[] = openDates.map((date) => {
    // Tiệm mở liên tục; nếu có ngày nhập nhiều khối thì xếp trong khung đầu–cuối.
    const block = resolved.find((r) => r.date === date)!.day.window;
    const slots = (block.endMinutes - block.startMinutes) / SLOT;
    const windows = staffingWindows([block], weekdayOf(date), rules);
    const need = Array.from({ length: Math.ceil(slots) }, (_, i) => {
      const minute = block.startMinutes + i * SLOT;
      return windows.reduce((m, w) => (w.startMinutes <= minute && w.endMinutes > minute ? Math.max(m, w.minStaff) : m), 0);
    });
    return { date, open: block.startMinutes, close: block.endMinutes, week: weekStartOf(date), busy: BUSY_DAYS.includes(weekdayKeyOf(parseIsoDate(date))), need };
  });
  const D = days.length;
  const E = emps.length;
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));

  // ---- state ----
  const grid: Cell[][] = emps.map(() => Array<Cell>(D).fill(null));
  const dayCost = new Float64Array(D);
  const counts = [new Int8Array(32), new Int8Array(32), new Int8Array(32)];

  type Priority = [number,number,number,number];
  const earlier=(a:Priority,b:Priority)=>compareStaffingPriority(a,b)<0;
  let lastPriority:Priority=[0,0,0,0];
  let strictPriority=false;
  const costOfDay = (d: number): number => {
    const info = days[d];
    const n = info.need.length;
    for (const c of counts) c.fill(0, 0, n);
    let cost = 0;
    const priority:Priority=[0,0,0,0];
    for (let e = 0; e < E; e++) {
      const cell = grid[e][d];
      if (!cell) continue;
      if (cell.paid > 360) cost += W_LONG;
      if (cell.paid < 240) cost += W_SHORT;
      const end = cell.start + cell.paid + (cell.split ? cell.split.to-cell.split.from : calculatePause(cell.paid));
      const arr = counts[cell.role];
      for (let m = cell.start; m < end; m += SLOT) {
        if (cell.split && m>=cell.split.from && m<cell.split.to)continue;
        if (!cell.split && cell.pause >= 0 && m >= cell.pause && m < cell.pause + calculatePause(cell.paid)) continue;
        arr[(m - info.open) / SLOT]++;
      }
    }
    for (let i = 0; i < n; i++) {
      const k = counts[0][i], s = counts[1][i], total = k + s + counts[2][i];
      const minute = info.open + i * SLOT;
      const peak = minute >= RESTAURANT_POLICY.peak.startMinutes && minute < RESTAURANT_POLICY.peak.endMinutes;
      if(hasRoles && !peak)cost += W_ROLE_OVER * (Math.max(0,k-1)**2 + Math.max(0,s-1)**2);
      const optional=isOptionalCoverageTime(minute);
      priority[optional ? 1 : 0]+=hasRoles ? Number(k===0)+Number(s===0) : Number(total===0);
      if(peak)priority[info.busy ? 2 : 3]+=Math.max(0,info.need[i]-total);
      const roleCost=optional ? W_ROLE/100 : W_ROLE;
      if (hasRoles) {
        if (k === 0) cost += roleCost + (i === 0 || counts[0][i - 1] > 0 ? W_GAP_PIECE : 0);
        if (s === 0) cost += roleCost + (i === 0 || counts[1][i - 1] > 0 ? W_GAP_PIECE : 0);
      } else if (total === 0) cost += roleCost + (i === 0 || counts[0][i - 1] + counts[1][i - 1] + counts[2][i - 1] > 0 ? W_GAP_PIECE : 0);
      if (!optional && total === 0) cost += W_EMPTY;
      const need = info.need[i];
      if (total < need) cost += (peak ? (info.busy ? W_BUSY_PEAK : W_NORMAL_PEAK) : W_STAFF) * (need - total);
      else if (total > need) cost += W_OVER * (total - need) ** 2;
    }
    lastPriority=priority;
    return strictPriority ? priority[0]*1e12+priority[1]*1e9+priority[2]*1e6+priority[3]*1000+cost/1e6 : cost;
  };

  /** Đặt ca và chọn giờ nghỉ tốt nhất cho ngày đó; trả về chi phí ngày mới. */
  const place = (e: number, d: number, cell: Cell): number => {
    grid[e][d] = cell;
    if (!cell || cell.pause < 0 && calculatePause(cell.paid) === 0) return costOfDay(d);
    let best = Infinity, bestPause = -1;
    for (const p of pauseCandidates(cell.start, cell.paid)) {
      cell.pause = p;
      const c = costOfDay(d);
      if (c < best) { best = c; bestPause = p; }
    }
    cell.pause = bestPause;
    return best;
  };

  // ---- hard constraints ----
  const worksOn = (e: number, date: string): boolean => {
    const d = dayIndex.get(date);
    return d != null ? grid[e][d] != null : emps[e].outside.has(date);
  };
  const canAdd = (e: number, d: number, ignore = -1): boolean => {
    const emp = emps[e];
    if (!emp.allowed[d] || grid[e][d]) return false;
    const week = days[d].week;
    let inWeek = 0;
    for (let x = 0; x < D; x++) if (x !== ignore && grid[e][x] && days[x].week === week) inWeek++;
    if (inWeek >= emp.maxPerWeek) return false;
    const skip = ignore >= 0 ? days[ignore].date : "";
    let run = 1;
    for (let c = isoAddDays(days[d].date, -1); c !== skip && worksOn(e, c); c = isoAddDays(c, -1)) run++;
    for (let c = isoAddDays(days[d].date, 1); c !== skip && worksOn(e, c); c = isoAddDays(c, 1)) run++;
    return run <= 6;
  };
  const weekRoom = (e: number, week: string): number => {
    const cap = emps[e].caps?.get(week);
    if (cap == null) return Infinity;
    let used = 0;
    for (let x = 0; x < D; x++) if (grid[e][x] && days[x].week === week) used += grid[e][x]!.paid;
    return cap - used;
  };
  const presence = (paid: number) => paid + calculatePause(paid);
  const clampStart = (d: number, start: number, paid: number) =>
    Math.max(days[d].open, Math.min(days[d].close - presence(paid), start));
  const defaultRole = (e: number): Role => (emps[e].kind === "K" ? 0 : emps[e].kind === "S" ? 1 : emps[e].kind === "B" ? 1 : 2);

  const rand = seededRandom(`ansushibar-${month}`);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const randomStart = (d: number, paid: number) => {
    const latest = days[d].close - presence(paid);
    const choices = (latest - days[d].open) / SLOT;
    const r = rand();
    // Hay dùng đầu hoặc cuối ngày; còn lại rải đều.
    if (r < 0.3) return days[d].open;
    if (r < 0.6) return latest;
    return days[d].open + Math.floor(rand() * (choices + 1)) * SLOT;
  };

  // ---- initial solution: rải ngày đều, chia giờ đều ----
  const order = [...emps.keys()].sort((a, b) => emps[a].allowed.filter(Boolean).length - emps[b].allowed.filter(Boolean).length);
  // Người cùng bộ phận lệch pha ngày nghỉ, nếu không 2 bếp cùng nghỉ một ngày và
  // giới hạn 6 ngày liên tiếp khoá cứng mẫu đó, phép đổi từng ca không gỡ ra được.
  const phaseOf = (e: number) => {
    const same = [...emps.keys()].filter((x) => emps[x].kind === emps[e].kind);
    return same.indexOf(e) / same.length;
  };
  const fill = (e: number, groupDays: number[], target: number) => {
    // Tuần lẻ ở rìa tháng (hợp đồng theo tuần) có thể ít hơn 3 h: cho một ca ngắn.
    const minPaid = Math.min(MIN_PAID, target);
    if (minPaid < SLOT) return;
    const allowedDays = groupDays.filter((d) => emps[e].allowed[d]);
    let n = Math.max(Math.ceil(target / MAX_PAID), Math.round(target / 330));
    n = Math.min(n, Math.max(1, Math.floor(target / MIN_PAID)), allowedDays.length);
    const chosen: number[] = [];
    const open = (d: number) => { grid[e][d] = { start: 0, paid: 0, pause: -1, role: defaultRole(e) }; chosen.push(d); };
    allowedDays.forEach((d, i) => {
      if (chosen.length < n && (chosen.length + 1 - phaseOf(e)) / n <= (i + 1) / allowedDays.length && canAdd(e, d)) open(d);
    });
    for (const d of allowedDays) { if (chosen.length >= n) break; if (canAdd(e, d)) open(d); }
    let remaining = target;
    chosen.sort((a, b) => a - b).forEach((d, i) => {
      const left = chosen.length - i;
      let paid = Math.round(remaining / left / SLOT) * SLOT;
      paid = Math.max(minPaid, Math.min(MAX_PAID, paid, remaining - (remaining % SLOT), days[d].close - days[d].open - calculatePause(paid)));
      if (paid < minPaid || remaining - paid < 0) { grid[e][d] = null; return; }
      remaining -= paid;
      grid[e][d] = { start: clampStart(d, i % 2 ? days[d].close : days[d].open, paid), paid, pause: -1, role: defaultRole(e) };
    });
    // Phần dư (do giới hạn 8 h) dồn vào ngày còn chỗ, rồi mở ngày mới.
    for (const d of groupDays) {
      const cell = grid[e][d];
      if (!cell || remaining < SLOT) continue;
      let add = Math.min(remaining, MAX_PAID - cell.paid);
      add -= add % SLOT;
      while (add >= SLOT && presence(cell.paid + add) > days[d].close - days[d].open) add -= SLOT;
      if (add >= SLOT) { cell.paid += add; remaining -= add; cell.start = clampStart(d, cell.start, cell.paid); }
    }
    for (const d of groupDays) {
      if (remaining < minPaid || !canAdd(e, d)) continue;
      const paid = Math.min(MAX_PAID, remaining - (remaining % SLOT));
      grid[e][d] = { start: clampStart(d, days[d].open, paid), paid, pause: -1, role: defaultRole(e) };
      remaining -= paid;
    }
  };
  for (const e of order) {
    const caps = emps[e].caps;
    const all = days.map((_, d) => d);
    if (!caps) fill(e, all, emps[e].target);
    else for (const [week, budget] of caps) fill(e, all.filter((d) => days[d].week === week), Math.floor(budget / SLOT) * SLOT);
  }
  for (let e = 0; e < E; e++) for (let d = 0; d < D; d++) {
    const cell = grid[e][d];
    if (cell) { const p = pauseCandidates(cell.start, cell.paid); cell.pause = p[Math.floor(p.length / 2)]; }
  }
  for (let d = 0; d < D; d++) dayCost[d] = costOfDay(d);
  for (let e = 0; e < E; e++) for (let d = 0; d < D; d++) if (grid[e][d]) dayCost[d] = place(e, d, grid[e][d]);

  // ---- simulated annealing ----
  const workingDays = (e: number) => { const out: number[] = []; for (let d = 0; d < D; d++) if (grid[e][d]) out.push(d); return out; };
  const iterations = input.iterations ?? 1200000;
  const T1 = 2;
  let total = dayCost.reduce((a, b) => a + b, 0);
  const priorities:Priority[]=days.map((_,d)=>{costOfDay(d);return [...lastPriority];});
  const sumPriority=()=>priorities.reduce<Priority>((n,p)=>[n[0]+p[0],n[1]+p[1],n[2]+p[2],n[3]+p[3]],[0,0,0,0]);
  let bestPriority=sumPriority();
  let bestTotal = total;
  let bestGrid = grid.map((row) => row.map((c) => (c ? { ...c } : null)));

  type Saved = { e: number; d: number; cell: Cell };
  // Ba lượt ủ, mỗi lượt khởi động lại từ lịch tốt nhất với nhiệt độ thấp dần.
  for (const T0 of [45000, 18000, 6000]) {
  if (T0 !== 45000) {
    bestGrid.forEach((row, e) => row.forEach((c, d) => { grid[e][d] = c ? { ...c } : null; }));
    for (let d = 0; d < D; d++) dayCost[d] = costOfDay(d);
    total = dayCost.reduce((a, b) => a + b, 0);
    days.forEach((_,d)=>{costOfDay(d);priorities[d]=[...lastPriority];});
  }
  for (let it = 0; it < iterations; it++) {
    const temp = T0 * (T1 / T0) ** (it / iterations);
    const e = Math.floor(rand() * E);
    const mine = workingDays(e);
    if (!mine.length) continue;
    const saved: Saved[] = [];
    const touched = new Set<number>();
    const set = (ee: number, d: number, cell: Cell) => {
      saved.push({ e: ee, d, cell: grid[ee][d] ? { ...grid[ee][d]! } : null });
      grid[ee][d] = cell; touched.add(d);
    };
    const r = rand();
    let ok = true;
    if (r < 0.3) {
      // dịch giờ bắt đầu
      const d = pick(mine), c = grid[e][d]!;
      const step = rand() < 0.6 ? (rand() < 0.5 ? -1 : 1) * SLOT * (1 + Math.floor(rand() * 3)) : randomStart(d, c.paid) - c.start;
      const start = clampStart(d, c.start + step, c.paid);
      if (start === c.start) ok = false; else set(e, d, { ...c, start, pause: c.pause + start - c.start });
    } else if (r < 0.55) {
      // chuyển 30–60 phút giữa hai ngày của cùng người
      if (mine.length < 2) ok = false;
      else {
        const a = pick(mine), b = pick(mine), amount = rand() < 0.7 ? SLOT : 2 * SLOT;
        const ca = grid[e][a]!, cb = grid[e][b]!;
        if (a === b || ca.paid - amount < MIN_PAID || cb.paid + amount > MAX_PAID || weekRoom(e, days[b].week) < (days[a].week === days[b].week ? 0 : amount)) ok = false;
        else {
          const na = ca.paid - amount, nb = cb.paid + amount;
          const sa = rand() < 0.5 ? ca.start : ca.start + presence(ca.paid) - presence(na);
          const sb = rand() < 0.5 ? cb.start : cb.start + presence(cb.paid) - presence(nb);
          if (presence(nb) > days[b].close - days[b].open) ok = false;
          else { set(e, a, { ...ca, paid: na, start: clampStart(a, sa, na) }); set(e, b, { ...cb, paid: nb, start: clampStart(b, sb, nb) }); }
        }
      }
    } else if (r < 0.75) {
      // chuyển cả ca sang ngày nghỉ khác; nửa số lần nhắm vào một ngày đang tệ nhất
      const a = pick(mine), c = grid[e][a]!;
      const mode = rand();
      let b = Math.floor(rand() * D);
      if (mode < 0.25) b = pick([...dayCost.keys()].sort((x, y) => dayCost[y] - dayCost[x]).slice(0, 6));
      else if (mode < 0.75) b = a + (rand() < 0.5 ? -1 : 1) * (1 + Math.floor(rand() * 3));
      if (b < 0 || b >= D) b = Math.floor(rand() * D);
      if (a === b || !canAdd(e, b, a) || presence(c.paid) > days[b].close - days[b].open || (days[a].week !== days[b].week && weekRoom(e, days[b].week) < c.paid)) ok = false;
      else { set(e, a, null); set(e, b, { ...c, start: randomStart(b, c.paid) }); }
    } else if (r < 0.83) {
      // tách: thêm một ngày ngắn từ ca dài
      const a = pick(mine), b = Math.floor(rand() * D), c = grid[e][a]!;
      const part = MIN_PAID + SLOT * Math.floor(rand() * 4);
      if (c.paid - part < MIN_PAID || !canAdd(e, b) || (days[a].week !== days[b].week && weekRoom(e, days[b].week) < part)) ok = false;
      else {
        const na = c.paid - part;
        set(e, a, { ...c, paid: na, start: clampStart(a, rand() < 0.5 ? c.start : c.start + presence(c.paid) - presence(na), na) });
        set(e, b, { start: randomStart(b, part), paid: part, pause: -1, role: c.role });
      }
    } else if (r < 0.9) {
      // gộp: bỏ một ngày, dồn giờ sang ngày khác
      if (mine.length < 2) ok = false;
      else {
        const a = pick(mine), b = pick(mine), ca = grid[e][a]!, cb = grid[e][b]!;
        const nb = cb.paid + ca.paid;
        if (a === b || nb > MAX_PAID || presence(nb) > days[b].close - days[b].open || (days[a].week !== days[b].week && weekRoom(e, days[b].week) < ca.paid)) ok = false;
        else { set(e, a, null); set(e, b, { ...cb, paid: nb, start: clampStart(b, rand() < 0.5 ? cb.start : cb.start - presence(nb) + presence(cb.paid), nb) }); }
      }
    } else if (r < 0.93) {
      // Exchange hours jointly: one cook opens a day while the other takes
      // those hours back on another day. Contracts remain unchanged.
      const f = Math.floor(rand()*E), a = pick(mine), b = Math.floor(rand()*D);
      const amount = SLOT*(1+Math.floor(rand()*16));
      if(f===e || emps[f].kind!==emps[e].kind || a===b)ok=false;
      else {
        const changes=[{ee:e,d:a,delta:-amount},{ee:f,d:a,delta:amount},{ee:e,d:b,delta:amount},{ee:f,d:b,delta:-amount}];
        for(const {ee,d,delta} of changes){
          const old=grid[ee][d],paid=(old?.paid ?? 0)+delta;
          if(paid<0 || paid>MAX_PAID || (paid>0 && (paid<MIN_PAID || !emps[ee].allowed[d] || presence(paid)>days[d].close-days[d].open))){ok=false;break;}
          set(ee,d,paid ? {start:old ? clampStart(d,old.start,paid) : randomStart(d,paid),paid,pause:-1,role:old?.role ?? defaultRole(ee)} : null);
        }
        if(ok)for(const ee of [e,f]){
          for(const week of new Set([days[a].week,days[b].week])){
            if(weekRoom(ee,week)<0 || days.filter((d,i)=>d.week===week && grid[ee][i]).length>emps[ee].maxPerWeek)ok=false;
          }
          for(const d of [a,b])if(grid[ee][d]){
            let run=1;
            for(let date=isoAddDays(days[d].date,-1);worksOn(ee,date);date=isoAddDays(date,-1))run++;
            for(let date=isoAddDays(days[d].date,1);worksOn(ee,date);date=isoAddDays(date,1))run++;
            if(run>6)ok=false;
          }
        }
      }
    } else if (r < 0.945) {
      // dời giờ nghỉ
      const d = pick(mine), c = grid[e][d]!;
      const valid = pauseCandidates(c.start, c.paid).filter((p) => p !== c.pause);
      if (!valid.length || valid[0] < 0) ok = false; else set(e, d, { ...c, pause: pick(valid) });
    } else if (r < 0.96 && emps[e].kind === "B") {
      const d = pick(mine), c = grid[e][d]!;
      set(e, d, { ...c, role: c.role === 0 ? 1 : 0 });
    } else {
      // đổi ngày giữa hai người cùng bộ phận
      const f = Math.floor(rand() * E);
      const a = pick(mine), b = Math.floor(rand() * D);
      if (f === e || emps[f].kind !== emps[e].kind || !grid[f][b] || grid[f][a] || grid[e][b] || !canAdd(e, b, a) || !canAdd(f, a, b)) ok = false;
      else {
        const ce = grid[e][a]!, cf = grid[f][b]!;
        if (presence(ce.paid) > days[b].close - days[b].open || presence(cf.paid) > days[a].close - days[a].open ||
          (days[a].week !== days[b].week && (weekRoom(e, days[b].week) < ce.paid || weekRoom(f, days[a].week) < cf.paid))) ok = false;
        else {
          set(e, a, null); set(f, b, null);
          set(e, b, { ...ce, start: clampStart(b, cf.start, ce.paid) });
          set(f, a, { ...cf, start: clampStart(a, ce.start, cf.paid) });
        }
      }
    }
    if (!ok) { for (const s of saved.reverse()) grid[s.e][s.d] = s.cell; continue; }

    const before = [...touched].reduce((n, d) => n + dayCost[d], 0);
    const newCosts = new Map<number, number>();
    const newPriorities = new Map<number,Priority>();
    for (const d of touched) {
      let c = costOfDay(d);
      for (let ee = 0; ee < E; ee++) {
        const cell = grid[ee][d];
        if (!cell || !calculatePause(cell.paid) || !saved.some((s) => s.e === ee && s.d === d)) continue;
        // Giữ giờ nghỉ cũ nếu còn hợp lệ; thỉnh thoảng mới tìm lại vị trí tốt nhất (đắt gấp ~7 lần).
        const valid = pauseCandidates(cell.start, cell.paid);
        if (!valid.includes(cell.pause) || rand() < 0.2) c = place(ee, d, cell);
        else if (cell.pause !== saved.find((s) => s.e === ee && s.d === d)?.cell?.pause) c = costOfDay(d);
      }
      c=costOfDay(d);
      newCosts.set(d, c);
      newPriorities.set(d,[...lastPriority]);
    }
    const after = [...newCosts.values()].reduce((a, b) => a + b, 0);
    const delta = after - before;
    if (delta <= 0 || rand() < Math.exp(-delta / temp)) {
      for (const [d, c] of newCosts) dayCost[d] = c;
      total += delta;
      for(const [d,p] of newPriorities)priorities[d]=p;
      const priority=sumPriority();
      if(earlier(priority,bestPriority) || (priority.every((n,i)=>n===bestPriority[i]) && total<bestTotal-1e-6)){
        bestPriority=priority;bestTotal=total;
        bestGrid=grid.map(row=>row.map(c=>c ? {...c} : null));
      }
    } else {
      for (const s of saved.reverse()) grid[s.e][s.d] = s.cell;
    }
  }
  }

  strictPriority=true;

  // ---- polish: thử mọi giờ bắt đầu cho từng ca và từng cặp ca cùng ngày ----
  bestGrid.forEach((row, e) => row.forEach((c, d) => { grid[e][d] = c ? { ...c } : null; }));
  const starts = (d: number, paid: number) => {
    const out: number[] = [];
    for (let t = days[d].open; t + presence(paid) <= days[d].close; t += SLOT) out.push(t);
    return out;
  };
  const placeAll = (d: number, list: number[]) => { let c = costOfDay(d); for (const e of list) c = place(e, d, grid[e][d]); return c; };
  for (let d = 0; d < D; d++) {
    const here = [...emps.keys()].filter((e) => grid[e][d]);
    let current = placeAll(d, here);
    for (let round = 0, improved = true; improved && round < 4; round++) {
      improved = false;
      for (let i = 0; i < here.length; i++) for (let j = i; j < here.length; j++) {
        const a = grid[here[i]][d]!, b = grid[here[j]][d]!;
        const keep = { sa: a.start, sb: b.start, pa: a.pause, pb: b.pause };
        let best = current, bestA = keep.sa, bestB = keep.sb;
        for (const ta of starts(d, a.paid)) for (const tb of i === j ? [ta] : starts(d, b.paid)) {
          a.start = ta; b.start = tb;
          const c = placeAll(d, i === j ? [here[i]] : [here[i], here[j]]);
          if (c < best - 1e-6) { best = c; bestA = ta; bestB = tb; }
        }
        a.start = bestA; b.start = i === j ? bestA : bestB;
        if (best < current - 1e-6) { improved = true; current = placeAll(d, here); }
        else { a.start = keep.sa; b.start = i === j ? keep.sa : keep.sb; a.pause = keep.pa; b.pause = keep.pb; current = costOfDay(d); }
      }
    }
  }
  // Optional afternoon coverage permits a genuine unpaid split shift.
  // Keep workdays/contracts intact; each paid segment is 3–6h, so neither
  // segment needs an additional break and the daily paid cap still applies.
  for(let d=0;d<D;d++)for(let round=0;round<2;round++)for(let e=0;e<E;e++){
    const old=grid[e][d];if(!old || old.paid<2*MIN_PAID)continue;
    let best={cell:old,cost:costOfDay(d)};
    const optional=RESTAURANT_POLICY.optionalCoverage;
    for(let start=days[d].open;start<=optional.startMinutes-MIN_PAID;start+=SLOT)
    for(let from=optional.startMinutes;from<optional.endMinutes;from+=SLOT)
    for(let to=from+SLOT;to<=optional.endMinutes;to+=SLOT){
      const morning=from-start,evening=old.paid-morning,end=to+evening;
      if(morning<MIN_PAID || morning>360 || evening<MIN_PAID || evening>360 || end>days[d].close)continue;
      const cell={...old,start,pause:-1,split:{from,to}};
      grid[e][d]=cell;const cost=costOfDay(d);
      if(cost<best.cost)best={cell,cost};
    }
    grid[e][d]=best.cell;
  }
  bestGrid = grid;

  // ---- output ----
  const shifts: Shift[] = [];
  bestGrid.forEach((row, e) => row.forEach((cell, d) => {
    if (!cell) return;
    const emp = emps[e];
    if(cell.split){
      const end=cell.start+cell.paid+cell.split.to-cell.split.from;
      for(const [part,startMinutes,endMinutes] of [["am",cell.start,cell.split.from],["pm",cell.split.to,end]] as const){
        shifts.push({id:`opt-${emp.source.id}-${days[d].date}-${part}`,employeeId:emp.source.id,date:days[d].date,startMinutes,endMinutes,pauseMinutes:0,paidMinutes:endMinutes-startMinutes,shiftType:part==="am" ? "EARLY" : "LATE",generated:true,...(emp.kind==="B" ? {assignedRole:cell.role===0 ? "KITCHEN" as const : "SERVICE_SUSHI" as const} : {})});
      }
      return;
    }
    const pauseMinutes = calculatePause(cell.paid);
    const end = cell.start + cell.paid + pauseMinutes;
    const mid = (days[d].open + days[d].close) / 2;
    shifts.push({
      id: `opt-${emp.source.id}-${days[d].date}`,
      employeeId: emp.source.id,
      date: days[d].date,
      startMinutes: cell.start,
      endMinutes: end,
      ...(pauseMinutes > 0 ? { pauseStartMinutes: cell.pause } : {}),
      pauseMinutes,
      paidMinutes: cell.paid,
      shiftType: (cell.start + end) / 2 <= mid ? "EARLY" : "LATE",
      generated: true,
      ...(emp.kind === "B" ? { assignedRole: cell.role === 0 ? "KITCHEN" as const : "SERVICE_SUSHI" as const } : {}),
    });
  }));
  return shifts.sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes);
}

