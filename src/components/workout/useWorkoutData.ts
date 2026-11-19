/**
 * Reactive reads for one workout. Each table gets its own live query because drizzle's
 * useLiveQuery only listens to the table in `from()`.
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useMemo, useState } from 'react';

import { getPersonalRecordsForWorkout } from '@/db/repositories/personalRecords';
import {
  getPreviousSetsForExercise,
  workoutExercisesQuery,
  workoutPrTriggerQuery,
  workoutQuery,
  workoutSetsQuery,
  type WorkoutExerciseWithInfo,
} from '@/db/repositories/workouts';
import type { PersonalRecordRow, WorkoutRow, WorkoutSetRow } from '@/db/schema';
import { summarizeWorkout, type WorkoutTotals } from '@/domain/workout';

export interface WorkoutData {
  loaded: boolean;
  workout: WorkoutRow | null;
  exercises: WorkoutExerciseWithInfo[];
  /** Live sets grouped by workout_exercise id (only for live exercises). */
  setsByExercise: Map<string, WorkoutSetRow[]>;
}

const EMPTY: WorkoutSetRow[] = [];

export function useWorkoutData(workoutId: string | null | undefined): WorkoutData {
  const id = workoutId ?? '';
  const w = useLiveQuery(workoutQuery(id), [id]);
  const ex = useLiveQuery(workoutExercisesQuery(id), [id]);
  const s = useLiveQuery(workoutSetsQuery(id), [id]);

  const exercises = ex.data as WorkoutExerciseWithInfo[];
  const setsByExercise = useMemo(() => {
    const map = new Map<string, WorkoutSetRow[]>();
    for (const e of exercises) map.set(e.id, []);
    for (const set of s.data) map.get(set.workoutExerciseId)?.push(set);
    return map;
  }, [exercises, s.data]);

  const row = w.data[0] ?? null;
  return {
    loaded: !!workoutId && w.updatedAt != null && ex.updatedAt != null && s.updatedAt != null,
    workout: row && row.deletedAt == null ? row : null,
    exercises,
    setsByExercise,
  };
}

export function setsOf(data: WorkoutData, workoutExerciseId: string): WorkoutSetRow[] {
  return data.setsByExercise.get(workoutExerciseId) ?? EMPTY;
}

export function useWorkoutTotals(data: WorkoutData, nowMs?: number): WorkoutTotals | null {
  const { workout, exercises, setsByExercise } = data;
  return useMemo(() => {
    if (!workout) return null;
    return summarizeWorkout(
      workout,
      exercises.map((e) => ({
        exerciseType: e.exerciseType,
        sets: (setsByExercise.get(e.id) ?? EMPTY).map((x) => ({ ...x, completed: x.completedAt != null })),
      })),
      nowMs,
    );
  }, [workout, exercises, setsByExercise, nowMs]);
}

/**
 * Previous-session sets per exercise id (for the PREVIOUS column). Loaded once per exercise;
 * previous workouts don't change while this one is being edited.
 */
export function usePreviousSets(workoutId: string | null | undefined, exerciseIds: string[]): Map<string, WorkoutSetRow[]> {
  const [map, setMap] = useState<Map<string, WorkoutSetRow[]>>(() => new Map());
  const key = [...new Set(exerciseIds)].sort().join(',');
  useEffect(() => {
    if (!workoutId) return;
    let cancelled = false;
    const ids = key ? key.split(',') : [];
    const missing = ids.filter((i) => !map.has(i));
    if (missing.length === 0) return;
    void (async () => {
      const entries = await Promise.all(
        missing.map(async (exId) => [exId, await getPreviousSetsForExercise(exId, workoutId)] as const),
      );
      if (cancelled) return;
      setMap((prev) => {
        const next = new Map(prev);
        for (const [k, v] of entries) next.set(k, v);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId, key]);
  return map;
}

/** PRs set in a workout, refreshed whenever personal_records changes. */
export function useWorkoutPrs(workoutId: string | null | undefined): PersonalRecordRow[] {
  const id = workoutId ?? '';
  const trigger = useLiveQuery(workoutPrTriggerQuery(id), [id]);
  const [prs, setPrs] = useState<PersonalRecordRow[]>([]);
  useEffect(() => {
    if (!workoutId) return;
    let cancelled = false;
    getPersonalRecordsForWorkout(workoutId)
      .then((rows) => {
        if (!cancelled) setPrs(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workoutId, trigger.data]);
  return prs;
}
