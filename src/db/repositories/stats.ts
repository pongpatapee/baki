/**
 * Read-only queries feeding domain/stats.ts. Only completed sets of finished, non-deleted workouts
 * (and non-deleted workout exercises / sets) are considered.
 */
import { and, asc, eq, gte, isNotNull, isNull, type SQL } from 'drizzle-orm';

import type { StatSet, StatWorkout } from '@/domain/stats';

import { db } from '../client';
import { exercises, workoutExercises, workoutSets, workouts, type ExerciseRow } from '../schema';

/** Tables whose changes should refresh stats screens. */
export const STATS_TABLES = ['workouts', 'workout_exercises', 'workout_sets', 'exercises', 'personal_records'] as const;

export interface StatSetWithPosition extends StatSet {
  workoutExerciseId: string;
  exercisePosition: number;
  setPosition: number;
}

export async function loadStatSets(opts: { exerciseId?: string; since?: number | null } = {}): Promise<StatSetWithPosition[]> {
  const conds: SQL[] = [
    isNull(workoutSets.deletedAt),
    isNotNull(workoutSets.completedAt),
    isNull(workoutExercises.deletedAt),
    isNull(workouts.deletedAt),
    isNotNull(workouts.endedAt),
  ];
  if (opts.exerciseId) conds.push(eq(workoutExercises.exerciseId, opts.exerciseId));
  if (opts.since != null) conds.push(gte(workouts.startedAt, opts.since));
  const rows = await db
    .select({
      workoutId: workouts.id,
      workoutTitle: workouts.title,
      startedAt: workouts.startedAt,
      exerciseId: workoutExercises.exerciseId,
      workoutExerciseId: workoutExercises.id,
      exercisePosition: workoutExercises.position,
      exerciseType: exercises.exerciseType,
      primaryMuscle: exercises.primaryMuscle,
      secondaryMuscles: exercises.secondaryMuscles,
      setId: workoutSets.id,
      setPosition: workoutSets.position,
      setType: workoutSets.setType,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      durationS: workoutSets.durationS,
      distanceM: workoutSets.distanceM,
      rpe: workoutSets.rpe,
      completedAt: workoutSets.completedAt,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(and(...conds))
    .orderBy(asc(workouts.startedAt), asc(workouts.id), asc(workoutExercises.position), asc(workoutSets.position));
  return rows.map((r) => ({ ...r, secondaryMuscles: Array.isArray(r.secondaryMuscles) ? r.secondaryMuscles : [] }));
}

export async function loadFinishedWorkouts(since?: number | null): Promise<StatWorkout[]> {
  const conds: SQL[] = [isNull(workouts.deletedAt), isNotNull(workouts.endedAt)];
  if (since != null) conds.push(gte(workouts.startedAt, since));
  const rows = await db
    .select({ id: workouts.id, title: workouts.title, startedAt: workouts.startedAt, endedAt: workouts.endedAt })
    .from(workouts)
    .where(and(...conds))
    .orderBy(asc(workouts.startedAt));
  return rows.map((r) => ({ ...r, endedAt: r.endedAt ?? r.startedAt }));
}

export async function loadExercise(id: string): Promise<ExerciseRow | null> {
  return (await db.select().from(exercises).where(eq(exercises.id, id)).get()) ?? null;
}

/** All exercises by id (including deleted ones, so old history still has names). */
export async function loadExerciseLookup(): Promise<Map<string, ExerciseRow>> {
  const rows = await db.select().from(exercises);
  return new Map(rows.map((r) => [r.id, r]));
}

export interface ExerciseHistorySession {
  workoutId: string;
  workoutTitle: string;
  startedAt: number;
  sets: StatSetWithPosition[];
}

/** Groups an exercise's sets per workout, newest workout first (for the History tab). */
export function groupHistory(sets: readonly StatSetWithPosition[]): ExerciseHistorySession[] {
  const map = new Map<string, ExerciseHistorySession>();
  for (const s of sets) {
    let x = map.get(s.workoutId);
    if (!x) {
      x = { workoutId: s.workoutId, workoutTitle: s.workoutTitle, startedAt: s.startedAt, sets: [] };
      map.set(s.workoutId, x);
    }
    x.sets.push(s);
  }
  return [...map.values()].sort((a, b) => b.startedAt - a.startedAt);
}

/** Live-queryable: active library exercises (not deleted, not merged away), by name. */
export function libraryExercisesQuery() {
  return db
    .select({ id: exercises.id, name: exercises.name, exerciseType: exercises.exerciseType, isCustom: exercises.isCustom })
    .from(exercises)
    .where(and(isNull(exercises.deletedAt), isNull(exercises.mergedIntoId)))
    .orderBy(asc(exercises.name));
}
