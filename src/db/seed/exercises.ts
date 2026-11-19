import type { Equipment, ExerciseType, MuscleGroup } from '@/domain/types';

export interface SeedExercise {
  /** Stable slug id, prefixed "ex_". Never change an id once shipped. */
  id: string;
  name: string;
  exerciseType: ExerciseType;
  equipment: Equipment;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
}

/** Bump whenever SEED_EXERCISES changes so existing installs pick up new/updated entries. */
export const EXERCISE_SEED_VERSION = 1;

// TODO(exercises agent): replace with the full curated library.
export const SEED_EXERCISES: SeedExercise[] = [
  {
    id: 'ex_bench_press_barbell',
    name: 'Bench Press (Barbell)',
    exerciseType: 'weight_reps',
    equipment: 'barbell',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
  },
];
