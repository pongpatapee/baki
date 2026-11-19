/**
 * personal_records is derived data, rebuilt from workout_sets with domain/prs.ts.
 * Rebuilds diff against the existing rows: unchanged records keep their id, stale ones are
 * soft-deleted, new ones inserted (no hard deletes, so it stays sync-friendly).
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { computePrProgression, type PrEvent, type PrSetInput } from '@/domain/prs';
import type { ExerciseType, PrKind } from '@/domain/types';

import { db } from '../client';
import { newId, now } from '../ids';
import { exercises, personalRecords, workoutExercises, workoutSets, workouts, type PersonalRecordRow } from '../schema';
import { chunk, inSyncTransaction } from './bulkTransaction';

const VALUE_EPS = 1e-6;

/** Completed sets of finished, non-deleted workouts for the given exercises, chronological. */
function loadSetsSync(exerciseIds: readonly string[]) {
  const rows: {
    exerciseId: string;
    workoutId: string;
    startedAt: number;
    setId: string;
    setType: PrSetInput['setType'];
    weightKg: number | null;
    reps: number | null;
    durationS: number | null;
    distanceM: number | null;
    completedAt: number | null;
  }[] = [];
  for (const ids of chunk(exerciseIds, 500)) {
    rows.push(
      ...db
        .select({
          exerciseId: workoutExercises.exerciseId,
          workoutId: workouts.id,
          startedAt: workouts.startedAt,
          setId: workoutSets.id,
          setType: workoutSets.setType,
          weightKg: workoutSets.weightKg,
          reps: workoutSets.reps,
          durationS: workoutSets.durationS,
          distanceM: workoutSets.distanceM,
          completedAt: workoutSets.completedAt,
        })
        .from(workoutSets)
        .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
        .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
        .where(
          and(
            inArray(workoutExercises.exerciseId, ids),
            isNull(workoutSets.deletedAt),
            isNotNull(workoutSets.completedAt),
            isNull(workoutExercises.deletedAt),
            isNull(workouts.deletedAt),
            isNotNull(workouts.endedAt),
          ),
        )
        .orderBy(asc(workouts.startedAt), asc(workouts.id), asc(workoutExercises.position), asc(workoutSets.position))
        .all(),
    );
  }
  return rows;
}

function rebuildSync(exerciseIds: readonly string[]): void {
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) return;

  const types = new Map<string, ExerciseType>();
  for (const part of chunk(ids, 500)) {
    for (const e of db
      .select({ id: exercises.id, type: exercises.exerciseType })
      .from(exercises)
      .where(inArray(exercises.id, part))
      .all()) {
      types.set(e.id, e.type);
    }
  }

  const setsByExercise = new Map<string, PrSetInput[]>();
  for (const r of loadSetsSync(ids)) {
    const list = setsByExercise.get(r.exerciseId) ?? [];
    list.push({
      workoutId: r.workoutId,
      setId: r.setId,
      achievedAt: r.completedAt ?? r.startedAt,
      setType: r.setType,
      weightKg: r.weightKg,
      reps: r.reps,
      durationS: r.durationS,
      distanceM: r.distanceM,
    });
    setsByExercise.set(r.exerciseId, list);
  }

  const existing: PersonalRecordRow[] = [];
  for (const part of chunk(ids, 500)) {
    existing.push(
      ...db
        .select()
        .from(personalRecords)
        .where(and(inArray(personalRecords.exerciseId, part), isNull(personalRecords.deletedAt)))
        .all(),
    );
  }
  const key = (exerciseId: string, kind: PrKind, setId: string, value: number) =>
    `${exerciseId}|${kind}|${setId}|${Math.round(value / VALUE_EPS)}`;
  const existingByKey = new Map<string, PersonalRecordRow>();
  const toDelete: string[] = [];
  for (const row of existing) {
    const k = key(row.exerciseId, row.kind, row.workoutSetId, row.value);
    if (existingByKey.has(k)) toDelete.push(row.id);
    else existingByKey.set(k, row);
  }

  const at = now();
  const toInsert: (typeof personalRecords.$inferInsert)[] = [];
  const keep = new Set<string>();
  for (const exerciseId of ids) {
    const type = types.get(exerciseId);
    if (!type) continue; // unknown exercise: all its records get soft-deleted below
    const events: PrEvent[] = computePrProgression(type, setsByExercise.get(exerciseId) ?? []);
    for (const ev of events) {
      const k = key(exerciseId, ev.kind, ev.setId, ev.value);
      const hit = existingByKey.get(k);
      if (hit && !keep.has(hit.id)) {
        keep.add(hit.id);
        if (hit.achievedAt !== ev.achievedAt || hit.workoutId !== ev.workoutId) {
          db.update(personalRecords)
            .set({ achievedAt: ev.achievedAt, workoutId: ev.workoutId, updatedAt: at })
            .where(eq(personalRecords.id, hit.id))
            .run();
        }
        continue;
      }
      toInsert.push({
        id: newId(),
        exerciseId,
        workoutId: ev.workoutId,
        workoutSetId: ev.setId,
        kind: ev.kind,
        value: ev.value,
        achievedAt: ev.achievedAt,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      });
    }
  }
  for (const row of existingByKey.values()) if (!keep.has(row.id)) toDelete.push(row.id);

  for (const part of chunk(toDelete, 500)) {
    db.update(personalRecords).set({ deletedAt: at, updatedAt: at }).where(inArray(personalRecords.id, part)).run();
  }
  for (const part of chunk(toInsert, 100)) {
    db.insert(personalRecords).values(part).run();
  }
}

