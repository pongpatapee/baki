/**
 * Workouts repository: the live workout, finishing, history and editing.
 *
 * Note on transactions: drizzle's expo-sqlite driver runs `db.transaction` synchronously, so every
 * transaction callback here is synchronous and uses the sync query API (`.run()`, `.all()`, `.get()`).
 * An async callback would commit at its first `await`.
 */
import { and, asc, count, desc, eq, getTableColumns, inArray, isNotNull, isNull, lt, max, ne } from 'drizzle-orm';

import type { ExerciseType, SetType } from '@/domain/types';
import { workoutDiffersFromRoutine, workoutTitleForTime, type PlanExercise } from '@/domain/workout';
import { setVolumeKg } from '@/domain/volume';

import { db, type DbOrTx } from '../client';
import { createdStamps, newId, now } from '../ids';
import {
  exercises,
  personalRecords,
  routineExercises,
  routines,
  routineSets,
  workoutExercises,
  workouts,
  workoutSets,
  type WorkoutExerciseRow,
  type WorkoutRow,
  type WorkoutSetRow,
} from '../schema';
import { recomputePersonalRecords } from './personalRecords';

// ---------- Live queries (for useLiveQuery) ----------

/** The in-progress workout (at most one). */
export function activeWorkoutQuery() {
  return db
    .select()
    .from(workouts)
    .where(and(isNull(workouts.endedAt), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.startedAt))
    .limit(1);
}

export function workoutQuery(workoutId: string) {
  return db.select().from(workouts).where(eq(workouts.id, workoutId));
}

/** Exercises of a workout joined with their exercise row, in order. Reacts to workout_exercises. */
export function workoutExercisesQuery(workoutId: string) {
  return db
    .select({
      ...getTableColumns(workoutExercises),
      exerciseName: exercises.name,
      exerciseType: exercises.exerciseType,
      equipment: exercises.equipment,
      primaryMuscle: exercises.primaryMuscle,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.deletedAt)))
    .orderBy(asc(workoutExercises.position));
}

/** All live sets of a workout, ordered by position. Reacts to workout_sets. */
export function workoutSetsQuery(workoutId: string) {
  return db
    .select(getTableColumns(workoutSets))
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutSets.deletedAt)))
    .orderBy(asc(workoutSets.position));
}

/** Finished workouts, newest first. */
export function listWorkoutsQuery() {
  return db
    .select()
    .from(workouts)
    .where(and(isNotNull(workouts.endedAt), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.startedAt));
}

/** PR counts per workout (reacts to personal_records). */
export function prCountsQuery() {
  return db
    .select({ workoutId: personalRecords.workoutId, count: count() })
    .from(personalRecords)
    .where(isNull(personalRecords.deletedAt))
    .groupBy(personalRecords.workoutId);
}

/** Change trigger for one workout's PRs; pair with `getPersonalRecordsForWorkout`. */
export function workoutPrTriggerQuery(workoutId: string) {
  return db
    .select({ id: personalRecords.id, updatedAt: personalRecords.updatedAt, deletedAt: personalRecords.deletedAt })
    .from(personalRecords)
    .where(eq(personalRecords.workoutId, workoutId));
}

export type WorkoutExerciseWithInfo = WorkoutExerciseRow & {
  exerciseName: string;
  exerciseType: ExerciseType;
  equipment: string;
  primaryMuscle: string;
};

// ---------- Helpers ----------

function liveExercisesOf(tx: DbOrTx, workoutId: string): WorkoutExerciseRow[] {
  return tx
    .select()
    .from(workoutExercises)
    .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.deletedAt)))
    .orderBy(asc(workoutExercises.position))
    .all();
}

function liveSetsOf(tx: DbOrTx, workoutExerciseIds: string[]): WorkoutSetRow[] {
  if (workoutExerciseIds.length === 0) return [];
  return tx
    .select()
    .from(workoutSets)
    .where(and(inArray(workoutSets.workoutExerciseId, workoutExerciseIds), isNull(workoutSets.deletedAt)))
    .orderBy(asc(workoutSets.position))
    .all();
}

function nextExercisePosition(tx: DbOrTx, workoutId: string): number {
  const row = tx
    .select({ m: max(workoutExercises.position) })
    .from(workoutExercises)
    .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.deletedAt)))
    .get();
  return (row?.m ?? -1) + 1;
}

