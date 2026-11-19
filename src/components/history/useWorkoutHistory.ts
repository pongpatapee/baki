import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useState } from 'react';

import { listWorkoutsQuery, loadWorkoutListItems, prCountsQuery, type WorkoutListItem } from '@/db/repositories/workouts';

/**
 * Finished workouts with their card summaries. Reacts to the workouts table (finishing, editing
 * and deleting all bump it) and to personal_records.
 */
export function useWorkoutHistory(): { items: WorkoutListItem[]; loaded: boolean } {
  const rows = useLiveQuery(listWorkoutsQuery());
  const prs = useLiveQuery(prCountsQuery());
  const [state, setState] = useState<{ items: WorkoutListItem[]; loaded: boolean }>({ items: [], loaded: false });

  useEffect(() => {
    if (rows.updatedAt == null) return;
    let cancelled = false;
    loadWorkoutListItems(rows.data, prs.data)
      .then((items) => {
        if (!cancelled) setState({ items, loaded: true });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loaded: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [rows.data, rows.updatedAt, prs.data]);

  return state;
}
