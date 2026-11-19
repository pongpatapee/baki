/**
 * Exercise library repository.
 *
 * Note on transactions: drizzle's expo-sqlite driver runs in "sync" mode and `db.transaction()`
 * commits as soon as its callback returns. Awaiting inside the callback would run statements
 * *after* COMMIT, so all transactional work here uses the synchronous `.all()/.get()/.run()`.
 */
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import type { Equipment, ExerciseType, MuscleGroup } from '@/domain/types';

import { db, type DbOrTx } from '../client';
import { createdStamps, newId, now } from '../ids';
import { exercises, routineExercises, workoutExercises, type ExerciseRow } from '../schema';
import { recomputePersonalRecords } from './personalRecords';

/** Exercises that should be visible in the library and picker: not deleted and not merged away. */
const visible = and(isNull(exercises.deletedAt), isNull(exercises.mergedIntoId));

/**
 * Query builder for all visible exercises, alphabetical. Built from `db` so it can be passed to
 * `useLiveQuery` (which re-runs it whenever the exercises table changes).
 */
export function exercisesQuery() {
  return db.select().from(exercises).where(visible).orderBy(asc(exercises.name));
}

/** Live-queryable single exercise (includes deleted/merged rows so history can still render). */
export function exerciseByIdQuery(id: string) {
  return db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
}

export async function listExercises(tx: DbOrTx = db): Promise<ExerciseRow[]> {
  return tx.select().from(exercises).where(visible).orderBy(asc(exercises.name)).all();
}

function getExerciseSync(id: string, tx: DbOrTx): ExerciseRow | undefined {
  return tx.select().from(exercises).where(eq(exercises.id, id)).get();
}

/** Returns the row even if deleted or merged; callers decide how to present those. */
export async function getExercise(id: string, tx: DbOrTx = db): Promise<ExerciseRow | undefined> {
  return getExerciseSync(id, tx);
}

export async function getExercisesByIds(ids: string[], tx: DbOrTx = db): Promise<ExerciseRow[]> {
  if (ids.length === 0) return [];
  return tx.select().from(exercises).where(inArray(exercises.id, ids)).all();
}

/**
 * Follows `mergedIntoId` links to the surviving exercise id (guards against cycles).
 * Useful when something still references an exercise that has since been merged.
 */
export async function resolveExerciseId(id: string, tx: DbOrTx = db): Promise<string> {
  let current = id;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    const row = tx
      .select({ mergedIntoId: exercises.mergedIntoId })
      .from(exercises)
      .where(eq(exercises.id, current))
      .get();
    if (!row?.mergedIntoId) return current;
    current = row.mergedIntoId;
  }
  return current;
}

export interface ExerciseInput {
  name: string;
  exerciseType: ExerciseType;
  equipment: Equipment;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  notes?: string | null;
}

export class ExerciseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExerciseValidationError';
  }
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function cleanSecondary(primary: MuscleGroup, secondary: MuscleGroup[]): MuscleGroup[] {
  return [...new Set(secondary)].filter((m) => m !== primary);
}

function isNameTakenSync(name: string, exceptId: string | undefined, tx: DbOrTx): boolean {
  const target = cleanName(name).toLowerCase();
  const rows = tx.select({ id: exercises.id, name: exercises.name }).from(exercises).where(visible).all();
  return rows.some((r) => r.id !== exceptId && r.name.toLowerCase() === target);
}

/** Case-insensitive check against other visible exercises. */
export async function isExerciseNameTaken(name: string, exceptId?: string, tx: DbOrTx = db): Promise<boolean> {
  return isNameTakenSync(name, exceptId, tx);
}

/** Creates a custom exercise and returns its id. Throws ExerciseValidationError on bad input. */
export async function createCustomExercise(input: ExerciseInput): Promise<string> {
  const name = cleanName(input.name);
  if (!name) throw new ExerciseValidationError('Name is required.');
  const id = newId();
  db.transaction((tx) => {
    if (isNameTakenSync(name, undefined, tx)) {
      throw new ExerciseValidationError(`An exercise named "${name}" already exists.`);
    }
    tx.insert(exercises)
      .values({
        id,
        name,
        exerciseType: input.exerciseType,
        equipment: input.equipment,
        primaryMuscle: input.primaryMuscle,
        secondaryMuscles: cleanSecondary(input.primaryMuscle, input.secondaryMuscles),
        isCustom: true,
        notes: input.notes?.trim() || null,
        mergedIntoId: null,
        ...createdStamps(),
      })
      .run();
  });
  return id;
}

