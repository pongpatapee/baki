import { metricQuantity, type ExerciseMetric } from '@/domain/stats';
import type { DistanceUnit, PrKind, WeightUnit } from '@/domain/types';
import { formatDistance, formatDuration, formatVolume, formatWeight, kgToUnit, metersToUnit, trimNumber } from '@/domain/units';

export interface Units {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}

/** Metric value converted to the user's display unit (numbers for chart axes). */
export function metricToDisplay(metric: ExerciseMetric, value: number, u: Units): number {
  switch (metricQuantity(metric)) {
    case 'weight':
      return kgToUnit(value, u.weightUnit);
    case 'distance':
      return metersToUnit(value, u.distanceUnit);
    case 'duration':
    case 'reps':
      return value;
  }
}

/** Formats a display-unit metric value (as produced by metricToDisplay). */
export function formatDisplayMetric(metric: ExerciseMetric, display: number, u: Units): string {
  switch (metricQuantity(metric)) {
    case 'weight':
      return metric === 'session_volume' || metric === 'set_volume'
        ? `${Math.round(display).toLocaleString('en-US')} ${u.weightUnit}`
        : `${trimNumber(display, 1)} ${u.weightUnit}`;
    case 'distance':
      return `${trimNumber(display, 2)} ${u.distanceUnit}`;
    case 'duration':
      return formatDuration(display);
    case 'reps':
      return `${Math.round(display)} reps`;
  }
}

export function formatPrValue(kind: PrKind, value: number, u: Units): string {
  switch (kind) {
    case 'heaviest_weight':
    case 'best_e1rm':
      return formatWeight(value, u.weightUnit);
    case 'best_set_volume':
      return formatVolume(value, u.weightUnit);
    case 'most_reps':
      return `${value} reps`;
    case 'longest_duration':
      return formatDuration(value);
    case 'longest_distance':
      return formatDistance(value, u.distanceUnit);
  }
}

/** "100 kg × 5", "12 reps", "5 km · 25:00" — compact set summary. */
export function formatSetSummary(
  s: { weightKg: number | null; reps: number | null; durationS: number | null; distanceM: number | null },
  u: Units,
): string {
  const parts: string[] = [];
  if (s.weightKg != null && s.reps != null) parts.push(`${formatWeight(s.weightKg, u.weightUnit)} × ${s.reps}`);
  else if (s.weightKg != null) parts.push(formatWeight(s.weightKg, u.weightUnit));
  else if (s.reps != null) parts.push(`${s.reps} reps`);
  if (s.distanceM != null) parts.push(formatDistance(s.distanceM, u.distanceUnit));
  if (s.durationS != null) parts.push(formatDuration(s.durationS));
  return parts.join(' · ') || '-';
}

/** "Mon, Jan 6, 2025". */
export function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
