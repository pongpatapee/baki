/**
 * Core domain enums shared by the database schema, domain logic and UI.
 * Kept free of any React Native / Expo imports so it can be unit-tested in Node.
 */

export const EXERCISE_TYPES = [
  'weight_reps',
  'bodyweight_reps',
  'weighted_bodyweight',
  'assisted_bodyweight',
  'duration',
  'distance_duration',
  'weight_distance',
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  weight_reps: 'Weight & Reps',
  bodyweight_reps: 'Bodyweight Reps',
  weighted_bodyweight: 'Weighted Bodyweight',
  assisted_bodyweight: 'Assisted Bodyweight',
  duration: 'Duration',
  distance_duration: 'Distance & Duration',
  weight_distance: 'Weight & Distance',
};

export const EQUIPMENT = [
  'none',
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'cable',
  'plate',
  'resistance_band',
  'suspension',
  'other',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  none: 'None',
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  machine: 'Machine',
  cable: 'Cable',
  plate: 'Plate',
  resistance_band: 'Resistance Band',
  suspension: 'Suspension',
  other: 'Other',
};

export const MUSCLE_GROUPS = [
  'chest',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abdominals',
  'lats',
  'upper_back',
  'lower_back',
  'traps',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'adductors',
  'abductors',
  'neck',
  'cardio',
  'full_body',
  'other',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abdominals: 'Abdominals',
  lats: 'Lats',
  upper_back: 'Upper Back',
  lower_back: 'Lower Back',
  traps: 'Traps',
  quadriceps: 'Quadriceps',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  adductors: 'Adductors',
  abductors: 'Abductors',
  neck: 'Neck',
  cardio: 'Cardio',
  full_body: 'Full Body',
  other: 'Other',
};

export const SET_TYPES = ['normal', 'warmup', 'failure', 'drop'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const SET_TYPE_LABELS: Record<SetType, string> = {
  normal: 'Normal',
  warmup: 'Warm-up',
  failure: 'Failure',
  drop: 'Drop Set',
};

export const PR_KINDS = [
  'heaviest_weight',
  'best_e1rm',
  'best_set_volume',
  'most_reps',
  'longest_duration',
  'longest_distance',
] as const;
export type PrKind = (typeof PR_KINDS)[number];

export const PR_KIND_LABELS: Record<PrKind, string> = {
  heaviest_weight: 'Heaviest Weight',
  best_e1rm: 'Best Est. 1RM',
  best_set_volume: 'Best Set Volume',
  most_reps: 'Most Reps',
  longest_duration: 'Longest Duration',
  longest_distance: 'Longest Distance',
};

export type WeightUnit = 'kg' | 'lb';
export type DistanceUnit = 'km' | 'mi';

/** Which input fields an exercise type uses when logging a set. */
export interface SetFields {
  weight: boolean;
  reps: boolean;
  duration: boolean;
  distance: boolean;
}

export const SET_FIELDS: Record<ExerciseType, SetFields> = {
  weight_reps: { weight: true, reps: true, duration: false, distance: false },
  bodyweight_reps: { weight: false, reps: true, duration: false, distance: false },
  weighted_bodyweight: { weight: true, reps: true, duration: false, distance: false },
  assisted_bodyweight: { weight: true, reps: true, duration: false, distance: false },
  duration: { weight: false, reps: false, duration: true, distance: false },
  distance_duration: { weight: false, reps: false, duration: true, distance: true },
  weight_distance: { weight: true, reps: false, duration: false, distance: true },
};

/**
 * A logged set in the plain shape domain functions operate on.
 * Units are canonical: kilograms, seconds, meters.
 */
export interface SetValues {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  rpe: number | null;
}
