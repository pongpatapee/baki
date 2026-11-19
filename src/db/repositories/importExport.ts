/**
 * Backup / restore, CSV export and Hevy import.
 * Bulk writes run inside one real SQLite transaction (see bulkTransaction.ts) and yield between
 * chunks so the UI can show progress.
 */
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import type { Equipment, ExerciseType, MuscleGroup } from '@/domain/types';
import { buildSetsCsv, csvFileName, type CsvSetRow } from '@/export/csv';
import {
  BACKUP_TABLE_NAMES,
  backupFileName,
  buildBackup,
  serializeBackup,
  validateBackup,
  type BackupTableName,
  type BackupTables,
  type BackupV1,
} from '@/export/json';
import type { HevyParseResult } from '@/import/hevyCsv';

import { db } from '../client';
import { newId, now } from '../ids';
import {
  exercises,
  personalRecords,
  routineExercises,
  routineFolders,
  routines,
  routineSets,
  settings,
  workoutExercises,
  workouts,
  workoutSets,
} from '../schema';
import { chunk, inChunkedTransaction, yieldToUi } from './bulkTransaction';
import { recomputeAllPersonalRecordsSync } from './personalRecords';
import { getSettings } from './settings';

export type ProgressFn = (fraction: number, label: string) => void;

const TABLES = {
  exercises,
  routine_folders: routineFolders,
  routines,
  routine_exercises: routineExercises,
  routine_sets: routineSets,
  workouts,
  workout_exercises: workoutExercises,
  workout_sets: workoutSets,
  settings,
} as const satisfies Record<BackupTableName, unknown>;

// ---------- Files ----------

function writeCacheFile(name: string, contents: string): File {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true, intermediates: true });
  file.writeSync(contents);
  return file;
}

