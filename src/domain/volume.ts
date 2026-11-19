import { estimateOneRepMax } from './e1rm';
import type { ExerciseType, SetValues } from './types';

/** Exercise types where weight * reps is meaningful training volume. */
const VOLUME_TYPES: ReadonlySet<ExerciseType> = new Set(['weight_reps', 'weighted_bodyweight']);

export function countsVolume(type: ExerciseType): boolean {
  return VOLUME_TYPES.has(type);
}

export function supportsOneRepMax(type: ExerciseType): boolean {
  return VOLUME_TYPES.has(type);
}

/**
 * Volume of one set in kg. For weighted bodyweight exercises only the added weight counts
 * (same convention as Hevy). Bodyweight, assisted, duration and distance sets have 0 volume.
 */
export function setVolumeKg(type: ExerciseType, set: Pick<SetValues, 'weightKg' | 'reps'>): number {
  if (!countsVolume(type)) return 0;
  if (set.weightKg == null || set.reps == null) return 0;
  return Math.max(0, set.weightKg) * Math.max(0, set.reps);
}

export function setOneRepMax(type: ExerciseType, set: Pick<SetValues, 'weightKg' | 'reps'>): number | null {
  if (!supportsOneRepMax(type)) return null;
  return estimateOneRepMax(set.weightKg, set.reps);
}

export interface TypedSet extends SetValues {
  exerciseType: ExerciseType;
}

/** Total volume (kg) of a list of completed sets. Warm-ups are included, like Hevy. */
export function totalVolumeKg(sets: TypedSet[]): number {
  return sets.reduce((sum, s) => sum + setVolumeKg(s.exerciseType, s), 0);
}
