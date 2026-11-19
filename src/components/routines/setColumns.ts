import type { DraftSet } from '@/domain/routineEdit';
import { SET_FIELDS, type DistanceUnit, type ExerciseType, type WeightUnit } from '@/domain/types';
import {
  displayWeight,
  formatDuration,
  metersToUnit,
  parseDecimal,
  parseDuration,
  parseInteger,
  trimNumber,
  unitToKg,
  unitToMeters,
} from '@/domain/units';

type TargetKey = 'targetWeightKg' | 'targetReps' | 'targetDurationS' | 'targetDistanceM';

export interface SetColumn {
  key: TargetKey;
  label: string;
  placeholder: string;
  keyboardType: 'decimal-pad' | 'number-pad' | 'numbers-and-punctuation';
  format: (v: number) => string;
  parse: (s: string) => number | null;
}

/** Input columns for a set row, in display order, converting to/from canonical units. */
export function setColumns(type: ExerciseType, weightUnit: WeightUnit, distanceUnit: DistanceUnit): SetColumn[] {
  const f = SET_FIELDS[type];
  const cols: SetColumn[] = [];
  if (f.weight) {
    const prefix = type === 'weighted_bodyweight' ? '+' : type === 'assisted_bodyweight' ? '-' : '';
    cols.push({
      key: 'targetWeightKg',
      label: `${prefix}${weightUnit.toUpperCase()}`,
      placeholder: '-',
      keyboardType: 'decimal-pad',
      format: (kg) => displayWeight(kg, weightUnit),
      parse: (s) => {
        const n = parseDecimal(s);
        return n == null ? null : unitToKg(n, weightUnit);
      },
    });
  }
  if (f.distance) {
    cols.push({
      key: 'targetDistanceM',
      label: distanceUnit.toUpperCase(),
      placeholder: '-',
      keyboardType: 'decimal-pad',
      format: (m) => trimNumber(metersToUnit(m, distanceUnit), 2),
      parse: (s) => {
        const n = parseDecimal(s);
        return n == null ? null : unitToMeters(n, distanceUnit);
      },
    });
  }
  if (f.reps) {
    cols.push({
      key: 'targetReps',
      label: 'REPS',
      placeholder: '-',
      keyboardType: 'number-pad',
      format: (n) => String(n),
      parse: parseInteger,
    });
  }
  if (f.duration) {
    cols.push({
      key: 'targetDurationS',
      label: 'TIME',
      placeholder: '0:00',
      keyboardType: 'numbers-and-punctuation',
      format: (s) => formatDuration(s),
      parse: (s) => {
        const n = parseDuration(s);
        return n == null ? null : Math.round(n);
      },
    });
  }
  return cols;
}

/** Short human summary of a set's targets, e.g. "60 kg × 8", "1:30", "5 km · 25:00". */
export function describeTargets(
  s: Pick<DraftSet, TargetKey>,
  type: ExerciseType,
  weightUnit: WeightUnit,
  distanceUnit: DistanceUnit,
): string {
  const parts = setColumns(type, weightUnit, distanceUnit)
    .map((c) => {
      const v = s[c.key];
      if (v == null) return null;
      if (c.key === 'targetWeightKg') return `${c.label.startsWith('-') ? '-' : c.label.startsWith('+') ? '+' : ''}${c.format(v)} ${weightUnit}`;
      if (c.key === 'targetReps') return `${v} reps`;
      if (c.key === 'targetDistanceM') return `${c.format(v)} ${distanceUnit}`;
      return c.format(v);
    })
    .filter((p): p is string => p != null);
  return parts.length ? parts.join(' × ') : '—';
}
