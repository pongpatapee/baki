/**
 * Plate calculator. Works in whatever unit the caller uses (kg or lb); internally all math is done in
 * integer thousandths of that unit so 2.5 + 1.25 never turns into 3.7499999.
 *
 * Plates are assumed to be available in unlimited pairs. The loading for one side is the heaviest
 * achievable amount <= target, using the fewest plates (ties broken towards heavier plates). This is
 * exact even for plate sets where greedy fails (e.g. 15 and 10 kg plates for 20 kg per side).
 */
import { KG_PER_LB } from './units';
import type { WeightUnit } from './types';

const SCALE = 1000;
const toMilli = (n: number) => Math.round(n * SCALE);
const fromMilli = (n: number) => n / SCALE;

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return Math.abs(a);
}

export interface PlateCount {
  plate: number;
  count: number;
}

export interface PlateResult {
  /** Plates for ONE side, heaviest first. */
  perSide: PlateCount[];
  /** Flat list of plates for one side, heaviest first (handy for drawing). */
  perSideList: number[];
  /** Total weight actually loaded (bar + both sides). */
  achieved: number;
  /** target - achieved (>= 0 unless the target is below the bar). */
  remainder: number;
  /** True when the target is lighter than the empty bar. */
  belowBar: boolean;
}

/** Largest per-side load (in DP units) we are willing to solve for; protects against absurd input. */
const MAX_STEPS = 200_000;

export function calculatePlates(target: number, barWeight: number, availablePlates: readonly number[]): PlateResult {
  const bar = Math.max(0, toMilli(barWeight));
  const tgt = toMilli(Math.max(0, target));
  const plates = [...new Set(availablePlates.map(toMilli).filter((p) => p > 0))].sort((a, b) => b - a);

  if (!Number.isFinite(target) || tgt < bar) {
    return { perSide: [], perSideList: [], achieved: fromMilli(bar), remainder: fromMilli(tgt - bar), belowBar: true };
  }
  const perSideTarget = Math.floor((tgt - bar) / 2);
  if (plates.length === 0 || perSideTarget === 0) {
    return { perSide: [], perSideList: [], achieved: fromMilli(bar), remainder: fromMilli(tgt - bar), belowBar: false };
  }

  const unit = plates.reduce((g, p) => gcd(g, p), 0);
  const steps = Math.floor(perSideTarget / unit);
  const sizes = plates.map((p) => p / unit);

  let chosen: number[];
  if (steps > MAX_STEPS) {
    chosen = greedy(steps, sizes);
  } else {
    // minCount[s] = fewest plates summing exactly to s; pick[s] = plate size index used last.
    const minCount = new Int32Array(steps + 1).fill(-1);
    const pick = new Int32Array(steps + 1).fill(-1);
    minCount[0] = 0;
    for (let s = 1; s <= steps; s++) {
      let bestCount = -1;
      let bestIdx = -1;
      // sizes are heaviest-first, so the first plate reaching the minimum is the heaviest.
      for (let i = 0; i < sizes.length; i++) {
        const prev = s - sizes[i]!;
        if (prev < 0) continue;
        const c = minCount[prev]!;
        if (c < 0) continue;
        if (bestCount < 0 || c + 1 < bestCount) {
          bestCount = c + 1;
          bestIdx = i;
        }
      }
      minCount[s] = bestCount;
      pick[s] = bestIdx;
    }
    let s = steps;
    while (s > 0 && minCount[s]! < 0) s--;
    chosen = [];
    while (s > 0) {
      const i = pick[s]!;
      chosen.push(sizes[i]!);
      s -= sizes[i]!;
    }
  }

  const perSideList = chosen.map((c) => c * unit).sort((a, b) => b - a);
  const perSideTotal = perSideList.reduce((a, b) => a + b, 0);
  const achieved = bar + perSideTotal * 2;
  const counts = new Map<number, number>();
  for (const p of perSideList) counts.set(p, (counts.get(p) ?? 0) + 1);
  return {
    perSide: [...counts.entries()].map(([plate, count]) => ({ plate: fromMilli(plate), count })),
    perSideList: perSideList.map(fromMilli),
    achieved: fromMilli(achieved),
    remainder: fromMilli(tgt - achieved),
    belowBar: false,
  };
}

function greedy(steps: number, sizes: number[]): number[] {
  const out: number[] = [];
  let left = steps;
  for (const p of sizes) {
    while (left >= p) {
      out.push(p);
      left -= p;
    }
  }
  return out;
}

/** Smallest total-weight step achievable with these plates (two of the smallest plate). */
export function loadIncrement(availablePlates: readonly number[]): number {
  const positive = availablePlates.filter((p) => p > 0);
  if (positive.length === 0) return 0;
  return fromMilli(2 * Math.min(...positive.map(toMilli)));
}

// ---------- Unit-aware setup ----------

export const DEFAULT_KG_BAR = 20;
export const DEFAULT_KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_LB_BAR = 45;
export const DEFAULT_LB_PLATES = [45, 35, 25, 10, 5, 2.5];

export interface PlateSetup {
  bar: number;
  plates: number[];
  /** True when the setup is the built-in default for the unit (the user never customised it). */
  isDefault: boolean;
}

const sameList = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && [...a].sort((x, y) => y - x).every((v, i) => Math.abs(v - [...b].sort((x, y) => y - x)[i]!) < 1e-6);

/**
 * Bar + plates in the user's unit. Settings are stored in kg; a lb user who never customised the
 * setup gets the standard lb set (45 lb bar, 45/35/25/10/5/2.5 lb plates) rather than awkward
 * converted kg plates. Customised values are converted and rounded to 0.01.
 */
export function resolvePlateSetup(barWeightKg: number, availablePlatesKg: readonly number[], unit: WeightUnit): PlateSetup {
  const isKgDefault = Math.abs(barWeightKg - DEFAULT_KG_BAR) < 1e-6 && sameList(availablePlatesKg, DEFAULT_KG_PLATES);
  if (unit === 'kg') {
    return {
      bar: round2(barWeightKg),
      plates: [...availablePlatesKg].map(round2).sort((a, b) => b - a),
      isDefault: isKgDefault,
    };
  }
  if (isKgDefault) return { bar: DEFAULT_LB_BAR, plates: [...DEFAULT_LB_PLATES], isDefault: true };
  const bar = round2(barWeightKg / KG_PER_LB);
  const plates = availablePlatesKg.map((p) => round2(p / KG_PER_LB)).sort((a, b) => b - a);
  return { bar, plates, isDefault: Math.abs(bar - DEFAULT_LB_BAR) < 1e-6 && sameList(plates, DEFAULT_LB_PLATES) };
}

/** Converts a user-unit setup back to kg for storage. */
export function plateSetupToKg(bar: number, plates: readonly number[], unit: WeightUnit): { barWeightKg: number; availablePlatesKg: number[] } {
  const f = unit === 'kg' ? 1 : KG_PER_LB;
  return {
    barWeightKg: bar * f,
    availablePlatesKg: [...new Set(plates)].filter((p) => p > 0).sort((a, b) => b - a).map((p) => p * f),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
