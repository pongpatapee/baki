/**
 * Pure workout logic: titles, set labels, previous-set matching, best sets, summaries,
 * routine diffing, history grouping and calendar grids. No React Native imports.
 */
import { estimateOneRepMax } from './e1rm';
import type { DistanceUnit, ExerciseType, SetType, SetValues, WeightUnit } from './types';
import { SET_FIELDS } from './types';
import { displayWeight, formatDuration, metersToUnit, parseDuration, trimNumber } from './units';
import { setVolumeKg, supportsOneRepMax } from './volume';

// ---------- Titles ----------

/** Hevy-style default title from the local time of day: "Morning Workout" etc. */
export function workoutTitleForTime(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Morning Workout';
  if (h >= 12 && h < 17) return 'Afternoon Workout';
  if (h >= 17 && h < 22) return 'Evening Workout';
  return 'Night Workout';
}

// ---------- Set columns & labels ----------

export type SetColumn = 'weight' | 'reps' | 'distance' | 'duration';

/** Input columns for an exercise type, in display order. */
export function setColumns(type: ExerciseType): SetColumn[] {
  const f = SET_FIELDS[type];
  const cols: SetColumn[] = [];
  if (f.weight) cols.push('weight');
  if (f.reps) cols.push('reps');
  if (f.distance) cols.push('distance');
  if (f.duration) cols.push('duration');
  return cols;
}

export function columnHeader(
  type: ExerciseType,
  col: SetColumn,
  weightUnit: WeightUnit,
  distanceUnit: DistanceUnit,
): string {
  switch (col) {
    case 'weight': {
      const u = weightUnit === 'kg' ? 'KG' : 'LBS';
      if (type === 'weighted_bodyweight') return `+${u}`;
      if (type === 'assisted_bodyweight') return `−${u}`;
      return u;
    }
    case 'reps':
      return 'REPS';
    case 'distance':
      return distanceUnit.toUpperCase();
    case 'duration':
      return 'TIME';
  }
}

// ---------- Set values ----------

type Values = Pick<SetValues, 'weightKg' | 'reps' | 'durationS' | 'distanceM'>;

/** Whether a set has the minimum data needed to count as performed. */
export function isSetLoggable(type: ExerciseType, v: Values): boolean {
  switch (type) {
    case 'weight_reps':
    case 'bodyweight_reps':
    case 'weighted_bodyweight':
    case 'assisted_bodyweight':
      return v.reps != null && v.reps > 0;
    case 'duration':
      return v.durationS != null && v.durationS > 0;
    case 'distance_duration':
      return (v.distanceM != null && v.distanceM > 0) || (v.durationS != null && v.durationS > 0);
    case 'weight_distance':
      return v.distanceM != null && v.distanceM > 0;
  }
}

/** Fills the empty fields used by the exercise type from a fallback (e.g. the previous set). */
export function fillMissing(type: ExerciseType, v: Values, fallback: Values | null | undefined): Values {
  if (!fallback) return { ...v };
  const f = SET_FIELDS[type];
  return {
    weightKg: f.weight && v.weightKg == null ? fallback.weightKg : v.weightKg,
    reps: f.reps && v.reps == null ? fallback.reps : v.reps,
    durationS: f.duration && v.durationS == null ? fallback.durationS : v.durationS,
    distanceM: f.distance && v.distanceM == null ? fallback.distanceM : v.distanceM,
  };
}

/**
 * Matches the sets of the current exercise to the sets of the previous session, for the
 * PREVIOUS column. Warm-ups are matched to previous warm-ups and working sets to previous
 * working sets, each by position, so adding a warm-up does not shift every row.
 */
export function matchPreviousSets<P extends { setType: SetType }>(
  current: { setType: SetType }[],
  previous: P[],
): (P | null)[] {
  const prevWarm = previous.filter((p) => p.setType === 'warmup');
  const prevWork = previous.filter((p) => p.setType !== 'warmup');
  let w = 0;
  let k = 0;
  return current.map((c) => {
    if (c.setType === 'warmup') return prevWarm[w++] ?? null;
    return prevWork[k++] ?? null;
  });
}