/** Follows `mergedIntoId` so new workouts never reference a merged-away exercise. */
function resolveExerciseId(tx: DbOrTx, exerciseId: string): string {
  let id = exerciseId;
  for (let i = 0; i < 10; i++) {
    const row = tx.select({ mergedIntoId: exercises.mergedIntoId }).from(exercises).where(eq(exercises.id, id)).get();
    if (!row?.mergedIntoId) return id;
    id = row.mergedIntoId;
  }
  return id;
}

/** Rest time last used for this exercise in any workout (Hevy remembers it per exercise). */
function rememberedRestSeconds(tx: DbOrTx, exerciseId: string): number | null {
  const row = tx
    .select({ restSeconds: workoutExercises.restSeconds })
    .from(workoutExercises)
    .where(and(eq(workoutExercises.exerciseId, exerciseId), isNotNull(workoutExercises.restSeconds)))
    .orderBy(desc(workoutExercises.updatedAt))
    .limit(1)
    .get();
  return row?.restSeconds ?? null;
}

/** Clears a superset group that has fewer than two live members left. */
function cleanupSupersetGroup(tx: DbOrTx, workoutId: string, group: string | null, at: number) {
  if (!group) return;
  const members = tx
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(
      and(
        eq(workoutExercises.workoutId, workoutId),
        eq(workoutExercises.supersetGroup, group),
        isNull(workoutExercises.deletedAt),
      ),
    )
    .all();
  if (members.length < 2) {
    for (const m of members) {
      tx.update(workoutExercises).set({ supersetGroup: null, updatedAt: at }).where(eq(workoutExercises.id, m.id)).run();
    }
  }
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

// ---------- Starting ----------

export async function getActiveWorkout(): Promise<WorkoutRow | undefined> {
  return activeWorkoutQuery().get();
}

/** Creates an empty in-progress workout titled by time of day. Returns its id. */
export async function startEmptyWorkout(): Promise<string> {
  const at = now();
  const id = newId();
  db.insert(workouts)
    .values({
      id,
      routineId: null,
      title: workoutTitleForTime(new Date(at)),
      notes: null,
      startedAt: at,
      endedAt: null,
      importKey: null,
      ...createdStamps(at),
    })
    .run();
  return id;
}

interface TemplateExercise {
  exerciseId: string;
  supersetGroup: string | null;
  restSeconds: number | null;
  notes: string | null;
  sets: {
    setType: SetType;
    weightKg: number | null;
    reps: number | null;
    durationS: number | null;
    distanceM: number | null;
  }[];
}

function insertWorkoutFromTemplate(
  tx: DbOrTx,
  w: { title: string; routineId: string | null; notes: string | null },
  template: TemplateExercise[],
): string {
  const at = now();
  const workoutId = newId();
  tx.insert(workouts)
    .values({
      id: workoutId,
      routineId: w.routineId,
      title: w.title,
      notes: w.notes,
      startedAt: at,
      endedAt: null,
      importKey: null,
      ...createdStamps(at),
    })
    .run();
  const groups = new Map<string, string>();
  template.forEach((te, i) => {
    const weId = newId();
    let group: string | null = null;
    if (te.supersetGroup) {
      group = groups.get(te.supersetGroup) ?? newId();
      groups.set(te.supersetGroup, group);
    }
    const exerciseId = resolveExerciseId(tx, te.exerciseId);
    tx.insert(workoutExercises)
      .values({
        id: weId,
        workoutId,
        exerciseId,
        position: i,
        supersetGroup: group,
        restSeconds: te.restSeconds ?? rememberedRestSeconds(tx, exerciseId),
        notes: te.notes,
        ...createdStamps(at),
      })
      .run();
    te.sets.forEach((s, j) => {
      tx.insert(workoutSets)
        .values({
          id: newId(),
          workoutExerciseId: weId,
          position: j,
          setType: s.setType,
          weightKg: s.weightKg,
          reps: s.reps,
          durationS: s.durationS,
          distanceM: s.distanceM,
          rpe: null,
          completedAt: null,
          ...createdStamps(at),
        })
        .run();
    });
  });
  return workoutId;
}

function routineTemplate(tx: DbOrTx, routineId: string): TemplateExercise[] {
  const res = tx
    .select()
    .from(routineExercises)
    .where(and(eq(routineExercises.routineId, routineId), isNull(routineExercises.deletedAt)))
    .orderBy(asc(routineExercises.position))
    .all();
  const sets = res.length
    ? tx
        .select()
        .from(routineSets)
        .where(
          and(
            inArray(
              routineSets.routineExerciseId,
              res.map((r) => r.id),
            ),
            isNull(routineSets.deletedAt),
          ),
        )
        .orderBy(asc(routineSets.position))
        .all()
    : [];
  return res.map((re) => ({
    exerciseId: re.exerciseId,
    supersetGroup: re.supersetGroup,
    restSeconds: re.restSeconds,
    notes: re.notes,
    sets: sets
      .filter((s) => s.routineExerciseId === re.id)
      .map((s) => ({
        setType: s.setType,
        weightKg: s.targetWeightKg,
        reps: s.targetReps,
        durationS: s.targetDurationS,
        distanceM: s.targetDistanceM,
      })),
  }));
}

/** Performed structure of a workout (live exercises and their live sets). */
function workoutTemplate(tx: DbOrTx, workoutId: string, completedOnly: boolean): TemplateExercise[] {
  const exs = liveExercisesOf(tx, workoutId);
  const sets = liveSetsOf(
    tx,
    exs.map((e) => e.id),
  );
  return exs
    .map((e) => ({
      exerciseId: e.exerciseId,
      supersetGroup: e.supersetGroup,
      restSeconds: e.restSeconds,
      notes: e.notes,
      sets: sets
        .filter((s) => s.workoutExerciseId === e.id && (!completedOnly || s.completedAt != null))
        .map((s) => ({
          setType: s.setType,
          weightKg: s.weightKg,
          reps: s.reps,
          durationS: s.durationS,
          distanceM: s.distanceM,
        })),
    }))
    .filter((e) => !completedOnly || e.sets.length > 0);
}

/** Starts a workout from a routine: targets are prefilled as values, nothing is completed. */
export async function startWorkoutFromRoutine(routineId: string): Promise<string> {
  return db.transaction((tx) => {
    const routine = tx
      .select()
      .from(routines)
      .where(and(eq(routines.id, routineId), isNull(routines.deletedAt)))
      .get();
    if (!routine) throw new Error('Routine not found');
    return insertWorkoutFromTemplate(
      tx,
      { title: routine.name, routineId: routine.id, notes: null },
      routineTemplate(tx, routineId),
    );
  });
}

/** "Repeat workout": a new in-progress workout with the same exercises and sets (unchecked). */
export async function startWorkoutFromWorkout(sourceWorkoutId: string): Promise<string> {
  return db.transaction((tx) => {
    const src = tx.select().from(workouts).where(eq(workouts.id, sourceWorkoutId)).get();
    if (!src) throw new Error('Workout not found');
    return insertWorkoutFromTemplate(
      tx,
      { title: src.title, routineId: null, notes: null },
      workoutTemplate(tx, sourceWorkoutId, true),
    );
  });
}

// ---------- Exercises in a workout ----------

/** Appends exercises (each with one empty set). Returns the new workout_exercise ids. */
export async function addExercisesToWorkout(workoutId: string, exerciseIds: string[]): Promise<string[]> {
  return db.transaction((tx) => {
    const at = now();
    let pos = nextExercisePosition(tx, workoutId);
    const ids: string[] = [];
    for (const raw of exerciseIds) {
      const exerciseId = resolveExerciseId(tx, raw);
      const weId = newId();
      tx.insert(workoutExercises)
        .values({
          id: weId,
          workoutId,
          exerciseId,
          position: pos++,
          supersetGroup: null,
          restSeconds: rememberedRestSeconds(tx, exerciseId),
          notes: null,
          ...createdStamps(at),
        })
        .run();
      tx.insert(workoutSets)
        .values({
          id: newId(),
          workoutExerciseId: weId,
          position: 0,
          setType: 'normal',
          weightKg: null,
          reps: null,
          durationS: null,
          distanceM: null,
          rpe: null,
          completedAt: null,
          ...createdStamps(at),
        })
        .run();
      ids.push(weId);
    }
    return ids;
  });
}

/**
 * Swaps the exercise of a workout_exercise. Keeps the number and types of sets but clears their
 * values and checkmarks (they belonged to the old exercise).
 */
export async function replaceWorkoutExercise(workoutExerciseId: string, newExerciseId: string): Promise<void> {
  const result = db.transaction((tx) => {
    const we = tx.select().from(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId)).get();
    if (!we) return null;
    const at = now();
    const exerciseId = resolveExerciseId(tx, newExerciseId);
    tx.update(workoutExercises)
      .set({ exerciseId, restSeconds: rememberedRestSeconds(tx, exerciseId), updatedAt: at })
      .where(eq(workoutExercises.id, workoutExerciseId))
      .run();
    tx.update(workoutSets)
      .set({ weightKg: null, reps: null, durationS: null, distanceM: null, rpe: null, completedAt: null, updatedAt: at })
      .where(and(eq(workoutSets.workoutExerciseId, workoutExerciseId), isNull(workoutSets.deletedAt)))
      .run();
    const w = tx.select({ endedAt: workouts.endedAt }).from(workouts).where(eq(workouts.id, we.workoutId)).get();
    return { oldExerciseId: we.exerciseId, finished: w?.endedAt != null };
  });
  // The old exercise lost its sets in a finished workout: its PRs may have changed.
  if (result?.finished) await recomputePersonalRecords([result.oldExerciseId]);
}

