import { Alert } from 'react-native';

import { startWorkout } from '@/stores/activeWorkout';

/** Starts a workout (optionally from a routine), surfacing failures as an alert. */
export async function startWorkoutSafely(routineId?: string): Promise<void> {
  try {
    await startWorkout(routineId ? { routineId } : {});
  } catch (e) {
    Alert.alert('Could not start workout', e instanceof Error ? e.message : String(e));
  }
}

export function startRoutineSafely(routineId: string): Promise<void> {
  return startWorkoutSafely(routineId);
}
