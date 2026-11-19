/**
 * Pure helpers for editing a routine draft in the routine builder: reordering, superset
 * grouping, set-type labels and rest-time options. No React Native imports.
 */
import type { ExerciseType, SetType } from './types';

export interface DraftSet {
  id: string;
  setType: SetType;
  targetWeightKg: number | null;
  targetReps: number | null;
  targetDurationS: number | null;
  targetDistanceM: number | null;
}

export interface DraftExercise {
  /** routine_exercises row id (client-generated for new rows, kept stable across saves). */
  id: string;
  exerciseId: string;
  /** Exercises sharing the same non-null group id form a superset. */
  supersetGroup: string | null;
  /** null = use the app default rest time, 0 = rest timer off. */
  restSeconds: number | null;
  notes: string | null;
  sets: DraftSet[];
}

export interface RoutineDraft {
  id: string;
  folderId: string | null;
  name: string;
  notes: string | null;
  exercises: DraftExercise[];
}

export type IdFactory = () => string;

// ---------- Sets ----------

export const SET_TYPE_CYCLE: readonly SetType[] = ['normal', 'warmup', 'failure', 'drop'];

/** Next set type when tapping a set number: normal -> warmup -> failure -> drop -> normal. */
export function nextSetType(t: SetType): SetType {
  const i = SET_TYPE_CYCLE.indexOf(t);
  return SET_TYPE_CYCLE[(i + 1) % SET_TYPE_CYCLE.length]!;
}

export const SET_TYPE_SHORT: Record<SetType, string | null> = {
  normal: null,
  warmup: 'W',
  failure: 'F',
  drop: 'D',
};

/**
 * Number shown for each set: the 1-based count of "normal" sets so far (Hevy style),
 * or null for warm-up / failure / drop sets which show a letter instead.
 */
export function workingSetNumbers(sets: readonly { setType: SetType }[]): (number | null)[] {
  let n = 0;
  return sets.map((s) => (s.setType === 'normal' ? ++n : null));
}

/** Display label for one set: "1", "2", "W", "F", "D". */
export function setLabel(setType: SetType, workingNumber: number | null): string {
  return SET_TYPE_SHORT[setType] ?? String(workingNumber ?? '');
}

export function emptySet(id: string, setType: SetType = 'normal'): DraftSet {
  return { id, setType, targetWeightKg: null, targetReps: null, targetDurationS: null, targetDistanceM: null };
}

/** New set appended to an exercise: copies the previous set's targets (like Hevy). */
export function appendSet(sets: readonly DraftSet[], id: string): DraftSet[] {
  const last = sets[sets.length - 1];
  const next: DraftSet = last
    ? { ...last, id, setType: last.setType === 'warmup' ? 'normal' : last.setType }
    : emptySet(id);
  return [...sets, next];
}

/** Default sets for a freshly added exercise: one for cardio, three for everything else. */
export function defaultSets(makeId: IdFactory, type: ExerciseType): DraftSet[] {
  const count = type === 'distance_duration' ? 1 : 3;
  return Array.from({ length: count }, () => emptySet(makeId()));
}

// ---------- Ordering ----------

/** Returns a copy with the item at `from` moved to `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list];
  const target = Math.max(0, Math.min(list.length - 1, to));
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item!);
  return out;
}

// ---------- Supersets ----------

type Groupable = { supersetGroup: string | null };

/**
 * Repairs superset groups so each group is one contiguous run of at least two exercises.
 * Single-member runs lose their group; a group id that appears in two separate runs keeps the
 * first run and the later runs get a fresh id from `makeId`.
 */
export function normalizeSupersets<T extends Groupable>(list: readonly T[], makeId: IdFactory): T[] {
  const out = list.map((e) => ({ ...e }));
  const seen = new Set<string>();
  let i = 0;
  while (i < out.length) {
    const g = out[i]!.supersetGroup;
    if (g == null) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < out.length && out[j + 1]!.supersetGroup === g) j++;
    const len = j - i + 1;
    let assign: string | null = g;
    if (len < 2) assign = null;
    else if (seen.has(g)) assign = makeId();
    else seen.add(g);
    for (let k = i; k <= j; k++) out[k]!.supersetGroup = assign;
    i = j + 1;
  }
  return out;
}

/**
 * Links the exercise at `index` with the next one. Joins existing groups on either side, so
 * linking A(next to superset B+C) produces A+B+C.
 */
export function linkWithNext<T extends Groupable>(list: readonly T[], index: number, makeId: IdFactory): T[] {
  if (index < 0 || index + 1 >= list.length) return [...list];
  const a = list[index]!.supersetGroup;
  const b = list[index + 1]!.supersetGroup;
  const group = a ?? b ?? makeId();
  const out = list.map((e, i) => {
    if (i === index || i === index + 1) return { ...e, supersetGroup: group };
    if (b != null && e.supersetGroup === b) return { ...e, supersetGroup: group };
    if (a != null && e.supersetGroup === a) return { ...e, supersetGroup: group };
    return { ...e };
  });
  return normalizeSupersets(out, makeId);
}

/**
 * Removes the exercise at `index` from its superset. If it sat in the middle of a run, the run
 * is split into two groups (each kept only if it still has two or more members).
 */
export function removeFromSuperset<T extends Groupable>(list: readonly T[], index: number, makeId: IdFactory): T[] {
  const g = list[index]?.supersetGroup;
  if (g == null) return [...list];
  const out = list.map((e) => ({ ...e }));
  out[index]!.supersetGroup = null;
  // The tail of the run after `index` becomes its own group.
  const tailGroup = makeId();
  for (let k = index + 1; k < out.length && out[k]!.supersetGroup === g; k++) out[k]!.supersetGroup = tailGroup;
  return normalizeSupersets(out, makeId);
}

/** Stable color slot per superset group, in order of first appearance. */
export function supersetColorIndex(list: readonly Groupable[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of list) {
    if (e.supersetGroup != null && !map.has(e.supersetGroup)) map.set(e.supersetGroup, map.size);
  }
  return map;
}

/** Whether the exercise at `index` is in the same superset as the next one. */
export function isLinkedWithNext(list: readonly Groupable[], index: number): boolean {
  const a = list[index]?.supersetGroup;
  return a != null && list[index + 1]?.supersetGroup === a;
}

// ---------- Rest ----------

/** Rest-time choices for the picker. null = app default, 0 = off. */
export const REST_OPTIONS: readonly (number | null)[] = [
  null, 0, 15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300,
];

export function formatRest(seconds: number | null, defaultSeconds?: number): string {
  if (seconds == null) return defaultSeconds != null ? `Default (${formatRest(defaultSeconds)})` : 'Default';
  if (seconds === 0) return 'Off';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}min` : `${m}min ${s}s`;
}

// ---------- Dirty check & diffing ----------

/** Structural comparison of two drafts (used for the unsaved-changes warning). */
export function draftsEqual(a: RoutineDraft, b: RoutineDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Ids present in `existing` but missing from `next`: the rows to soft-delete on save. */
export function removedIds(existing: Iterable<string>, next: Iterable<string>): string[] {
  const keep = new Set(next);
  const out: string[] = [];
  for (const id of existing) if (!keep.has(id)) out.push(id);
  return out;
}

/** "Push Day" -> "Push Day (Copy)". */
export function copyName(name: string): string {
  return `${name.trim() || 'Routine'} (Copy)`;
}
