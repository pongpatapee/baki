/**
 * Pure aggregations behind the Stats dashboard and the exercise detail charts.
 * All inputs are completed sets of finished, non-deleted workouts in canonical units.
 * Calendar math (weeks, ranges) is done in the device's local time zone.
 */
import { estimateOneRepMax } from './e1rm';
import type { ExerciseType, MuscleGroup, SetType } from './types';
import { countsVolume, setVolumeKg } from './volume';

// ---------- Input shapes ----------

export interface StatWorkout {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number;
}

export interface StatSet {
  workoutId: string;
  workoutTitle: string;
  startedAt: number;
  exerciseId: string;
  exerciseType: ExerciseType;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  setId: string;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  rpe: number | null;
  completedAt: number | null;
}

// ---------- Ranges ----------

export const STAT_RANGES = ['1M', '3M', '6M', '1Y', 'ALL'] as const;
export type StatRange = (typeof STAT_RANGES)[number];
export const STAT_RANGE_LABELS: Record<StatRange, string> = {
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  '1Y': '1Y',
  ALL: 'All',
};

/** Start of the range (local midnight, `n` calendar months back), or null for "all time". */
export function rangeStart(range: StatRange, nowMs: number): number | null {
  if (range === 'ALL') return null;
  const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[range];
  const d = new Date(nowMs);
  const day = d.getDate();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  // Clamp the day to the target month's length (e.g. 31 Mar -> 28/29 Feb).
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

export function filterByRange<T>(items: readonly T[], time: (item: T) => number, range: StatRange, nowMs: number): T[] {
  const start = rangeStart(range, nowMs);
  if (start == null) return [...items];
  return items.filter((i) => time(i) >= start);
}

// ---------- Weeks (ISO, Monday start, local time) ----------

/** Local midnight of the Monday starting the ISO week containing `ms`. */
export function weekStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

/** Adds whole calendar weeks (DST-safe: uses local date arithmetic, not 7 * 24h). */
export function addWeeks(weekStartMs: number, n: number): number {
  const d = new Date(weekStartMs);
  d.setDate(d.getDate() + n * 7);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** ISO 8601 week number and week-year for a date. */
export function isoWeek(ms: number): { year: number; week: number } {
  const d = new Date(ms);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dow + 3); // Thursday of this week
  const year = target.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  const firstDow = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDow + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year, week };
}

export interface WeekBucket {
  weekStart: number;
  volumeKg: number;
  workouts: number;
  durationS: number;
  sets: number;
}

/**
 * Weekly totals, one bucket per week with no gaps, from the range start (or first workout for "all")
 * through the current week. Volume includes warm-ups (Hevy convention); set counts exclude warm-ups.
 */
export function weeklyBuckets(
  workouts: readonly StatWorkout[],
  sets: readonly StatSet[],
  range: StatRange,
  nowMs: number,
): WeekBucket[] {
  const start = rangeStart(range, nowMs);
  const inRange = (t: number) => start == null || t >= start;
  const ws = workouts.filter((w) => inRange(w.startedAt));
  const ss = sets.filter((s) => inRange(s.startedAt));
  const firstMs = start ?? (ws.length ? Math.min(...ws.map((w) => w.startedAt)) : null);
  if (firstMs == null) return [];
  const first = weekStart(firstMs);
  const last = weekStart(nowMs);
  const buckets: WeekBucket[] = [];
  const index = new Map<number, WeekBucket>();
  for (let w = first; w <= last; w = addWeeks(w, 1)) {
    const b: WeekBucket = { weekStart: w, volumeKg: 0, workouts: 0, durationS: 0, sets: 0 };
    buckets.push(b);
    index.set(w, b);
    if (buckets.length > 5000) break; // defensive: corrupt dates
  }
  for (const w of ws) {
    const b = index.get(weekStart(w.startedAt));
    if (!b) continue;
    b.workouts += 1;
    b.durationS += Math.max(0, Math.round((w.endedAt - w.startedAt) / 1000));
  }
  for (const s of ss) {
    const b = index.get(weekStart(s.startedAt));
    if (!b) continue;
    b.volumeKg += setVolumeKg(s.exerciseType, s);
    if (s.setType !== 'warmup') b.sets += 1;
  }
  return buckets;
}

/**
 * Weekly streak: consecutive ISO weeks with at least one workout.
 * The current week does not break the streak while it is still in progress.
 */
