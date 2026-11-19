/**
 * Personal-record (PR) progression.
 *
 * Rules (deliberately simple and deterministic so an exercise's whole history can be rebuilt cheaply):
 *  - Only completed, non-warm-up sets count.
 *  - PRs are evaluated per workout: for each kind, the best set of a workout becomes a PR when it is
 *    strictly better than the best of every earlier workout. Ties never count. Within a workout,
 *    the first set (by input order) reaching the workout's best value is credited.
 *  - The very first workout that has a value for a kind sets a PR (like Hevy, which shows PRs on
 *    first logs). `previous` is null for those records.
 *  - Comparisons use a small epsilon because weights may come from lb -> kg conversions.
 */
import { estimateOneRepMax } from './e1rm';
import type { ExerciseType, PrKind, SetType } from './types';

export interface PrSetInput {
  workoutId: string;
  setId: string;
  /** When the PR was achieved (set completion time, or workout start). Epoch ms. */
  achievedAt: number;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
}

export interface PrEvent {
  kind: PrKind;
  value: number;
  /** The previous best for this kind, or null if this is the first record. */
  previous: number | null;
  workoutId: string;
  setId: string;
  achievedAt: number;
}

const EPSILON = 1e-9;

/** Which PR kinds are tracked for an exercise type. */
export function prKindsForType(type: ExerciseType): PrKind[] {
  switch (type) {
    case 'weight_reps':
    case 'weighted_bodyweight':
      return ['heaviest_weight', 'best_e1rm', 'best_set_volume'];
    case 'bodyweight_reps':
    case 'assisted_bodyweight':
      // For assisted exercises more weight means more help, so only reps are a meaningful PR.
      return ['most_reps'];
    case 'duration':
      return ['longest_duration'];
    case 'distance_duration':
      return ['longest_distance', 'longest_duration'];
    case 'weight_distance':
      return ['heaviest_weight', 'longest_distance'];
  }
}

const pos = (n: number | null): number | null => (n != null && Number.isFinite(n) && n > 0 ? n : null);

/** The value a set contributes to a PR kind, or null when it does not apply. */
export function prValue(kind: PrKind, set: Pick<PrSetInput, 'weightKg' | 'reps' | 'durationS' | 'distanceM'>): number | null {
  switch (kind) {
    case 'heaviest_weight':
      return pos(set.weightKg);
    case 'best_e1rm':
      return pos(estimateOneRepMax(pos(set.weightKg), pos(set.reps)));
    case 'best_set_volume': {
      const w = pos(set.weightKg);
      const r = pos(set.reps);
      return w != null && r != null ? w * r : null;
    }
    case 'most_reps':
      return pos(set.reps);
    case 'longest_duration':
      return pos(set.durationS);
    case 'longest_distance':
      return pos(set.distanceM);
  }
}

/**
 * Computes the full PR progression for one exercise.
 * `sets` must be in chronological order (workout start, then set order); sets of one workout are
 * expected to be contiguous but this is not required.
 * Output is ordered by workout (in first-appearance order), then by `prKindsForType` order.
 */
export function computePrProgression(type: ExerciseType, sets: readonly PrSetInput[]): PrEvent[] {
  const kinds = prKindsForType(type);
  // Group by workout, preserving first-appearance order.
  const byWorkout = new Map<string, PrSetInput[]>();
  for (const s of sets) {
    if (s.setType === 'warmup') continue;
    let list = byWorkout.get(s.workoutId);
    if (!list) {
      list = [];
      byWorkout.set(s.workoutId, list);
    }
    list.push(s);
  }

  const best = new Map<PrKind, number>();
  const events: PrEvent[] = [];
  for (const workoutSets of byWorkout.values()) {
    for (const kind of kinds) {
      let top: { value: number; set: PrSetInput } | null = null;
      for (const s of workoutSets) {
        const v = prValue(kind, s);
        if (v == null) continue;
        if (!top || v > top.value + EPSILON) top = { value: v, set: s };
      }
      if (!top) continue;
      const prev = best.get(kind);
      if (prev === undefined || top.value > prev + EPSILON) {
        events.push({
          kind,
          value: top.value,
          previous: prev ?? null,
          workoutId: top.set.workoutId,
          setId: top.set.setId,
          achievedAt: top.set.achievedAt,
        });
        best.set(kind, top.value);
      }
    }
  }
  return events;
}

/** The latest (= best) record per kind from a progression. */
export function currentBests<T extends { kind: PrKind; value: number }>(events: readonly T[]): Map<PrKind, T> {
  const out = new Map<PrKind, T>();
  for (const e of events) {
    const cur = out.get(e.kind);
    if (!cur || e.value > cur.value + EPSILON) out.set(e.kind, e);
  }
  return out;
}

/**
 * Best weight lifted for at least `r` reps, for r = 1..maxReps (non-warm-up sets).
 * A set of 100 kg x 5 also counts as a 4-rep (and 3, 2, 1) max, so values never increase with r.
 * Entries are null when nothing qualifies.
 */
export function repMaxTable(
  sets: readonly Pick<PrSetInput, 'setType' | 'weightKg' | 'reps' | 'setId' | 'workoutId' | 'achievedAt'>[],
  maxReps = 12,
): ({ reps: number; weightKg: number; setId: string; workoutId: string; achievedAt: number } | null)[] {
  // exact[r] = heaviest set with exactly r reps (r capped at maxReps; more reps still count for maxReps)
  const exact: (typeof sets)[number][] = [];
  for (const s of sets) {
    if (s.setType === 'warmup') continue;
    const w = pos(s.weightKg);
    const r = pos(s.reps);
    if (w == null || r == null) continue;
    const idx = Math.min(Math.floor(r), maxReps);
    const cur = exact[idx];
    if (!cur || w > (cur.weightKg ?? 0) + EPSILON) exact[idx] = s;
  }
  const out: ReturnType<typeof repMaxTable> = new Array(maxReps).fill(null);
  let running: (typeof sets)[number] | undefined;
  for (let r = maxReps; r >= 1; r--) {
    const cand = exact[r];
    if (cand && (!running || (cand.weightKg ?? 0) > (running.weightKg ?? 0) + EPSILON)) running = cand;
    if (running) {
      out[r - 1] = {
        reps: r,
        weightKg: running.weightKg ?? 0,
        setId: running.setId,
        workoutId: running.workoutId,
        achievedAt: running.achievedAt,
      };
    }
  }
  return out;
}