/** Soft-deletes an exercise and its sets. */
export async function removeWorkoutExercise(workoutExerciseId: string): Promise<void> {
  db.transaction((tx) => {
    const we = tx.select().from(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId)).get();
    if (!we) return;
    const at = now();
    tx.update(workoutExercises)
      .set({ deletedAt: at, updatedAt: at })
      .where(eq(workoutExercises.id, workoutExerciseId))
      .run();
    tx.update(workoutSets)
      .set({ deletedAt: at, updatedAt: at })
      .where(and(eq(workoutSets.workoutExerciseId, workoutExerciseId), isNull(workoutSets.deletedAt)))
      .run();
    cleanupSupersetGroup(tx, we.workoutId, we.supersetGroup, at);
  });
}

function writeOrder(tx: DbOrTx, orderedIds: string[], at: number) {
  orderedIds.forEach((id, i) => {
    tx.update(workoutExercises).set({ position: i, updatedAt: at }).where(eq(workoutExercises.id, id)).run();
  });
}

/** Rewrites positions so exercises appear in `orderedIds` order. */
export async function reorderWorkoutExercises(workoutId: string, orderedIds: string[]): Promise<void> {
  db.transaction((tx) => {
    const live = new Set(liveExercisesOf(tx, workoutId).map((e) => e.id));
    writeOrder(
      tx,
      orderedIds.filter((id) => live.has(id)),
      now(),
    );
  });
}

