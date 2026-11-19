// TODO(stats agent): implement. Contract used by the workout finish flow:
import type { PersonalRecordRow } from '../schema';

/** Rebuilds personal_records for the given exercises from all completed sets. */
export async function recomputePersonalRecords(_exerciseIds: string[]): Promise<void> {}

/** PRs that were set in the given workout (for the summary screen / history badges). */
export async function getPersonalRecordsForWorkout(_workoutId: string): Promise<PersonalRecordRow[]> {
  return [];
}