async function share(file: File, mimeType: string, UTI: string, dialogTitle: string): Promise<void> {
  if (!(await isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await shareAsync(file.uri, { mimeType, UTI, dialogTitle });
}

// ---------- Backup ----------

export async function buildCurrentBackup(): Promise<BackupV1> {
  const tables = {} as Record<BackupTableName, unknown[]>;
  for (const name of BACKUP_TABLE_NAMES) {
    // Full backup: soft-deleted rows included.
    tables[name] = await db.select().from(TABLES[name]);
  }
  return buildBackup(tables as unknown as BackupTables, now());
}

/** Writes a JSON backup to the cache directory and opens the share sheet. Returns the file uri. */
export async function exportBackup(): Promise<string> {
  const backup = await buildCurrentBackup();
  const file = writeCacheFile(backupFileName(backup.exportedAt), serializeBackup(backup));
  await share(file, 'application/json', 'public.json', 'Baki backup');
  return file.uri;
}

export interface RestoreResult {
  counts: Record<BackupTableName, number>;
  exportedAt: number;
}

/**
 * Replaces ALL data with the backup's contents. Validates first; nothing is touched if the backup
 * is invalid. This is the one place where tables are wiped (it's a restore, not a sync change).
 */
export async function restoreBackup(json: string | unknown, onProgress?: ProgressFn): Promise<RestoreResult> {
  const v = validateBackup(json);
  if (!v.ok) throw new Error(v.error);
  const { backup, counts } = v;
  const total = BACKUP_TABLE_NAMES.reduce((n, t) => n + counts[t], 0) || 1;
  let done = 0;

  await inChunkedTransaction(async () => {
    onProgress?.(0, 'Clearing current data');
    db.delete(personalRecords).run();
    for (const name of [...BACKUP_TABLE_NAMES].reverse()) db.delete(TABLES[name]).run();
    for (const name of BACKUP_TABLE_NAMES) {
      const rows = backup.tables[name] as Record<string, unknown>[];
      for (const part of chunk(rows, 100)) {
        // Rows were validated against the table's columns, so the cast is safe.
        db.insert(TABLES[name]).values(part as never).run();
        done += part.length;
        onProgress?.(0.9 * (done / total), `Restoring ${name.replace(/_/g, ' ')}`);
        await yieldToUi();
      }
    }
    onProgress?.(0.92, 'Rebuilding personal records');
    await yieldToUi();
    recomputeAllPersonalRecordsSync();
  });
  onProgress?.(1, 'Done');
  return { counts, exportedAt: backup.exportedAt };
}

/** Reads a picked backup file and restores it. */
export async function restoreBackupFromUri(uri: string, onProgress?: ProgressFn): Promise<RestoreResult> {
  const text = await new File(uri).text();
  return restoreBackup(text, onProgress);
}

/** Validates a picked file without restoring (to show what it contains before confirming). */
export async function inspectBackupUri(uri: string) {
  const text = await new File(uri).text();
  return { text, validation: validateBackup(text) };
}

// ---------- CSV ----------

export async function loadCsvRows(): Promise<CsvSetRow[]> {
  const rows = await db
    .select({
      workoutTitle: workouts.title,
      workoutNotes: workouts.notes,
      startedAt: workouts.startedAt,
      endedAt: workouts.endedAt,
      exerciseName: exercises.name,
      exerciseType: exercises.exerciseType,
      exerciseNotes: workoutExercises.notes,
      supersetGroup: workoutExercises.supersetGroup,
      workoutExerciseId: workoutExercises.id,
      setType: workoutSets.setType,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      durationS: workoutSets.durationS,
      distanceM: workoutSets.distanceM,
      rpe: workoutSets.rpe,
    })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .where(
      and(
        isNull(workoutSets.deletedAt),
        isNotNull(workoutSets.completedAt),
        isNull(workoutExercises.deletedAt),
        isNull(workouts.deletedAt),
        isNotNull(workouts.endedAt),
      ),
    )
    .orderBy(asc(workouts.startedAt), asc(workouts.id), asc(workoutExercises.position), asc(workoutSets.position));

  // Human-friendly superset labels (A, B, ...) per workout, and 1-based set numbers per exercise.
  const setNo = new Map<string, number>();
  const groupLabels = new Map<string, string>();
  let lastWorkout: number | null = null;
  let nextLabel = 0;
  return rows.map(({ workoutExerciseId, supersetGroup, ...r }) => {
    if (r.startedAt !== lastWorkout) {
      lastWorkout = r.startedAt;
      nextLabel = 0;
    }
    const n = (setNo.get(workoutExerciseId) ?? 0) + 1;
    setNo.set(workoutExerciseId, n);
    let label: string | null = null;
    if (supersetGroup) {
      label = groupLabels.get(supersetGroup) ?? String.fromCharCode(65 + (nextLabel++ % 26));
      groupLabels.set(supersetGroup, label);
    }
    return { ...r, supersetGroup: label, setNumber: n };
  });
}

/** Writes all completed sets as CSV and opens the share sheet. Returns the file uri. */
export async function exportSetsCsv(): Promise<string> {
  const [rows, s] = await Promise.all([loadCsvRows(), getSettings()]);
  const csv = buildSetsCsv(rows, { weight: s.weightUnit, distance: s.distanceUnit });
  const file = writeCacheFile(csvFileName(now()), csv);
  await share(file, 'text/csv', 'public.comma-separated-values-text', 'Baki sets (CSV)');
  return file.uri;
}

// ---------- Hevy import ----------

export type HevyMappingTarget =
  | { kind: 'existing'; exerciseId: string }
  | { kind: 'create'; name: string; exerciseType: ExerciseType; equipment: Equipment; primaryMuscle: MuscleGroup }
  | { kind: 'skip' };

/** Keyed by the Hevy exercise title. */
export type HevyMapping = Record<string, HevyMappingTarget>;

export interface HevyImportResult {
  workoutsImported: number;
  workoutsSkipped: number;
  setsImported: number;
  exercisesCreated: number;
  exercisesSkipped: number;
}

/** Import keys already in the database (including soft-deleted workouts, which stay deleted). */
export async function existingImportKeys(): Promise<Set<string>> {
  const rows = await db.select({ key: workouts.importKey }).from(workouts).where(isNotNull(workouts.importKey));
  return new Set(rows.map((r) => r.key).filter((k): k is string => k != null));
}

export async function importHevy(
  parsed: HevyParseResult,
  mapping: HevyMapping,
  onProgress?: ProgressFn,
): Promise<HevyImportResult> {
  const known = await existingImportKeys();
  const todo = parsed.workouts.filter((w) => !known.has(w.importKey));
  const result: HevyImportResult = {
    workoutsImported: 0,
    workoutsSkipped: parsed.workouts.length - todo.length,
    setsImported: 0,
    exercisesCreated: 0,
    exercisesSkipped: 0,
  };

  await inChunkedTransaction(async () => {
    const at = now();
    // 1. Custom exercises.
    const exerciseIdFor = new Map<string, string | null>();
    for (const [title, target] of Object.entries(mapping)) {
      if (target.kind === 'existing') exerciseIdFor.set(title, target.exerciseId);
      else if (target.kind === 'skip') exerciseIdFor.set(title, null);
      else {
        const id = newId();
        db.insert(exercises)
          .values({
            id,
            name: target.name.trim() || title,
            exerciseType: target.exerciseType,
            equipment: target.equipment,
            primaryMuscle: target.primaryMuscle,
            secondaryMuscles: [],
            isCustom: true,
            notes: null,
            mergedIntoId: null,
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
          })
          .run();
        exerciseIdFor.set(title, id);
        result.exercisesCreated += 1;
      }
    }

    // 2. Workouts.
    const skippedTitles = new Set<string>();
    let i = 0;
    for (const w of todo) {
      const workoutId = newId();
      const endedAt = w.endedAt ?? w.startedAt;
      const weRows: (typeof workoutExercises.$inferInsert)[] = [];
      const setRows: (typeof workoutSets.$inferInsert)[] = [];
      const groups = new Map<string, string>();
      let position = 0;
      for (const ex of w.exercises) {
        const exerciseId = exerciseIdFor.get(ex.title);
        if (!exerciseId) {
          skippedTitles.add(ex.title);
          continue;
        }
        let group: string | null = null;
        if (ex.supersetId != null) {
          group = groups.get(ex.supersetId) ?? newId();
          groups.set(ex.supersetId, group);
        }
        const weId = newId();
        weRows.push({
          id: weId,
          workoutId,
          exerciseId,
          position: position++,
          supersetGroup: group,
          restSeconds: null,
          notes: ex.notes,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        });
        ex.sets.forEach((s, idx) => {
          setRows.push({
            id: newId(),
            workoutExerciseId: weId,
            position: idx,
            setType: s.setType,
            weightKg: s.weightKg,
            reps: s.reps,
            durationS: s.durationS,
            distanceM: s.distanceM,
            rpe: s.rpe,
            completedAt: endedAt,
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
          });
        });
      }
      if (weRows.length === 0) {
        result.workoutsSkipped += 1;
        continue;
      }
      db.insert(workouts)
        .values({
          id: workoutId,
          routineId: null,
          title: w.title,
          notes: w.description,
          startedAt: w.startedAt,
          endedAt,
          importKey: w.importKey,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        })
        .run();
      for (const part of chunk(weRows, 100)) db.insert(workoutExercises).values(part).run();
      for (const part of chunk(setRows, 100)) db.insert(workoutSets).values(part).run();
      result.workoutsImported += 1;
      result.setsImported += setRows.length;
      i += 1;
      if (i % 10 === 0) {
        onProgress?.(0.9 * (i / todo.length), `Importing workouts (${i}/${todo.length})`);
        await yieldToUi();
      }
    }
    result.exercisesSkipped = skippedTitles.size;

    // 3. Derived data.
    onProgress?.(0.92, 'Rebuilding personal records');
    await yieldToUi();
    recomputeAllPersonalRecordsSync();
  });
  onProgress?.(1, 'Done');
  return result;
}