/**
 * Puts `workoutExerciseId` in a superset with `partnerId` (joining the partner's group if it has
 * one) and moves it right after the group's last member so the superset is contiguous.
 */
export async function supersetWith(workoutExerciseId: string, partnerId: string): Promise<void> {
  db.transaction((tx) => {
    const a = tx.select().from(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId)).get();
    const b = tx.select().from(workoutExercises).where(eq(workoutExercises.id, partnerId)).get();
    if (!a || !b || a.workoutId !== b.workoutId || a.id === b.id) return;
    const at = now();
    const group = b.supersetGroup ?? newId();
    const oldGroup = a.supersetGroup;
    tx.update(workoutExercises).set({ supersetGroup: group, updatedAt: at }).where(eq(workoutExercises.id, a.id)).run();
    if (!b.supersetGroup) {
      tx.update(workoutExercises).set({ supersetGroup: group, updatedAt: at }).where(eq(workoutExercises.id, b.id)).run();
    }
    if (oldGroup && oldGroup !== group) cleanupSupersetGroup(tx, a.workoutId, oldGroup, at);

    const list = liveExercisesOf(tx, a.workoutId);
    const order = list.map((e) => e.id).filter((id) => id !== a.id);
    let lastIdx = -1;
    order.forEach((id, i) => {
      const e = list.find((x) => x.id === id);
      if (e && (e.id === b.id || e.supersetGroup === group)) lastIdx = i;
    });
    order.splice(lastIdx + 1, 0, a.id);
    writeOrder(tx, order, at);
  });
}

