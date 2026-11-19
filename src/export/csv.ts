/**
 * Human-readable CSV export: one row per completed set, oldest first.
 * Always includes canonical columns (kg, km, seconds) plus the user's units when they differ.
 */
import Papa from 'papaparse';

import type { DistanceUnit, ExerciseType, SetType, WeightUnit } from '@/domain/types';
import { EXERCISE_TYPE_LABELS, SET_TYPE_LABELS } from '@/domain/types';
import { formatDuration, kgToUnit, metersToUnit, trimNumber } from '@/domain/units';
import { countsVolume, setVolumeKg } from '@/domain/volume';

export interface CsvSetRow {
  workoutTitle: string;
  workoutNotes: string | null;
  startedAt: number;
  endedAt: number | null;
  exerciseName: string;
  exerciseType: ExerciseType;
  exerciseNotes: string | null;
  supersetGroup: string | null;
  /** 1-based index among the exercise's sets. */
  setNumber: number;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  rpe: number | null;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** Local "YYYY-MM-DD HH:mm". */
export function formatLocalDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

const num = (n: number | null, decimals: number) => (n == null ? '' : trimNumber(n, decimals));

export function buildSetsCsv(rows: readonly CsvSetRow[], units: { weight: WeightUnit; distance: DistanceUnit }): string {
  const header = [
    'workout',
    'start_time',
    'end_time',
    'exercise',
    'exercise_type',
    'superset',
    'set',
    'set_type',
    'weight_kg',
    ...(units.weight === 'lb' ? ['weight_lb'] : []),
    'reps',
    'distance_km',
    ...(units.distance === 'mi' ? ['distance_mi'] : []),
    'duration_seconds',
    'duration',
    'rpe',
    'volume_kg',
    ...(units.weight === 'lb' ? ['volume_lb'] : []),
    'exercise_notes',
    'workout_notes',
  ];
  const data = rows.map((r) => {
    const volume = countsVolume(r.exerciseType) && r.weightKg != null && r.reps != null ? setVolumeKg(r.exerciseType, r) : null;
    return [
      r.workoutTitle,
      formatLocalDateTime(r.startedAt),
      r.endedAt != null ? formatLocalDateTime(r.endedAt) : '',
      r.exerciseName,
      EXERCISE_TYPE_LABELS[r.exerciseType] ?? r.exerciseType,
      r.supersetGroup ?? '',
      String(r.setNumber),
      SET_TYPE_LABELS[r.setType] ?? r.setType,
      num(r.weightKg, 3),
      ...(units.weight === 'lb' ? [r.weightKg == null ? '' : trimNumber(kgToUnit(r.weightKg, 'lb'), 2)] : []),
      r.reps == null ? '' : String(r.reps),
      r.distanceM == null ? '' : trimNumber(metersToUnit(r.distanceM, 'km'), 3),
      ...(units.distance === 'mi' ? [r.distanceM == null ? '' : trimNumber(metersToUnit(r.distanceM, 'mi'), 3)] : []),
      r.durationS == null ? '' : String(r.durationS),
      r.durationS == null ? '' : formatDuration(r.durationS),
      num(r.rpe, 1),
      num(volume, 2),
      ...(units.weight === 'lb' ? [volume == null ? '' : trimNumber(kgToUnit(volume, 'lb'), 1)] : []),
      r.exerciseNotes ?? '',
      r.workoutNotes ?? '',
    ];
  });
  return Papa.unparse({ fields: header, data }, { newline: '\r\n' });
}

export function csvFileName(exportedAt: number): string {
  const d = new Date(exportedAt);
  return `baki-sets-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.csv`;
}