export function weeklyStreak(workoutStarts: readonly number[], nowMs: number): { current: number; longest: number } {
  if (workoutStarts.length === 0) return { current: 0, longest: 0 };
  const weeks = new Set(workoutStarts.map(weekStart));
  const sorted = [...weeks].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of sorted) {
    run = prev != null && addWeeks(prev, 1) === w ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = w;
  }
  let cursor = weekStart(nowMs);
  if (!weeks.has(cursor)) cursor = addWeeks(cursor, -1);
  let current = 0;
  while (weeks.has(cursor)) {
    current += 1;
    cursor = addWeeks(cursor, -1);
  }
  return { current, longest };
}

// ---------- Headline ----------

export interface HeadlineStats {
  workouts: number;
  volumeKg: number;
  durationS: number;
  sets: number;
  reps: number;
}

export function headlineStats(workouts: readonly StatWorkout[], sets: readonly StatSet[]): HeadlineStats {
  let volumeKg = 0;
  let count = 0;
  let reps = 0;
  for (const s of sets) {
    volumeKg += setVolumeKg(s.exerciseType, s);
    if (s.setType !== 'warmup') count += 1;
    reps += s.reps != null && s.reps > 0 ? s.reps : 0;
  }
  const durationS = workouts.reduce((sum, w) => sum + Math.max(0, Math.round((w.endedAt - w.startedAt) / 1000)), 0);
  return { workouts: workouts.length, volumeKg, durationS, sets: count, reps };
}

// ---------- Muscle distribution ----------

export interface MuscleShare {
  muscle: MuscleGroup;
  sets: number;
  /** Share of the total weighted set count, 0..1. */
  fraction: number;
}