export async function removeFromSuperset(workoutExerciseId: string): Promise<void> {
  db.transaction((tx) => {
    const we = tx.select().from(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId)).get();
    if (!we?.supersetGroup) return;
    const at = now();
    tx.update(workoutExercises)
      .set({ supersetGroup: null, updatedAt: at })
      .where(eq(workoutExercises.id, workoutExerciseId))
      .run();
    cleanupSupersetGroup(tx, we.workoutId, we.supersetGroup, at);
  });
}

/** `restSeconds`: null = use the default from settings, 0 = off. */
export async function updateWorkoutExercise(
  workoutExerciseId: string,
  patch: { notes?: string | null; restSeconds?: number | null },
): Promise<void> {
  db.update(workoutExercises)
    .set({ ...patch, updatedAt: now() })
    .where(eq(workoutExercises.id, workoutExerciseId))
    .run();
}

// ---------- Sets ----------

export interface SetPatch {
  setType?: SetType;
  weightKg?: number | null;
  reps?: number | null;
  durationS?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
  completedAt?: number | null;
}

/** Adds a set at the end of an exercise, prefilled with the values of its last set. */
export async function addSet(workoutExerciseId: string): Promise<string> {
  return db.transaction((tx) => {
    const last = tx
      .select()
      .from(workoutSets)
      .where(and(eq(workoutSets.workoutExerciseId, workoutExerciseId), isNull(workoutSets.deletedAt)))
      .orderBy(desc(workoutSets.position))
      .limit(1)
      .get();
    const maxPos = tx
      .select({ m: max(workoutSets.position) })
      .from(workoutSets)
      .where(eq(workoutSets.workoutExerciseId, workoutExerciseId))
      .get();
    const id = newId();
    tx.insert(workoutSets)
      .values({
        id,
        workoutExerciseId,
        position: (maxPos?.m ?? -1) + 1,
        setType: !last || last.setType === 'warmup' ? 'normal' : last.setType,
        weightKg: last?.weightKg ?? null,
        reps: last?.reps ?? null,
        durationS: last?.durationS ?? null,
        distanceM: last?.distanceM ?? null,
        rpe: null,
        completedAt: null,
        ...createdStamps(),
      })
      .run();
    return id;
  });
}

export async function updateSet(setId: string, patch: SetPatch): Promise<void> {
  db.update(workoutSets)
    .set({ ...patch, updatedAt: now() })
    .where(eq(workoutSets.id, setId))
    .run();
}

export async function setSetType(setId: string, setType: SetType): Promise<void> {
  await updateSet(setId, { setType });
}

/** Checks/unchecks a set, optionally writing final values in the same update. */
export async function setSetCompleted(setId: string, completed: boolean, values: SetPatch = {}): Promise<void> {
  await updateSet(setId, { ...values, completedAt: completed ? now() : null });
}

export async function removeSet(setId: string): Promise<void> {
  const at = now();
  db.update(workoutSets).set({ deletedAt: at, updatedAt: at }).where(eq(workoutSets.id, setId)).run();
}

// ---------- Workout fields ----------

export async function updateWorkout(
  workoutId: string,
  patch: { title?: string; notes?: string | null; startedAt?: number; endedAt?: number | null },
): Promise<void> {
  db.update(workouts)
    .set({ ...patch, updatedAt: now() })
    .where(eq(workouts.id, workoutId))
    .run();
}

// ---------- Previous sets ----------

/**
 * Completed sets of `exerciseId` from the most recent finished workout that started before
 * `beforeWorkoutId` (excluding it). Used for the PREVIOUS column, matched by position.
 */
