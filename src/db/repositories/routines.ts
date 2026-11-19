/**
 * Routines and routine folders.
 *
 * Transactions use drizzle's synchronous `.all()/.get()/.run()` because the expo-sqlite driver
 * commits as soon as the `db.transaction()` callback returns (see repositories/exercises.ts).
 */
import { and, asc, eq, inArray, isNull, max } from 'drizzle-orm';

import type { DraftExercise, RoutineDraft } from '@/domain/routineEdit';
import { copyName, removedIds } from '@/domain/routineEdit';

import { db, type DbOrTx } from '../client';
import { createdStamps, newId, now } from '../ids';
import {
  exercises,
  routineExercises,
  routineFolders,
  routines,
  routineSets,
  type ExerciseRow,
  type RoutineExerciseRow,
  type RoutineFolderRow,
  type RoutineRow,
  type RoutineSetRow,
} from '../schema';

// ---------- Live queries ----------

export function foldersQuery() {
  return db
    .select()
    .from(routineFolders)
    .where(isNull(routineFolders.deletedAt))
    .orderBy(asc(routineFolders.position), asc(routineFolders.createdAt));
}

export function routinesQuery() {
  return db
    .select()
    .from(routines)
    .where(isNull(routines.deletedAt))
    .orderBy(asc(routines.position), asc(routines.createdAt));
}

export function routineByIdQuery(id: string) {
  return db.select().from(routines).where(eq(routines.id, id)).limit(1);
}

/**
 * Exercise names of every live routine, in routine order. Re-runs when routine_exercises change
 * (every routine save and exercise merge touches that table).
 */
