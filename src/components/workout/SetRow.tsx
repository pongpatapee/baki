/**
 * One row of the set table: SET | PREVIOUS | value inputs | ✓.
 * Inputs keep their text locally and commit to SQLite on end-editing, so typing only re-renders
 * this row. The row is memoized on the set's values.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { SetTypeBadge } from '@/components/SetTypeBadge';
import { Text } from '@/components/ui';
import type { WorkoutSetRow } from '@/db/schema';
import type { DistanceUnit, ExerciseType, WeightUnit } from '@/domain/types';
import {
  displayWeight,
  formatDuration,
  metersToUnit,
  parseDecimal,
  parseInteger,
  trimNumber,
  unitToKg,
  unitToMeters,
} from '@/domain/units';
import { fillMissing, formatSetCompact, isSetLoggable, parseTimerInput, type SetColumn } from '@/domain/workout';
import { useTheme } from '@/theme/AppProviders';

export type SetValuesPatch = Pick<WorkoutSetRow, 'weightKg' | 'reps' | 'durationS' | 'distanceM'>;

export const SET_COL_WIDTH = 34;
export const CHECK_COL_WIDTH = 40;
export function inputColWidth(cols: number): number {
  return cols === 1 ? 92 : 66;
}

const FIELD: Record<SetColumn, keyof SetValuesPatch> = {
  weight: 'weightKg',
  reps: 'reps',
  distance: 'distanceM',
  duration: 'durationS',
};

function toText(col: SetColumn, v: number | null, wu: WeightUnit, du: DistanceUnit): string {
  if (v == null) return '';
  switch (col) {
    case 'weight':
      return displayWeight(v, wu);
    case 'reps':
      return String(v);
    case 'distance':
      return trimNumber(metersToUnit(v, du), 2);
    case 'duration':
      return formatDuration(v);
  }
}

/** Parses typed text to canonical units; `undefined` = invalid input. */
function fromText(col: SetColumn, text: string, wu: WeightUnit, du: DistanceUnit): number | null | undefined {
  if (!text.trim()) return null;
  switch (col) {
    case 'weight': {
      const n = parseDecimal(text);
      return n == null || n < 0 ? undefined : unitToKg(n, wu);
    }
    case 'reps': {
      const n = parseInteger(text);
      return n == null ? undefined : n;
    }
    case 'distance': {
      const n = parseDecimal(text);
      return n == null || n < 0 ? undefined : unitToMeters(n, du);
    }
    case 'duration': {
      const n = parseTimerInput(text);
      return n == null ? undefined : Math.round(n);
    }
  }
}

const KEYBOARD: Record<SetColumn, KeyboardTypeOptions> = {
  weight: 'decimal-pad',
  reps: 'number-pad',
  distance: 'decimal-pad',
  duration: 'number-pad',
};

export interface SetRowProps {
  set: WorkoutSetRow;
  /** 1-based number among normal sets (null for warm-up/failure/drop). */
  workingNumber: number | null;
  exerciseType: ExerciseType;
  columns: SetColumn[];
  previous: WorkoutSetRow | null;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  onOpenOptions: (setId: string) => void;
  onToggleComplete: (set: WorkoutSetRow, completed: boolean, values: SetValuesPatch) => void;
  onChangeValues: (setId: string, values: Partial<SetValuesPatch>) => void;
  onRemove: (setId: string) => void;
}