export async function getPreviousSetsForExercise(exerciseId: string, beforeWorkoutId: string): Promise<WorkoutSetRow[]> {
  const ref = db.select({ startedAt: workouts.startedAt }).from(workouts).where(eq(workouts.id, beforeWorkoutId)).get();
  const before = ref?.startedAt ?? Number.MAX_SAFE_INTEGER;
  const last = db
    .select({ weId: workoutExercises.id })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(
      and(
        eq(workoutExercises.exerciseId, exerciseId),
        isNull(workoutExercises.deletedAt),
        isNull(workoutSets.deletedAt),
        isNotNull(workoutSets.completedAt),
        isNotNull(workouts.endedAt),
        isNull(workouts.deletedAt),
        ne(workouts.id, beforeWorkoutId),
        lt(workouts.startedAt, before),
      ),
    )
    .orderBy(desc(workouts.startedAt), asc(workoutExercises.position))
    .limit(1)
    .get();
  if (!last) return [];
  return db
    .select()
    .from(workoutSets)
    .where(
      and(
        eq(workoutSets.workoutExerciseId, last.weId),
        isNull(workoutSets.deletedAt),
        isNotNull(workoutSets.completedAt),
      ),
    )
    .orderBy(asc(workoutSets.position))
    .all();
}

// ---------- Finishing ----------

export type FinishResult = { ok: true; exerciseIds: string[] } | { ok: false; reason: 'no_completed_sets' | 'not_found' };

/**
 * Drops unchecked sets and exercises left without sets. Refuses (without writing anything) when
 * no set is completed. `endedAt` is set when given.
 */
function closeOut(workoutId: string, endedAt: number | null): FinishResult {
  return db.transaction((tx): FinishResult => {
    const w = tx.select().from(workouts).where(eq(workouts.id, workoutId)).get();
    if (!w || w.deletedAt != null) return { ok: false, reason: 'not_found' };
    const exs = liveExercisesOf(tx, workoutId);
    const sets = liveSetsOf(
      tx,
      exs.map((e) => e.id),
    );
    if (!sets.some((s) => s.completedAt != null)) return { ok: false, reason: 'no_completed_sets' };
    const at = now();
    for (const s of sets) {
      if (s.completedAt == null) {
        tx.update(workoutSets).set({ deletedAt: at, updatedAt: at }).where(eq(workoutSets.id, s.id)).run();
      }
    }
    const touchedGroups = new Set<string>();
    for (const e of exs) {
      if (!sets.some((s) => s.workoutExerciseId === e.id && s.completedAt != null)) {
        tx.update(workoutExercises).set({ deletedAt: at, updatedAt: at }).where(eq(workoutExercises.id, e.id)).run();
        if (e.supersetGroup) touchedGroups.add(e.supersetGroup);
      }
    }
    for (const g of touchedGroups) cleanupSupersetGroup(tx, workoutId, g, at);
    writeOrder(
      tx,
      liveExercisesOf(tx, workoutId).map((e) => e.id),
      at,
    );
    tx.update(workouts)
      .set({ ...(endedAt != null ? { endedAt } : {}), updatedAt: at })
      .where(eq(workouts.id, workoutId))
      .run();
    // Every exercise that ever was in this workout: removed ones may have lost PRs.
    const all = tx
      .select({ exerciseId: workoutExercises.exerciseId })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId))
      .all();
    return { ok: true, exerciseIds: uniq(all.map((r) => r.exerciseId)) };
  });
}

/** Finishes the in-progress workout. Unchecked sets are discarded, PRs recomputed. */
export async function finishWorkout(workoutId: string): Promise<FinishResult> {
  const res = closeOut(workoutId, now());
  if (res.ok) await recomputePersonalRecords(res.exerciseIds);
  return res;
}

/** After editing a finished workout: drop unchecked sets/empty exercises and recompute PRs. */
export async function finalizeEditedWorkout(workoutId: string): Promise<FinishResult> {
  const res = closeOut(workoutId, null);
  if (res.ok) await recomputePersonalRecords(res.exerciseIds);
  return res;
}

function softDeleteWorkoutTree(workoutId: string): string[] {
  return db.transaction((tx) => {
    const at = now();
    const exs = tx.select().from(workoutExercises).where(eq(workoutExercises.workoutId, workoutId)).all();
    const ids = exs.map((e) => e.id);
    if (ids.length) {
      tx.update(workoutSets)
        .set({ deletedAt: at, updatedAt: at })
        .where(and(inArray(workoutSets.workoutExerciseId, ids), isNull(workoutSets.deletedAt)))
        .run();
      tx.update(workoutExercises)
        .set({ deletedAt: at, updatedAt: at })
        .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.deletedAt)))
        .run();
    }
    tx.update(workouts).set({ deletedAt: at, updatedAt: at }).where(eq(workouts.id, workoutId)).run();
    return uniq(exs.map((e) => e.exerciseId));
  });
}