/** Working sets per muscle group: the primary muscle gets 1 set, each secondary muscle 0.5. */
export function muscleDistribution(sets: readonly StatSet[]): MuscleShare[] {
  const totals = new Map<MuscleGroup, number>();
  const add = (m: MuscleGroup, n: number) => totals.set(m, (totals.get(m) ?? 0) + n);
  for (const s of sets) {
    if (s.setType === 'warmup') continue;
    add(s.primaryMuscle, 1);
    for (const m of s.secondaryMuscles) if (m !== s.primaryMuscle) add(m, 0.5);
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([muscle, n]) => ({ muscle, sets: n, fraction: sum > 0 ? n / sum : 0 }))
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

// ---------- Top exercises ----------

export interface ExerciseUsage {
  exerciseId: string;
  sets: number;
  workouts: number;
  volumeKg: number;
  lastPerformedAt: number;
}

/** Exercises ranked by working sets (ties: more workouts, then most recent). */
export function topExercises(sets: readonly StatSet[], limit = 10): ExerciseUsage[] {
  const map = new Map<string, ExerciseUsage & { _w: Set<string> }>();
  for (const s of sets) {
    let u = map.get(s.exerciseId);
    if (!u) {
      u = { exerciseId: s.exerciseId, sets: 0, workouts: 0, volumeKg: 0, lastPerformedAt: 0, _w: new Set() };
      map.set(s.exerciseId, u);
    }
    if (s.setType !== 'warmup') u.sets += 1;
    u._w.add(s.workoutId);
    u.volumeKg += setVolumeKg(s.exerciseType, s);
    u.lastPerformedAt = Math.max(u.lastPerformedAt, s.startedAt);
  }
  return [...map.values()]
    .map(({ _w, ...u }) => ({ ...u, workouts: _w.size }))
    .sort((a, b) => b.sets - a.sets || b.workouts - a.workouts || b.lastPerformedAt - a.lastPerformedAt)
    .slice(0, limit);
}

// ---------- Per-exercise sessions ----------

export interface ExerciseSession {
  workoutId: string;
  workoutTitle: string;
  startedAt: number;
  /** Best estimated 1RM of a working set (kg), null if not applicable. */
  bestE1rmKg: number | null;
  heaviestWeightKg: number | null;
  bestSetVolumeKg: number | null;
  /** All completed sets including warm-ups. */
  sessionVolumeKg: number;
  totalReps: number;
  bestDurationS: number | null;
  bestDistanceM: number | null;
  totalDurationS: number;
  totalDistanceM: number;
  workingSets: number;
}

const maxOrNull = (a: number | null, b: number | null): number | null => {
  if (b == null || !Number.isFinite(b) || b <= 0) return a;
  return a == null || b > a ? b : a;
};

/**
 * One entry per workout in which the exercise was performed, in chronological order.
 * Bests exclude warm-ups; totals include every completed set.
 */
export function exerciseSessions(sets: readonly StatSet[]): ExerciseSession[] {
  const map = new Map<string, ExerciseSession>();
  for (const s of sets) {
    let x = map.get(s.workoutId);
    if (!x) {
      x = {
        workoutId: s.workoutId,
        workoutTitle: s.workoutTitle,
        startedAt: s.startedAt,
        bestE1rmKg: null,
        heaviestWeightKg: null,
        bestSetVolumeKg: null,
        sessionVolumeKg: 0,
        totalReps: 0,
        bestDurationS: null,
        bestDistanceM: null,
        totalDurationS: 0,
        totalDistanceM: 0,
        workingSets: 0,
      };
      map.set(s.workoutId, x);
    }
    const vol = setVolumeKg(s.exerciseType, s);
    x.sessionVolumeKg += vol;
    x.totalReps += s.reps != null && s.reps > 0 ? s.reps : 0;
    x.totalDurationS += s.durationS != null && s.durationS > 0 ? s.durationS : 0;
    x.totalDistanceM += s.distanceM != null && s.distanceM > 0 ? s.distanceM : 0;
    if (s.setType === 'warmup') continue;
    x.workingSets += 1;
    const loaded = countsVolume(s.exerciseType) || s.exerciseType === 'weight_distance';
    if (loaded) x.heaviestWeightKg = maxOrNull(x.heaviestWeightKg, s.weightKg);
    if (countsVolume(s.exerciseType)) {
      x.bestE1rmKg = maxOrNull(x.bestE1rmKg, estimateOneRepMax(s.weightKg, s.reps));
      x.bestSetVolumeKg = maxOrNull(x.bestSetVolumeKg, vol);
    }
    x.bestDurationS = maxOrNull(x.bestDurationS, s.durationS);
    x.bestDistanceM = maxOrNull(x.bestDistanceM, s.distanceM);
  }
  return [...map.values()].sort((a, b) => a.startedAt - b.startedAt);
}

// ---------- Chart metrics for an exercise ----------

export const EXERCISE_METRICS = [
  'e1rm',
  'heaviest',
  'set_volume',
  'session_volume',
  'reps',
  'duration',
  'distance',
] as const;
export type ExerciseMetric = (typeof EXERCISE_METRICS)[number];

export const EXERCISE_METRIC_LABELS: Record<ExerciseMetric, string> = {
  e1rm: 'Est. 1RM',
  heaviest: 'Heaviest Weight',
  set_volume: 'Best Set Volume',
  session_volume: 'Session Volume',
  reps: 'Total Reps',
  duration: 'Duration',
  distance: 'Distance',
};

/** Which chart metrics make sense for an exercise type, in display order. */
export function metricsForType(type: ExerciseType): ExerciseMetric[] {
  switch (type) {
    case 'weight_reps':
    case 'weighted_bodyweight':
      return ['e1rm', 'heaviest', 'set_volume', 'session_volume', 'reps'];
    case 'bodyweight_reps':
    case 'assisted_bodyweight':
      return ['reps'];
    case 'duration':
      return ['duration'];
    case 'distance_duration':
      return ['distance', 'duration'];
    case 'weight_distance':
      return ['heaviest', 'distance'];
  }
}

/** What kind of quantity a metric is, so the UI can convert/format it. */
export function metricQuantity(metric: ExerciseMetric): 'weight' | 'reps' | 'duration' | 'distance' {
  switch (metric) {
    case 'e1rm':
    case 'heaviest':
    case 'set_volume':
    case 'session_volume':
      return 'weight';
    case 'reps':
      return 'reps';
    case 'duration':
      return 'duration';
    case 'distance':
      return 'distance';
  }
}

/** Canonical metric value of a session (kg / reps / seconds / meters), null if missing. */
export function sessionMetric(session: ExerciseSession, metric: ExerciseMetric): number | null {
  switch (metric) {
    case 'e1rm':
      return session.bestE1rmKg;
    case 'heaviest':
      return session.heaviestWeightKg;
    case 'set_volume':
      return session.bestSetVolumeKg;
    case 'session_volume':
      return session.sessionVolumeKg > 0 ? session.sessionVolumeKg : null;
    case 'reps':
      return session.totalReps > 0 ? session.totalReps : null;
    case 'duration':
      return session.bestDurationS;
    case 'distance':
      return session.bestDistanceM;
  }
}

/** Chart series for a metric: chronological points with non-null values. */
export function metricSeries(
  sessions: readonly ExerciseSession[],
  metric: ExerciseMetric,
): { t: number; value: number; workoutId: string }[] {
  const out: { t: number; value: number; workoutId: string }[] = [];
  for (const s of sessions) {
    const v = sessionMetric(s, metric);
    if (v != null) out.push({ t: s.startedAt, value: v, workoutId: s.workoutId });
  }
  return out;
}