/** Compact one-line description of a set, e.g. "100kg × 5", "+20kg × 8", "2.5km · 12:00". */
export function formatSetCompact(
  type: ExerciseType,
  v: Values,
  weightUnit: WeightUnit,
  distanceUnit: DistanceUnit,
  opts: { spaced?: boolean } = {},
): string {
  const sp = opts.spaced ? ' ' : '';
  const w = (kg: number | null) => (kg == null ? null : `${displayWeight(kg, weightUnit)}${sp}${weightUnit}`);
  const d = (m: number | null) =>
    m == null ? null : `${trimNumber(metersToUnit(m, distanceUnit), 2)}${sp}${distanceUnit}`;
  const reps = v.reps == null ? null : String(v.reps);
  switch (type) {
    case 'weight_reps': {
      const ws = w(v.weightKg);
      if (ws && reps) return `${ws} × ${reps}`;
      if (reps) return `${reps} reps`;
      return ws ?? '-';
    }
    case 'bodyweight_reps':
      return reps ? `${reps} reps` : '-';
    case 'weighted_bodyweight':
    case 'assisted_bodyweight': {
      const sign = type === 'weighted_bodyweight' ? '+' : '−';
      const ws = v.weightKg != null && v.weightKg !== 0 ? `${sign}${w(v.weightKg)}` : null;
      if (ws && reps) return `${ws} × ${reps}`;
      if (reps) return `${reps} reps`;
      return ws ?? '-';
    }
    case 'duration':
      return v.durationS == null ? '-' : formatDuration(v.durationS);
    case 'distance_duration': {
      const parts = [d(v.distanceM), v.durationS == null ? null : formatDuration(v.durationS)].filter(Boolean);
      return parts.length ? parts.join(' · ') : '-';
    }
    case 'weight_distance': {
      const parts = [w(v.weightKg), d(v.distanceM)].filter(Boolean);
      return parts.length ? parts.join(' · ') : '-';
    }
  }
}

/**
 * Parses a timer typed on a number pad. With a colon it is "m:ss"/"h:mm:ss"; plain digits are
 * read right-to-left as seconds, minutes, hours: "90" -> 90s, "130" -> 1:30, "10000" -> 1:00:00.
 */
export function parseTimerInput(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (t.includes(':')) return parseDuration(t);
  if (!/^\d+$/.test(t)) return null;
  if (t.length <= 2) return Number(t);
  const sec = Number(t.slice(-2));
  const rest = t.slice(0, -2);
  if (rest.length <= 2) return Number(rest) * 60 + sec;
  return Number(rest.slice(0, -2)) * 3600 + Number(rest.slice(-2)) * 60 + sec;
}

// ---------- Best set & summaries ----------

export interface ScoredSet extends Values {
  setType: SetType;
}

function setScore(type: ExerciseType, s: Values): number[] {
  switch (type) {
    case 'weight_reps':
    case 'weighted_bodyweight':
      return [estimateOneRepMax(s.weightKg, s.reps) ?? 0, s.weightKg ?? 0, s.reps ?? 0];
    case 'bodyweight_reps':
      return [s.reps ?? 0];
    case 'assisted_bodyweight':
      // Less assistance is better.
      return [s.reps ?? 0, -(s.weightKg ?? 0)];
    case 'duration':
      return [s.durationS ?? 0];
    case 'distance_duration':
      return [s.distanceM ?? 0, s.durationS ?? 0];
    case 'weight_distance':
      return [s.weightKg ?? 0, s.distanceM ?? 0];
  }
}

function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Best set of an exercise in a session (warm-ups only count if there is nothing else). */
export function bestSet<S extends ScoredSet>(type: ExerciseType, sets: S[]): S | null {
  const working = sets.filter((s) => s.setType !== 'warmup');
  const pool = working.length ? working : sets;
  let best: S | null = null;
  for (const s of pool) {
    if (!best || compareScores(setScore(type, s), setScore(type, best)) > 0) best = s;
  }
  return best;
}

/** e1RM of a set if meaningful for the exercise type. */
export function setE1rm(type: ExerciseType, s: Values): number | null {
  if (!supportsOneRepMax(type)) return null;
  return estimateOneRepMax(s.weightKg, s.reps);
}

export interface SummarySet extends Values {
  setType: SetType;
  completed: boolean;
}

export interface SummaryExercise {
  exerciseType: ExerciseType;
  sets: SummarySet[];
}

export interface WorkoutTotals {
  durationS: number;
  volumeKg: number;
  /** Completed sets. */
  setCount: number;
  incompleteSetCount: number;
  /** Exercises with at least one completed set. */
  exerciseCount: number;
}

export function summarizeWorkout(
  w: { startedAt: number; endedAt: number | null },
  exercises: SummaryExercise[],
  nowMs: number = Date.now(),
): WorkoutTotals {
  let volumeKg = 0;
  let setCount = 0;
  let incompleteSetCount = 0;
  let exerciseCount = 0;
  for (const ex of exercises) {
    let any = false;
    for (const s of ex.sets) {
      if (!s.completed) {
        incompleteSetCount++;
        continue;
      }
      any = true;
      setCount++;
      volumeKg += setVolumeKg(ex.exerciseType, s);
    }
    if (any) exerciseCount++;
  }
  const durationS = Math.max(0, Math.round(((w.endedAt ?? nowMs) - w.startedAt) / 1000));
  return { durationS, volumeKg, setCount, incompleteSetCount, exerciseCount };
}