/** Discards an in-progress workout (soft delete with all children). */
export async function discardWorkout(workoutId: string): Promise<void> {
  softDeleteWorkoutTree(workoutId);
}

/** Deletes a finished workout from history and recomputes affected PRs. */
export async function deleteWorkout(workoutId: string): Promise<void> {
  const exerciseIds = softDeleteWorkoutTree(workoutId);
  await recomputePersonalRecords(exerciseIds);
}

// ---------- Routines ----------

function toPlan(t: TemplateExercise[]): PlanExercise[] {
  return t.map((e) => ({ exerciseId: e.exerciseId, supersetGroup: e.supersetGroup, sets: e.sets }));
}

/**
 * If the workout came from a routine that still exists and its performed structure differs,
 * returns that routine so the UI can offer "Update routine".
 */
export async function getRoutineUpdateCandidate(
  workoutId: string,
): Promise<{ routineId: string; routineName: string } | null> {
  const w = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
  if (!w?.routineId) return null;
  const routine = db
    .select()
    .from(routines)
    .where(and(eq(routines.id, w.routineId), isNull(routines.deletedAt)))
    .get();
  if (!routine) return null;
  const routinePlan = toPlan(routineTemplate(db, routine.id)).map((e) => ({
    ...e,
    exerciseId: resolveExerciseId(db, e.exerciseId),
  }));
  const performed = toPlan(workoutTemplate(db, workoutId, true));
  if (!workoutDiffersFromRoutine(routinePlan, performed)) return null;
  return { routineId: routine.id, routineName: routine.name };
}

function writeRoutineChildren(tx: DbOrTx, routineId: string, template: TemplateExercise[], at: number) {
  const groups = new Map<string, string>();
  template.forEach((te, i) => {
    const reId = newId();
    let group: string | null = null;
    if (te.supersetGroup) {
      group = groups.get(te.supersetGroup) ?? newId();
      groups.set(te.supersetGroup, group);
    }
    tx.insert(routineExercises)
      .values({
        id: reId,
        routineId,
        exerciseId: te.exerciseId,
        position: i,
        supersetGroup: group,
        restSeconds: te.restSeconds,
        notes: te.notes,
        ...createdStamps(at),
      })
      .run();
    te.sets.forEach((s, j) => {
      tx.insert(routineSets)
        .values({
          id: newId(),
          routineExerciseId: reId,
          position: j,
          setType: s.setType,
          targetWeightKg: s.weightKg,
          targetReps: s.reps,
          targetDurationS: s.durationS,
          targetDistanceM: s.distanceM,
          ...createdStamps(at),
        })
        .run();
    });
  });
}

/** Overwrites the source routine's exercises and sets with what was performed. */
export async function updateRoutineFromWorkout(workoutId: string): Promise<void> {
  db.transaction((tx) => {
    const w = tx.select().from(workouts).where(eq(workouts.id, workoutId)).get();
    if (!w?.routineId) return;
    const routineId = w.routineId;
    const at = now();
    const old = tx
      .select({ id: routineExercises.id })
      .from(routineExercises)
      .where(and(eq(routineExercises.routineId, routineId), isNull(routineExercises.deletedAt)))
      .all();
    if (old.length) {
      tx.update(routineSets)
        .set({ deletedAt: at, updatedAt: at })
        .where(
          and(
            inArray(
              routineSets.routineExerciseId,
              old.map((o) => o.id),
            ),
            isNull(routineSets.deletedAt),
          ),
        )
        .run();
      tx.update(routineExercises)
        .set({ deletedAt: at, updatedAt: at })
        .where(and(eq(routineExercises.routineId, routineId), isNull(routineExercises.deletedAt)))
        .run();
    }
    writeRoutineChildren(tx, routineId, workoutTemplate(tx, workoutId, true), at);
    tx.update(routines).set({ updatedAt: at }).where(eq(routines.id, routineId)).run();
  });
}

