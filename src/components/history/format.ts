import type { DistanceUnit, PrKind, WeightUnit } from '@/domain/types';
import { formatDistance, formatDuration, formatVolume, formatWeight } from '@/domain/units';

export function formatPrValue(kind: PrKind, value: number, wu: WeightUnit, du: DistanceUnit): string {
  switch (kind) {
    case 'heaviest_weight':
    case 'best_e1rm':
      return formatWeight(value, wu);
    case 'best_set_volume':
      return formatVolume(value, wu);
    case 'most_reps':
      return `${Math.round(value)} reps`;
    case 'longest_duration':
      return formatDuration(value);
    case 'longest_distance':
      return formatDistance(value, du);
  }
}

const DATE_FMT: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
const TIME_FMT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

/** "Tuesday, Nov 17, 2026 · 7:30 AM" */
export function formatWorkoutDate(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, DATE_FMT)} · ${d.toLocaleTimeString(undefined, TIME_FMT)}`;
}

/** "Tue, Nov 17" */
export function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