// ---------- Routine diff ----------

export interface PlanExercise {
  exerciseId: string;
  supersetGroup: string | null;
  sets: { setType: SetType }[];
}

/** Superset groups renamed by order of first appearance, so ids can be compared structurally. */
function normalizedGroups(list: PlanExercise[]): (number | null)[] {
  const map = new Map<string, number>();
  return list.map((e) => {
    if (e.supersetGroup == null) return null;
    if (!map.has(e.supersetGroup)) map.set(e.supersetGroup, map.size);
    return map.get(e.supersetGroup)!;
  });
}

/**
 * Whether the performed workout differs structurally from its routine: exercises added,
 * removed or reordered, sets added or removed, set types or supersets changed. Different
 * weights/reps alone do not count (like Hevy, which only asks when the structure changed).
 */
export function workoutDiffersFromRoutine(routine: PlanExercise[], performed: PlanExercise[]): boolean {
  if (routine.length !== performed.length) return true;
  const ga = normalizedGroups(routine);
  const gb = normalizedGroups(performed);
  for (let i = 0; i < routine.length; i++) {
    const a = routine[i]!;
    const b = performed[i]!;
    if (a.exerciseId !== b.exerciseId) return true;
    if (ga[i] !== gb[i]) return true;
    if (a.sets.length !== b.sets.length) return true;
    for (let j = 0; j < a.sets.length; j++) {
      if (a.sets[j]!.setType !== b.sets[j]!.setType) return true;
    }
  }
  return false;
}

// ---------- History grouping & calendar ----------

/** Local-date key "YYYY-MM-DD". */
export function dayKey(ts: number | Date): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local-month key "YYYY-MM". */
export function monthKey(ts: number | Date): string {
  return dayKey(ts).slice(0, 7);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthLabel(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

/** Groups items (already sorted newest first) into month sections, preserving order. */
export function groupByMonth<T extends { startedAt: number }>(items: T[]): { key: string; title: string; data: T[] }[] {
  const out: { key: string; title: string; data: T[] }[] = [];
  for (const it of items) {
    const key = monthKey(it.startedAt);
    let section = out[out.length - 1];
    if (!section || section.key !== key) {
      const d = new Date(it.startedAt);
      section = { key, title: monthLabel(d.getFullYear(), d.getMonth()), data: [] };
      out.push(section);
    }
    section.data.push(it);
  }
  return out;
}

/**
 * Weeks of a month for a calendar grid. Each week has 7 cells; cells outside the month are null.
 * `weekStartsOn`: 0 = Sunday, 1 = Monday.
 */
export function monthGrid(year: number, monthIndex: number, weekStartsOn: 0 | 1 = 1): (Date | null)[][] {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, monthIndex, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function weekdayInitials(weekStartsOn: 0 | 1 = 1): string[] {
  const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return Array.from({ length: 7 }, (_, i) => names[(i + weekStartsOn) % 7]!);
}

// ---------- Date/time editing ----------

/** "2026-11-18 07:05" in local time. */
export function formatLocalDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dayKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses "YYYY-MM-DD HH:MM" (local time). Returns null when invalid. */
export function parseLocalDateTime(input: string): number | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.getTime();
}

/** 4500 -> "1:15" (hours:minutes). */
export function formatHoursMinutes(totalSeconds: number): string {
  const mins = Math.max(0, Math.round(totalSeconds / 60));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

/** Parses "1:15" (h:mm) or a plain number of minutes ("75") into seconds. */
export function parseHoursMinutes(input: string): number | null {
  const t = input.trim();
  if (/^\d+$/.test(t)) return Number(t) * 60;
  const m = /^(\d+):(\d{1,2})$/.exec(t);
  if (!m) return null;
  const mins = Number(m[2]);
  if (mins > 59) return null;
  return Number(m[1]) * 3600 + mins * 60;
}

/** Rest timer presets offered in the exercise rest picker (seconds). */
export const REST_PRESETS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300];

/** "1m 30s", "2m", "45s", "Off". */
export function formatRest(seconds: number): string {
  if (seconds <= 0) return 'Off';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m && s) return `${m}m ${s}s`;
  if (m) return `${m}m`;
  return `${s}s`;
}

/** Seconds left on a timer ending at `endAt`, never negative. */
export function remainingSeconds(endAt: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endAt - nowMs) / 1000));
}
