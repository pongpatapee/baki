/**
 * Warm-up set generator. Unit-agnostic: pass weights in the unit you display (kg or lb).
 * Weights are rounded to the nearest loadable increment (in integer thousandths to avoid float bugs),
 * never go below the bar, never reach the working weight, and duplicates are removed.
 */

export interface WarmupStep {
  /** Fraction of the working weight; 0 means "empty bar". */
  percent: number;
  reps: number;
}

export const DEFAULT_WARMUP_SCHEME: readonly WarmupStep[] = [
  { percent: 0, reps: 10 },
  { percent: 0.4, reps: 5 },
  { percent: 0.6, reps: 3 },
  { percent: 0.8, reps: 2 },
];

export interface WarmupSet {
  weight: number;
  reps: number;
  /** Percent of working weight actually loaded (after rounding), 0..1. */
  percent: number;
  isBar: boolean;
}

const SCALE = 1000;

export function generateWarmups(
  workingWeight: number,
  barWeight: number,
  increment: number,
  scheme: readonly WarmupStep[] = DEFAULT_WARMUP_SCHEME,
): WarmupSet[] {
  const work = Math.round(workingWeight * SCALE);
  const bar = Math.max(0, Math.round(barWeight * SCALE));
  const inc = Math.round(increment * SCALE);
  if (!Number.isFinite(workingWeight) || work <= 0) return [];

  const out: WarmupSet[] = [];
  const seen = new Set<number>();
  for (const step of scheme) {
    let w: number;
    if (step.percent <= 0) {
      w = bar;
    } else {
      const raw = work * step.percent;
      // Round to the nearest load the plates can make on top of the bar.
      w = inc > 0 ? bar + Math.round((raw - bar) / inc) * inc : Math.round(raw);
      w = Math.max(bar, w);
    }
    if (w >= work) continue;
    if (w <= 0 && bar === 0) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push({ weight: w / SCALE, reps: step.reps, percent: w / work, isBar: w === bar && bar > 0 });
  }
  return out.sort((a, b) => a.weight - b.weight);
}