/**
 * Updates an exercise. Built-in exercises only accept `notes` (their definition is owned by the
 * seed and would be overwritten by the next seed version); custom exercises accept every field.
 */
export async function updateExercise(id: string, patch: Partial<ExerciseInput>): Promise<void> {
  db.transaction((tx) => {
    const row = getExerciseSync(id, tx);
    if (!row || row.deletedAt != null) throw new ExerciseValidationError('Exercise not found.');
    const set: Partial<typeof exercises.$inferInsert> = { updatedAt: now() };
    if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;

    const definitionKeys = ['name', 'exerciseType', 'equipment', 'primaryMuscle', 'secondaryMuscles'] as const;
    if (definitionKeys.some((k) => patch[k] !== undefined)) {
      if (!row.isCustom) throw new ExerciseValidationError('Built-in exercises cannot be renamed or changed.');
      if (patch.name !== undefined) {
        const name = cleanName(patch.name);
        if (!name) throw new ExerciseValidationError('Name is required.');
        if (isNameTakenSync(name, id, tx)) {
          throw new ExerciseValidationError(`An exercise named "${name}" already exists.`);
        }
        set.name = name;
      }
      if (patch.exerciseType !== undefined) set.exerciseType = patch.exerciseType;
      if (patch.equipment !== undefined) set.equipment = patch.equipment;
      if (patch.primaryMuscle !== undefined) set.primaryMuscle = patch.primaryMuscle;
      if (patch.secondaryMuscles !== undefined || patch.primaryMuscle !== undefined) {
        set.secondaryMuscles = cleanSecondary(
          patch.primaryMuscle ?? row.primaryMuscle,
          patch.secondaryMuscles ?? row.secondaryMuscles,
        );
      }
    }
    tx.update(exercises).set(set).where(eq(exercises.id, id)).run();
  });
}

/** Soft-deletes a custom exercise. Logged history keeps pointing at the (deleted) row. */
export async function deleteExercise(id: string): Promise<void> {
  db.transaction((tx) => {
    const row = getExerciseSync(id, tx);
    if (!row || row.deletedAt != null) return;
    if (!row.isCustom) throw new ExerciseValidationError('Built-in exercises cannot be deleted.');
    const at = now();
    tx.update(exercises).set({ deletedAt: at, updatedAt: at }).where(eq(exercises.id, id)).run();
  });
}

/**
 * Merges `sourceId` into `targetId`: every workout and routine entry of the source is repointed
 * to the target, the source is marked merged + deleted, and PRs of both are rebuilt.
 */
export async function mergeExercise(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw new ExerciseValidationError('Cannot merge an exercise into itself.');
  db.transaction((tx) => {
    const source = getExerciseSync(sourceId, tx);
    const target = getExerciseSync(targetId, tx);
    if (!source || source.deletedAt != null) throw new ExerciseValidationError('Source exercise not found.');
    if (!target || target.deletedAt != null || target.mergedIntoId) {
      throw new ExerciseValidationError('Target exercise not found.');
    }
    const at = now();
    tx.update(workoutExercises)
      .set({ exerciseId: targetId, updatedAt: at })
      .where(eq(workoutExercises.exerciseId, sourceId))
      .run();
    tx.update(routineExercises)
      .set({ exerciseId: targetId, updatedAt: at })
      .where(eq(routineExercises.exerciseId, sourceId))
      .run();
    // Anything previously merged into the source now points straight at the target.
    tx.update(exercises).set({ mergedIntoId: targetId, updatedAt: at }).where(eq(exercises.mergedIntoId, sourceId)).run();
    tx.update(exercises)
      .set({ mergedIntoId: targetId, deletedAt: at, updatedAt: at })
      .where(eq(exercises.id, sourceId))
      .run();
  });
  // The source's old PR rows are stale too; recomputing it clears them.
  await recomputePersonalRecords([targetId, sourceId]);
}
