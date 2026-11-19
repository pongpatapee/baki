/**
 * Estimated one-rep max using the Epley formula: w * (1 + reps / 30).
 * A single rep returns the weight itself. Estimates beyond ~12 reps get unreliable,
 * so callers may choose to ignore them; we still compute them for completeness.
 */
export function estimateOneRepMax(weightKg: number | null, reps: number | null): number | null {
  if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}