export function routineExercisePreviewQuery() {
  return db
    .select({
      routineId: routineExercises.routineId,
      position: routineExercises.position,
      name: exercises.name,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(isNull(routineExercises.deletedAt))
    .orderBy(asc(routineExercises.routineId), asc(routineExercises.position));
}

// ---------- Folders ----------

function nextFolderPosition(tx: DbOrTx): number {
  const row = tx
    .select({ m: max(routineFolders.position) })
    .from(routineFolders)
    .where(isNull(routineFolders.deletedAt))
    .get();
  return (row?.m ?? -1) + 1;
}

export async function createFolder(name: string): Promise<string> {
  const id = newId();
  db.transaction((tx) => {
    tx.insert(routineFolders)
      .values({ id, name: name.trim() || 'New Folder', position: nextFolderPosition(tx), ...createdStamps() })
      .run();
  });
  return id;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  db.update(routineFolders).set({ name: clean, updatedAt: now() }).where(eq(routineFolders.id, id)).run();
}

/** Soft-deletes a folder; its routines move to "no folder" (appended after unfiled routines). */
export async function deleteFolder(id: string): Promise<void> {
  db.transaction((tx) => {
    const at = now();
    let pos = nextRoutinePosition(null, tx);
    const inside = tx
      .select({ id: routines.id })
      .from(routines)
      .where(and(eq(routines.folderId, id), isNull(routines.deletedAt)))
      .orderBy(asc(routines.position))
      .all();
    for (const r of inside) {
      tx.update(routines).set({ folderId: null, position: pos++, updatedAt: at }).where(eq(routines.id, r.id)).run();
    }
    tx.update(routineFolders).set({ deletedAt: at, updatedAt: at }).where(eq(routineFolders.id, id)).run();
  });
}

/** Persists folder order: `orderedIds[i]` gets position i. */
export async function reorderFolders(orderedIds: string[]): Promise<void> {
  db.transaction((tx) => {
    const at = now();
    orderedIds.forEach((id, i) => {
      tx.update(routineFolders).set({ position: i, updatedAt: at }).where(eq(routineFolders.id, id)).run();
    });
  });
}

// ---------- Routines ----------

export interface RoutineExerciseDetail extends RoutineExerciseRow {
  exercise: ExerciseRow;
  sets: RoutineSetRow[];
}

export interface RoutineDetail {
  routine: RoutineRow;
  /** Ordered by position; sets ordered by position. */
  exercises: RoutineExerciseDetail[];
}

function nextRoutinePosition(folderId: string | null, tx: DbOrTx): number {
  const row = tx
    .select({ m: max(routines.position) })
    .from(routines)
    .where(and(folderId == null ? isNull(routines.folderId) : eq(routines.folderId, folderId), isNull(routines.deletedAt)))
    .get();
  return (row?.m ?? -1) + 1;
}

function getRoutineDetailSync(id: string, tx: DbOrTx): RoutineDetail | null {
  const routine = tx
    .select()
    .from(routines)
    .where(and(eq(routines.id, id), isNull(routines.deletedAt)))
    .get();
  if (!routine) return null;
  const rows = tx
    .select({ re: routineExercises, exercise: exercises })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(and(eq(routineExercises.routineId, id), isNull(routineExercises.deletedAt)))
    .orderBy(asc(routineExercises.position))
    .all();
  const reIds = rows.map((r) => r.re.id);
  const sets =
    reIds.length === 0
      ? []
      : tx
          .select()
          .from(routineSets)
          .where(and(inArray(routineSets.routineExerciseId, reIds), isNull(routineSets.deletedAt)))
          .orderBy(asc(routineSets.position))
          .all();
  const setsByRe = new Map<string, RoutineSetRow[]>();
  for (const s of sets) {
    const list = setsByRe.get(s.routineExerciseId) ?? [];
    list.push(s);
    setsByRe.set(s.routineExerciseId, list);
  }
  return {
    routine,
    exercises: rows.map((r) => ({ ...r.re, exercise: r.exercise, sets: setsByRe.get(r.re.id) ?? [] })),
  };
}

/** Routine with its ordered exercises (joined with the exercise row) and ordered sets. */
export async function getRoutineDetail(id: string, tx: DbOrTx = db): Promise<RoutineDetail | null> {
  return getRoutineDetailSync(id, tx);
}

/** Converts a stored routine into an editable draft (ids preserved). */
export function detailToDraft(detail: RoutineDetail): RoutineDraft {
  return {
    id: detail.routine.id,
    folderId: detail.routine.folderId,
    name: detail.routine.name,
    notes: detail.routine.notes,
    exercises: detail.exercises.map(
      (e): DraftExercise => ({
        id: e.id,
        exerciseId: e.exerciseId,
        supersetGroup: e.supersetGroup,
        restSeconds: e.restSeconds,
        notes: e.notes,
        sets: e.sets.map((s) => ({
          id: s.id,
          setType: s.setType,
          targetWeightKg: s.targetWeightKg,
          targetReps: s.targetReps,
          targetDurationS: s.targetDurationS,
          targetDistanceM: s.targetDistanceM,
        })),
      }),
    ),
  };
}

function saveRoutineSync(draft: RoutineDraft, tx: DbOrTx): void {
  const at = now();
  const name = draft.name.trim() || 'Untitled Routine';
  const notes = draft.notes?.trim() || null;
  const existing = tx.select().from(routines).where(eq(routines.id, draft.id)).get();
  if (existing) {
    const folderChanged = existing.folderId !== draft.folderId;
    tx.update(routines)
      .set({
        name,
        notes,
        folderId: draft.folderId,
        position: folderChanged ? nextRoutinePosition(draft.folderId, tx) : existing.position,
        deletedAt: null,
        updatedAt: at,
      })
      .where(eq(routines.id, draft.id))
      .run();
  } else {
    tx.insert(routines)
      .values({
        id: draft.id,
        folderId: draft.folderId,
        name,
        notes,
        position: nextRoutinePosition(draft.folderId, tx),
        ...createdStamps(at),
      })
      .run();
  }

  // Exercises: update by id, insert new, soft-delete removed.
  const oldRes = tx
    .select({ id: routineExercises.id })
    .from(routineExercises)
    .where(and(eq(routineExercises.routineId, draft.id), isNull(routineExercises.deletedAt)))
    .all();
  const oldReIds = oldRes.map((r) => r.id);
  const goneRes = removedIds(oldReIds, draft.exercises.map((e) => e.id));
  if (goneRes.length > 0) {
    tx.update(routineExercises).set({ deletedAt: at, updatedAt: at }).where(inArray(routineExercises.id, goneRes)).run();
    tx.update(routineSets)
      .set({ deletedAt: at, updatedAt: at })
      .where(and(inArray(routineSets.routineExerciseId, goneRes), isNull(routineSets.deletedAt)))
      .run();
  }

  draft.exercises.forEach((e, position) => {
    const values = {
      routineId: draft.id,
      exerciseId: e.exerciseId,
      position,
      supersetGroup: e.supersetGroup,
      restSeconds: e.restSeconds,
      notes: e.notes?.trim() || null,
    };
    const found = tx.select({ id: routineExercises.id }).from(routineExercises).where(eq(routineExercises.id, e.id)).get();
    if (found) {
      tx.update(routineExercises)
        .set({ ...values, deletedAt: null, updatedAt: at })
        .where(eq(routineExercises.id, e.id))
        .run();
    } else {
      tx.insert(routineExercises)
        .values({ id: e.id, ...values, ...createdStamps(at) })
        .run();
    }

    const oldSets = tx
      .select({ id: routineSets.id })
      .from(routineSets)
      .where(and(eq(routineSets.routineExerciseId, e.id), isNull(routineSets.deletedAt)))
      .all();
    const goneSets = removedIds(oldSets.map((s) => s.id), e.sets.map((s) => s.id));
    if (goneSets.length > 0) {
      tx.update(routineSets).set({ deletedAt: at, updatedAt: at }).where(inArray(routineSets.id, goneSets)).run();
    }
    e.sets.forEach((s, setPos) => {
      const setValues = {
        routineExerciseId: e.id,
        position: setPos,
        setType: s.setType,
        targetWeightKg: s.targetWeightKg,
        targetReps: s.targetReps,
        targetDurationS: s.targetDurationS,
        targetDistanceM: s.targetDistanceM,
      };
      const setFound = tx.select({ id: routineSets.id }).from(routineSets).where(eq(routineSets.id, s.id)).get();
      if (setFound) {
        tx.update(routineSets)
          .set({ ...setValues, deletedAt: null, updatedAt: at })
          .where(eq(routineSets.id, s.id))
          .run();
      } else {
        tx.insert(routineSets)
          .values({ id: s.id, ...setValues, ...createdStamps(at) })
          .run();
      }
    });
  });
}

/**
 * Writes a routine and all its exercises/sets in one transaction. Rows are matched by id:
 * existing ones are updated, new ids inserted and rows missing from the draft soft-deleted,
 * so ids stay stable across edits. Creates the routine if `draft.id` does not exist yet.
 */
export async function saveRoutine(draft: RoutineDraft): Promise<string> {
  db.transaction((tx) => saveRoutineSync(draft, tx));
  return draft.id;
}

/** Creates an empty routine (useful for quick-create flows). */
export async function createRoutine(name: string, folderId: string | null = null): Promise<string> {
  return saveRoutine({ id: newId(), folderId, name, notes: null, exercises: [] });
}

/** Copies a routine (with fresh ids) into the same folder, named "… (Copy)". */
export async function duplicateRoutine(id: string): Promise<string | null> {
  let newRoutineId: string | null = null;
  db.transaction((tx) => {
    const detail = getRoutineDetailSync(id, tx);
    if (!detail) return;
    const draft = detailToDraft(detail);
    const groupMap = new Map<string, string>();
    const copy: RoutineDraft = {
      ...draft,
      id: newId(),
      name: copyName(draft.name),
      exercises: draft.exercises.map((e) => {
        let group: string | null = null;
        if (e.supersetGroup) {
          group = groupMap.get(e.supersetGroup) ?? newId();
          groupMap.set(e.supersetGroup, group);
        }
        return { ...e, id: newId(), supersetGroup: group, sets: e.sets.map((s) => ({ ...s, id: newId() })) };
      }),
    };
    saveRoutineSync(copy, tx);
    newRoutineId = copy.id;
  });
  return newRoutineId;
}

/** Soft-deletes a routine and its children. Past workouts keep their routineId reference. */
export async function deleteRoutine(id: string): Promise<void> {
  db.transaction((tx) => {
    const at = now();
    const reIds = tx
      .select({ id: routineExercises.id })
      .from(routineExercises)
      .where(and(eq(routineExercises.routineId, id), isNull(routineExercises.deletedAt)))
      .all()
      .map((r) => r.id);
    if (reIds.length > 0) {
      tx.update(routineSets)
        .set({ deletedAt: at, updatedAt: at })
        .where(and(inArray(routineSets.routineExerciseId, reIds), isNull(routineSets.deletedAt)))
        .run();
      tx.update(routineExercises).set({ deletedAt: at, updatedAt: at }).where(inArray(routineExercises.id, reIds)).run();
    }
    tx.update(routines).set({ deletedAt: at, updatedAt: at }).where(eq(routines.id, id)).run();
  });
}

/** Moves a routine to a folder (null = no folder), appending it at the end. */
export async function moveRoutineToFolder(id: string, folderId: string | null): Promise<void> {
  db.transaction((tx) => {
    const row = tx.select().from(routines).where(eq(routines.id, id)).get();
    if (!row || row.folderId === folderId) return;
    tx.update(routines)
      .set({ folderId, position: nextRoutinePosition(folderId, tx), updatedAt: now() })
      .where(eq(routines.id, id))
      .run();
  });
}

/** Persists routine order within a folder: `orderedIds[i]` gets position i. */
export async function reorderRoutines(orderedIds: string[]): Promise<void> {
  db.transaction((tx) => {
    const at = now();
    orderedIds.forEach((id, i) => {
      tx.update(routines).set({ position: i, updatedAt: at }).where(eq(routines.id, id)).run();
    });
  });
}

export type { RoutineFolderRow, RoutineRow };