/** Rebuilds personal_records for the given exercises from all completed sets. */
export async function recomputePersonalRecords(exerciseIds: string[]): Promise<void> {
  inSyncTransaction(() => rebuildSync(exerciseIds));
}

/** Synchronous variant for callers already inside a sync transaction (import / restore). */
export function recomputeAllPersonalRecordsSync(): void {
  const used = db
    .selectDistinct({ id: workoutExercises.exerciseId })
    .from(workoutExercises)
    .where(isNull(workoutExercises.deletedAt))
    .all()
    .map((r) => r.id);
  const withRecords = db
    .selectDistinct({ id: personalRecords.exerciseId })
    .from(personalRecords)
    .where(isNull(personalRecords.deletedAt))
    .all()
    .map((r) => r.id);
  rebuildSync([...new Set([...used, ...withRecords])]);
}

/** Rebuilds every exercise's records (after import/restore, or from Settings). */
export async function recomputeAllPersonalRecords(): Promise<void> {
  inSyncTransaction(() => recomputeAllPersonalRecordsSync());
}

/** PRs that were set in the given workout (for the summary screen / history badges). */
export async function getPersonalRecordsForWorkout(workoutId: string): Promise<PersonalRecordRow[]> {
  return db
    .select()
    .from(personalRecords)
    .where(and(eq(personalRecords.workoutId, workoutId), isNull(personalRecords.deletedAt)))
    .orderBy(asc(personalRecords.exerciseId), asc(personalRecords.kind));
}

/** Best record per kind for an exercise. */
export async function getCurrentRecords(exerciseId: string): Promise<PersonalRecordRow[]> {
  return currentRecordsFrom(await recordProgressionQuery(exerciseId));
}

/** Picks the best (latest) row per kind from a progression. */
export function currentRecordsFrom(rows: readonly PersonalRecordRow[]): PersonalRecordRow[] {
  const best = new Map<PrKind, PersonalRecordRow>();
  for (const r of rows) {
    const cur = best.get(r.kind);
    if (!cur || r.value > cur.value + VALUE_EPS) best.set(r.kind, r);
  }
  return [...best.values()];
}

/** Live-queryable: an exercise's full PR progression, oldest first. */
export function recordProgressionQuery(exerciseId: string) {
  return db
    .select()
    .from(personalRecords)
    .where(and(eq(personalRecords.exerciseId, exerciseId), isNull(personalRecords.deletedAt)))
    .orderBy(asc(personalRecords.achievedAt), asc(personalRecords.kind));
}

/** Live-queryable: most recent PRs across all exercises. */
export function recentRecordsQuery(limit = 20) {
  return db
    .select()
    .from(personalRecords)
    .where(isNull(personalRecords.deletedAt))
    .orderBy(desc(personalRecords.achievedAt))
    .limit(limit);
}
