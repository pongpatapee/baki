import { sql } from 'drizzle-orm';

import { db } from '../client';
import { now } from '../ids';
import { getSetting } from '../repositories/settings';
import { exercises, settings } from '../schema';
import { EXERCISE_SEED_VERSION, SEED_EXERCISES } from './exercises';

/**
 * Upserts the bundled exercise library when its version changes.
 * Seeded rows keep stable ids, so user history always points at the same exercise.
 * User-made changes to seeded rows' names are overwritten only when the seed version bumps.
 */
export async function seedIfNeeded(): Promise<void> {
  const applied = await getSetting('exerciseSeedVersion');
  if (applied >= EXERCISE_SEED_VERSION) return;
  const at = now();
  // drizzle's expo-sqlite transactions are synchronous: every statement inside must be sync (.run()).
  db.transaction((tx) => {
    for (const e of SEED_EXERCISES) {
      tx
        .insert(exercises)
        .values({ ...e, isCustom: false, notes: null, mergedIntoId: null, createdAt: at, updatedAt: at, deletedAt: null })
        .onConflictDoUpdate({
          target: exercises.id,
          set: {
            name: sql`excluded.name`,
            exerciseType: sql`excluded.exercise_type`,
            equipment: sql`excluded.equipment`,
            primaryMuscle: sql`excluded.primary_muscle`,
            secondaryMuscles: sql`excluded.secondary_muscles`,
            updatedAt: at,
          },
        })
        .run();
    }
    tx.insert(settings)
      .values({ key: 'exerciseSeedVersion', value: JSON.stringify(EXERCISE_SEED_VERSION), updatedAt: at })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(EXERCISE_SEED_VERSION), updatedAt: at } })
      .run();
  });
}