/** Creates a new routine (no folder) from a workout's completed sets. Returns the routine id. */
export async function saveWorkoutAsRoutine(workoutId: string, name: string): Promise<string> {
  return db.transaction((tx) => {
    const at = now();
    const id = newId();
    const pos = tx
      .select({ m: max(routines.position) })
      .from(routines)
      .where(and(isNull(routines.folderId), isNull(routines.deletedAt)))
      .get();
    tx.insert(routines)
      .values({
        id,
        folderId: null,
        name: name.trim() || 'Routine',
        notes: null,
        position: (pos?.m ?? -1) + 1,
        ...createdStamps(at),
      })
      .run();
    writeRoutineChildren(tx, id, workoutTemplate(tx, workoutId, true), at);
    return id;
  });
}

// ---------- History ----------

export interface WorkoutListItem {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number;
  durationS: number;
  volumeKg: number;
  setCount: number;
  prCount: number;
  exercises: { exerciseId: string; name: string; setCount: number }[];
}

/**
 * Builds history cards for the given finished workouts in one query over all their completed sets.
 * `prCounts` comes from `prCountsQuery()` (live).
 */
export async function loadWorkoutListItems(
  rows: WorkoutRow[],
  prCounts: { workoutId: string; count: number }[],
): Promise<WorkoutListItem[]> {
  if (rows.length === 0) return [];
  const setRows = db
    .select({
      workoutId: workoutExercises.workoutId,
      weId: workoutExercises.id,
      wePosition: workoutExercises.position,
      exerciseId: workoutExercises.exerciseId,
      name: exercises.name,
      exerciseType: exercises.exerciseType,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(
      and(
        isNotNull(workouts.endedAt),
        isNull(workouts.deletedAt),
        isNull(workoutExercises.deletedAt),
        isNull(workoutSets.deletedAt),
        isNotNull(workoutSets.completedAt),
      ),
    )
    .orderBy(asc(workoutExercises.position), asc(workoutSets.position))
    .all();

  const prMap = new Map(prCounts.map((p) => [p.workoutId, p.count]));
  const byWorkout = new Map<
    string,
    { volumeKg: number; setCount: number; exercises: Map<string, { exerciseId: string; name: string; setCount: number }> }
  >();
  for (const r of setRows) {
    let agg = byWorkout.get(r.workoutId);
    if (!agg) {
      agg = { volumeKg: 0, setCount: 0, exercises: new Map() };
      byWorkout.set(r.workoutId, agg);
    }
    agg.volumeKg += setVolumeKg(r.exerciseType, r);
    agg.setCount += 1;
    const ex = agg.exercises.get(r.weId);
    if (ex) ex.setCount += 1;
    else agg.exercises.set(r.weId, { exerciseId: r.exerciseId, name: r.name, setCount: 1 });
  }
  return rows.map((w) => {
    const agg = byWorkout.get(w.id);
    const endedAt = w.endedAt ?? w.startedAt;
    return {
      id: w.id,
      title: w.title,
      startedAt: w.startedAt,
      endedAt,
      durationS: Math.max(0, Math.round((endedAt - w.startedAt) / 1000)),
      volumeKg: agg?.volumeKg ?? 0,
      setCount: agg?.setCount ?? 0,
      prCount: prMap.get(w.id) ?? 0,
      exercises: agg ? [...agg.exercises.values()] : [],
    };
  });
}

/** Number of finished workouts (e.g. "your 42nd workout"). */
export async function countFinishedWorkouts(): Promise<number> {
  const row = db
    .select({ n: count() })
    .from(workouts)
    .where(and(isNotNull(workouts.endedAt), isNull(workouts.deletedAt)))
    .get();
  return row?.n ?? 0;
}

export interface WorkoutDetail {
  workout: WorkoutRow;
  exercises: (WorkoutExerciseWithInfo & { sets: WorkoutSetRow[] })[];
}

/** One-shot load of a workout with its exercises and sets (for non-reactive callers). */
export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetail | null> {
  const workout = workoutQuery(workoutId).get();
  if (!workout || workout.deletedAt != null) return null;
  const exs = workoutExercisesQuery(workoutId).all() as WorkoutExerciseWithInfo[];
  const sets = workoutSetsQuery(workoutId).all();
  return {
    workout,
    exercises: exs.map((e) => ({ ...e, sets: sets.filter((s) => s.workoutExerciseId === e.id) })),
  };
}
