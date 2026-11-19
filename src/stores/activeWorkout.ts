// TODO(workout agent): implement. Contract used by other screens:
//   startWorkout({ routineId? }) creates the in-progress workout (unless one already exists)
//   and navigates to /workout/active.

export interface StartWorkoutOptions {
  routineId?: string;
}

export async function startWorkout(_opts: StartWorkoutOptions = {}): Promise<void> {
  throw new Error('startWorkout not implemented yet');
}
