/**
 * Baki database schema.
 *
 * Sync-readiness rules (see README "Data model"):
 *  - Every row has a text primary key (UUIDv7, or a stable slug for seeded exercises).
 *  - Every row has created_at / updated_at / deleted_at as UTC epoch milliseconds.
 *  - Rows are never hard-deleted by app code: set deleted_at instead.
 *  - Canonical units only: kilograms, seconds, meters.
 *  - Only src/db/repositories/* writes to these tables.
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { Equipment, ExerciseType, MuscleGroup, PrKind, SetType } from '@/domain/types';

const timestamps = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
};

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    exerciseType: text('exercise_type').$type<ExerciseType>().notNull(),
    equipment: text('equipment').$type<Equipment>().notNull(),
    primaryMuscle: text('primary_muscle').$type<MuscleGroup>().notNull(),
    /** JSON array of MuscleGroup */
    secondaryMuscles: text('secondary_muscles', { mode: 'json' })
      .$type<MuscleGroup[]>()
      .notNull()
      .default(sql`'[]'`),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    /** When a duplicate exercise is merged, it points at the surviving exercise. */
    mergedIntoId: text('merged_into_id'),
    ...timestamps,
  },
  (t) => [index('exercises_name_idx').on(t.name)],
);

export const routineFolders = sqliteTable('routine_folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  ...timestamps,
});

export const routines = sqliteTable(
  'routines',
  {
    id: text('id').primaryKey(),
    folderId: text('folder_id'),
    name: text('name').notNull(),
    notes: text('notes'),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => [index('routines_folder_idx').on(t.folderId)],
);

export const routineExercises = sqliteTable(
  'routine_exercises',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id').notNull(),
    exerciseId: text('exercise_id').notNull(),
    position: integer('position').notNull(),
    /** Exercises sharing the same non-null group id form a superset. */
    supersetGroup: text('superset_group'),
    restSeconds: integer('rest_seconds'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('routine_exercises_routine_idx').on(t.routineId)],
);

export const routineSets = sqliteTable(
  'routine_sets',
  {
    id: text('id').primaryKey(),
    routineExerciseId: text('routine_exercise_id').notNull(),
    position: integer('position').notNull(),
    setType: text('set_type').$type<SetType>().notNull().default('normal'),
    targetWeightKg: real('target_weight_kg'),
    targetReps: integer('target_reps'),
    targetDurationS: integer('target_duration_s'),
    targetDistanceM: real('target_distance_m'),
    ...timestamps,
  },
  (t) => [index('routine_sets_re_idx').on(t.routineExerciseId)],
);

export const workouts = sqliteTable(
  'workouts',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id'),
    title: text('title').notNull(),
    notes: text('notes'),
    startedAt: integer('started_at').notNull(),
    /** null while the workout is in progress. */
    endedAt: integer('ended_at'),
    /** Set for workouts that came from an import, used to keep re-imports idempotent. */
    importKey: text('import_key'),
    ...timestamps,
  },
  (t) => [
    index('workouts_started_idx').on(t.startedAt),
    uniqueIndex('workouts_import_key_idx').on(t.importKey),
  ],
);

export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    id: text('id').primaryKey(),
    workoutId: text('workout_id').notNull(),
    exerciseId: text('exercise_id').notNull(),
    position: integer('position').notNull(),
    supersetGroup: text('superset_group'),
    restSeconds: integer('rest_seconds'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('workout_exercises_workout_idx').on(t.workoutId),
    index('workout_exercises_exercise_idx').on(t.exerciseId),
  ],
);

export const workoutSets = sqliteTable(
  'workout_sets',
  {
    id: text('id').primaryKey(),
    workoutExerciseId: text('workout_exercise_id').notNull(),
    position: integer('position').notNull(),
    setType: text('set_type').$type<SetType>().notNull().default('normal'),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    durationS: integer('duration_s'),
    distanceM: real('distance_m'),
    rpe: real('rpe'),
    /** null = not completed (unchecked). Only completed sets count towards stats. */
    completedAt: integer('completed_at'),
    ...timestamps,
  },
  (t) => [index('workout_sets_we_idx').on(t.workoutExerciseId)],
);

/** Derived data: can always be rebuilt from workout_sets via domain/prs.ts. */
export const personalRecords = sqliteTable(
  'personal_records',
  {
    id: text('id').primaryKey(),
    exerciseId: text('exercise_id').notNull(),
    workoutId: text('workout_id').notNull(),
    workoutSetId: text('workout_set_id').notNull(),
    kind: text('kind').$type<PrKind>().notNull(),
    value: real('value').notNull(),
    achievedAt: integer('achieved_at').notNull(),
    ...timestamps,
  },
  (t) => [
    index('personal_records_exercise_idx').on(t.exerciseId),
    index('personal_records_workout_idx').on(t.workoutId),
  ],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  /** JSON-encoded value */
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type ExerciseRow = typeof exercises.$inferSelect;
export type RoutineFolderRow = typeof routineFolders.$inferSelect;
export type RoutineRow = typeof routines.$inferSelect;
export type RoutineExerciseRow = typeof routineExercises.$inferSelect;
export type RoutineSetRow = typeof routineSets.$inferSelect;
export type WorkoutRow = typeof workouts.$inferSelect;
export type WorkoutExerciseRow = typeof workoutExercises.$inferSelect;
export type WorkoutSetRow = typeof workoutSets.$inferSelect;
export type PersonalRecordRow = typeof personalRecords.$inferSelect;
