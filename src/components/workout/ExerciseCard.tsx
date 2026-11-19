/**
 * One exercise in a workout: header (name, menu), notes, rest timer, set table, "+ Add Set".
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { ExerciseAvatar, IconButton, Text } from '@/components/ui';
import type { WorkoutExerciseWithInfo } from '@/db/repositories/workouts';
import type { WorkoutSetRow } from '@/db/schema';
import type { DistanceUnit, WeightUnit } from '@/domain/types';
import { workingSetNumbers } from '@/components/SetTypeBadge';
import { columnHeader, formatRest, matchPreviousSets, setColumns } from '@/domain/workout';
import { useTheme } from '@/theme/AppProviders';

import { CHECK_COL_WIDTH, inputColWidth, SET_COL_WIDTH, SetRow, type SetRowProps } from './SetRow';

export interface ExerciseCardProps {
  exercise: WorkoutExerciseWithInfo;
  sets: WorkoutSetRow[];
  previousSets: WorkoutSetRow[] | undefined;
  supersetColor: string | null;
  mode: 'active' | 'edit';
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  defaultRestSeconds: number;
  onOpenMenu: (workoutExerciseId: string) => void;
  onOpenRest: (workoutExerciseId: string) => void;
  onAddSet: (workoutExerciseId: string) => void;
  onChangeNotes: (workoutExerciseId: string, notes: string | null) => void;
  onOpenSetOptions: SetRowProps['onOpenOptions'];
  onToggleComplete: SetRowProps['onToggleComplete'];
  onChangeValues: SetRowProps['onChangeValues'];
  onRemoveSet: SetRowProps['onRemove'];
}

function ExerciseCardImpl(p: ExerciseCardProps) {
  const t = useTheme();
  const { exercise: ex, sets } = p;
  const columns = useMemo(() => setColumns(ex.exerciseType), [ex.exerciseType]);
  const numbers = useMemo(() => workingSetNumbers(sets), [sets]);
  const previous = useMemo(() => matchPreviousSets(sets, p.previousSets ?? []), [sets, p.previousSets]);

  const rest = ex.restSeconds ?? p.defaultRestSeconds;
  const width = inputColWidth(columns.length);

  return (
    <View
      style={{
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.lg,
        overflow: 'hidden',
        borderLeftWidth: p.supersetColor ? 4 : 0,
        borderLeftColor: p.supersetColor ?? 'transparent',
      }}
    >
      <View style={{ padding: t.spacing(3), paddingBottom: t.spacing(2), gap: t.spacing(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing(3) }}>
          <ExerciseAvatar name={ex.exerciseName} size={36} />
          <Pressable
            style={{ flex: 1 }}
            onPress={() => router.push(`/exercise/${ex.exerciseId}`)}
            accessibilityRole="link"
          >
            <Text weight="700" color={t.colors.primary} numberOfLines={2}>
              {ex.exerciseName}
            </Text>
            {p.supersetColor ? (
              <Text variant="caption" weight="700" color={p.supersetColor}>
                SUPERSET
              </Text>
            ) : null}
          </Pressable>
          <IconButton
            icon="ellipsis-horizontal"
            accessibilityLabel="Exercise options"
            onPress={() => p.onOpenMenu(ex.id)}
            color={t.colors.textMuted}
          />
        </View>

        <ExerciseNotesInput
          key={ex.notes ?? ''}
          notes={ex.notes}
          onCommit={(v) => p.onChangeNotes(ex.id, v)}
        />

        {p.mode === 'active' ? (
          <Pressable
            onPress={() => p.onOpenRest(ex.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
            hitSlop={6}
            accessibilityRole="button"
          >
            <Ionicons name="timer-outline" size={16} color={t.colors.primary} />
            <Text variant="label" color={t.colors.primary}>
              Rest Timer: {formatRest(rest)}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing(3), paddingVertical: 4 }}>
        <Text variant="caption" muted weight="700" align="center" style={{ width: SET_COL_WIDTH }}>
          SET
        </Text>
        <Text variant="caption" muted weight="700" align="center" style={{ flex: 1 }}>
          PREVIOUS
        </Text>
        {columns.map((c) => (
          <Text key={c} variant="caption" muted weight="700" align="center" style={{ width, marginHorizontal: 3 }}>
            {columnHeader(ex.exerciseType, c, p.weightUnit, p.distanceUnit)}
          </Text>
        ))}
        <View style={{ width: CHECK_COL_WIDTH, alignItems: 'center', marginLeft: 3 }}>
          <Ionicons name="checkmark" size={14} color={t.colors.textMuted} />
        </View>
      </View>

      {sets.map((s, i) => (
        <SetRow
          key={s.id}
          set={s}
          workingNumber={numbers[i] ?? null}
          exerciseType={ex.exerciseType}
          columns={columns}
          previous={previous[i] ?? null}
          weightUnit={p.weightUnit}
          distanceUnit={p.distanceUnit}
          onOpenOptions={p.onOpenSetOptions}
          onToggleComplete={p.onToggleComplete}
          onChangeValues={p.onChangeValues}
          onRemove={p.onRemoveSet}
        />
      ))}

      <Pressable
        onPress={() => p.onAddSet(ex.id)}
        accessibilityRole="button"
        style={({ pressed }) => ({
          margin: t.spacing(3),
          marginTop: t.spacing(2),
          paddingVertical: t.spacing(2),
          borderRadius: t.radius.md,
          backgroundColor: t.colors.surfaceAlt,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 6,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name="add" size={18} color={t.colors.text} />
        <Text weight="600">Add Set</Text>
      </Pressable>
    </View>
  );
}

/** Keyed by the stored notes so external changes reset the local text. */
function ExerciseNotesInput({ notes: stored, onCommit }: { notes: string | null; onCommit: (v: string | null) => void }) {
  const t = useTheme();
  const [notes, setNotes] = useState(stored ?? '');
  return (
    <TextInput
      value={notes}
      onChangeText={setNotes}
      onEndEditing={() => {
        const v = notes.trim() ? notes : null;
        if (v !== stored) onCommit(v);
      }}
      placeholder="Add notes here..."
      placeholderTextColor={t.colors.textFaint}
      selectionColor={t.colors.primary}
      multiline
      style={{ color: t.colors.text, fontSize: t.font.size.sm, paddingVertical: 2 }}
    />
  );
}

export const ExerciseCard = memo(ExerciseCardImpl);