function SetRowImpl(p: SetRowProps) {
  const t = useTheme();
  const { set, columns, weightUnit: wu, distanceUnit: du } = p;
  const completed = set.completedAt != null;

  const stored = (col: SetColumn) => toText(col, set[FIELD[col]], wu, du);
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(columns.map((c) => [c, stored(c)])),
  );
  const focused = useRef<SetColumn | null>(null);
  const swipeRef = useRef<SwipeableMethods | null>(null);

  // Pull in external changes (copy previous, replace exercise, unit change) for unfocused cells.
  const storedKey = columns.map(stored).join('|');
  useEffect(() => {
    setTexts((prev) => {
      const next = { ...prev };
      for (const c of columns) if (focused.current !== c) next[c] = stored(c);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);

  const currentValues = (): SetValuesPatch => {
    const v: SetValuesPatch = { weightKg: set.weightKg, reps: set.reps, durationS: set.durationS, distanceM: set.distanceM };
    for (const c of columns) {
      const parsed = fromText(c, texts[c] ?? '', wu, du);
      if (parsed !== undefined) v[FIELD[c]] = parsed;
    }
    return v;
  };

  const commit = (col: SetColumn) => {
    focused.current = null;
    const text = texts[col] ?? '';
    const parsed = fromText(col, text, wu, du);
    if (parsed === undefined) {
      setTexts((prev) => ({ ...prev, [col]: stored(col) }));
      return;
    }
    // Compare in display space so unit round-trips don't cause spurious writes.
    if (toText(col, parsed, wu, du) === stored(col)) {
      setTexts((prev) => ({ ...prev, [col]: stored(col) }));
      return;
    }
    p.onChangeValues(set.id, { [FIELD[col]]: parsed });
  };

  const toggle = () => {
    const values = currentValues();
    if (completed) {
      p.onToggleComplete(set, false, values);
      return;
    }
    const filled = fillMissing(p.exerciseType, values, p.previous);
    if (!isSetLoggable(p.exerciseType, filled)) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setTexts(Object.fromEntries(columns.map((c) => [c, toText(c, filled[FIELD[c]], wu, du)])));
    p.onToggleComplete(set, true, filled);
  };

  const copyPrevious = () => {
    if (!p.previous) return;
    const patch: Partial<SetValuesPatch> = {};
    for (const c of columns) patch[FIELD[c]] = p.previous[FIELD[c]];
    void Haptics.selectionAsync().catch(() => {});
    p.onChangeValues(set.id, patch);
  };

  const prevLabel = p.previous ? formatSetCompact(p.exerciseType, p.previous, wu, du) : '-';
  const width = inputColWidth(columns.length);
  const rowBg = completed ? t.colors.successMuted : t.colors.surface;

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            swipeRef.current?.close();
            p.onRemove(set.id);
          }}
          accessibilityLabel="Delete set"
          style={{ width: 84, backgroundColor: t.colors.danger, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
          <Text variant="caption" weight="700" color="#FFFFFF">
            Delete
          </Text>
        </Pressable>
      )}
    >
      <View style={[styles.row, { backgroundColor: rowBg, paddingHorizontal: t.spacing(3) }]}>
        <View style={{ width: SET_COL_WIDTH, alignItems: 'center' }}>
          <SetTypeBadge setType={set.setType} index={p.workingNumber} onPress={() => p.onOpenOptions(set.id)} />
        </View>

        <Pressable
          onPress={copyPrevious}
          disabled={!p.previous}
          accessibilityLabel={p.previous ? `Previous ${prevLabel}, tap to copy` : 'No previous set'}
          style={{ flex: 1, paddingHorizontal: t.spacing(2) }}
        >
          <Text variant="label" faint numberOfLines={1} align="center" weight="500">
            {prevLabel}
          </Text>
        </Pressable>

        {columns.map((c) => (
          <TextInput
            key={c}
            value={texts[c] ?? ''}
            onChangeText={(v) => setTexts((prev) => ({ ...prev, [c]: v }))}
            onFocus={() => {
              focused.current = c;
            }}
            onEndEditing={() => commit(c)}
            placeholder={p.previous ? toText(c, p.previous[FIELD[c]], wu, du) || '-' : '-'}
            placeholderTextColor={t.colors.textFaint}
            keyboardType={KEYBOARD[c]}
            selectTextOnFocus
            returnKeyType="done"
            selectionColor={t.colors.primary}
            accessibilityLabel={c}
            testID={`set-input-${c}`}
            style={{
              width,
              marginHorizontal: 3,
              paddingVertical: 6,
              borderRadius: t.radius.sm,
              textAlign: 'center',
              fontSize: t.font.size.md,
              fontWeight: '600',
              color: t.colors.text,
              backgroundColor: completed ? 'transparent' : t.colors.surfaceAlt,
            }}
          />
        ))}

        <Pressable
          onPress={toggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed }}
          accessibilityLabel="Complete set"
          testID="set-complete"
          hitSlop={6}
          style={({ pressed }) => [
            styles.check,
            {
              width: 32,
              marginLeft: (CHECK_COL_WIDTH - 32) / 2 + 3,
              borderRadius: t.radius.sm,
              backgroundColor: completed ? t.colors.success : t.colors.surfaceAlt,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="checkmark" size={20} color={completed ? '#FFFFFF' : t.colors.textFaint} />
        </Pressable>
      </View>
    </Swipeable>
  );
}

function sameSet(a: WorkoutSetRow | null, b: WorkoutSetRow | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.setType === b.setType &&
    a.weightKg === b.weightKg &&
    a.reps === b.reps &&
    a.durationS === b.durationS &&
    a.distanceM === b.distanceM &&
    a.rpe === b.rpe &&
    a.completedAt === b.completedAt
  );
}

export const SetRow = memo(SetRowImpl, (a, b) => {
  return (
    sameSet(a.set, b.set) &&
    sameSet(a.previous, b.previous) &&
    a.workingNumber === b.workingNumber &&
    a.exerciseType === b.exerciseType &&
    a.columns.join() === b.columns.join() &&
    a.weightUnit === b.weightUnit &&
    a.distanceUnit === b.distanceUnit &&
    a.onOpenOptions === b.onOpenOptions &&
    a.onToggleComplete === b.onToggleComplete &&
    a.onChangeValues === b.onChangeValues &&
    a.onRemove === b.onRemove
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  check: { height: 30, alignItems: 'center', justifyContent: 'center' },
});
