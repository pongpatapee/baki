import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SetTypeBadge, setTypeSheetOptions } from '@/components/SetTypeBadge';
import { ExerciseAvatar, IconButton, Row, Text } from '@/components/ui';
import type { ExerciseRow } from '@/db/schema';
import {
  appendSet,
  formatRest,
  nextSetType,
  REST_OPTIONS,
  workingSetNumbers,
  type DraftExercise,
  type DraftSet,
} from '@/domain/routineEdit';
import type { DistanceUnit, WeightUnit } from '@/domain/types';
import { useTheme } from '@/theme/AppProviders';

import type { SheetRequest } from './ActionSheet';
import { NumberCell } from './NumberCell';
import { setColumns } from './setColumns';

export interface RoutineExerciseEditorProps {
  item: DraftExercise;
  exercise: ExerciseRow | undefined;
  index: number;
  count: number;
  /** Superset accent color, if this exercise is in a superset. */
  supersetColor: string | null;
  linkedWithNext: boolean;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  defaultRestSeconds: number;
  newId: () => string;
  showSheet: (req: SheetRequest) => void;
  onChange: (id: string, fn: (e: DraftExercise) => DraftExercise) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onLinkNext: (index: number) => void;
  onUnlink: (index: number) => void;
  onReplace: (index: number) => void;
  onRemove: (index: number) => void;
}

export const RoutineExerciseEditor = memo(function RoutineExerciseEditor(p: RoutineExerciseEditorProps) {
  const t = useTheme();
  const { item, exercise } = p;
  const type = exercise?.exerciseType ?? 'weight_reps';
  const cols = useMemo(() => setColumns(type, p.weightUnit, p.distanceUnit), [type, p.weightUnit, p.distanceUnit]);
  const numbers = workingSetNumbers(item.sets);

  const updateSet = (setId: string, patch: Partial<DraftSet>) =>
    p.onChange(item.id, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));
  const removeSet = (setId: string) =>
    p.onChange(item.id, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));
  const addSet = () => {
    void Haptics.selectionAsync().catch(() => {});
    p.onChange(item.id, (e) => ({ ...e, sets: appendSet(e.sets, p.newId()) }));
  };

  const openMenu = () => {
    const inSuperset = item.supersetGroup != null;
    p.showSheet({
      title: exercise?.name ?? 'Exercise',
      options: [
        ...(p.index > 0 ? [{ label: 'Move Up', icon: 'arrow-up' as const, onPress: () => p.onMove(p.index, -1) }] : []),
        ...(p.index < p.count - 1
          ? [{ label: 'Move Down', icon: 'arrow-down' as const, onPress: () => p.onMove(p.index, 1) }]
          : []),
        ...(p.index < p.count - 1 && !p.linkedWithNext
          ? [{ label: 'Superset with Next Exercise', icon: 'link' as const, onPress: () => p.onLinkNext(p.index) }]
          : []),
        ...(inSuperset
          ? [{ label: 'Remove from Superset', icon: 'unlink' as const, onPress: () => p.onUnlink(p.index) }]
          : []),
        { label: 'Replace Exercise', icon: 'swap-horizontal' as const, onPress: () => p.onReplace(p.index) },
        { label: 'Remove Exercise', icon: 'trash-outline' as const, destructive: true, onPress: () => p.onRemove(p.index) },
      ],
    });
  };

  const openRest = () =>
    p.showSheet({
      title: 'Rest Timer',
      message: 'Rest time between sets of this exercise',
      options: REST_OPTIONS.map((r) => ({
        label: formatRest(r, r == null ? p.defaultRestSeconds : undefined),
        selected: r === item.restSeconds,
        onPress: () => p.onChange(item.id, (e) => ({ ...e, restSeconds: r })),
      })),
    });

  return (
    <View
      style={{
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.colors.border,
        overflow: 'hidden',
      }}
    >
      {p.supersetColor ? (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: p.supersetColor }} />
      ) : null}
      <View style={{ padding: t.spacing(3), paddingLeft: t.spacing(4), gap: t.spacing(2.5) }}>
        <Row gap={3}>
          <ExerciseAvatar name={exercise?.name ?? '?'} size={36} />
          <View style={{ flex: 1 }}>
            <Text weight="600" color={t.colors.primary} numberOfLines={2}>
              {exercise?.name ?? 'Unknown exercise'}
            </Text>
            {p.supersetColor ? (
              <Text variant="caption" weight="700" color={p.supersetColor}>
                SUPERSET
              </Text>
            ) : null}
          </View>
          <IconButton icon="ellipsis-horizontal" accessibilityLabel="Exercise options" onPress={openMenu} />
        </Row>

        <TextInput
          value={item.notes ?? ''}
          onChangeText={(v) => p.onChange(item.id, (e) => ({ ...e, notes: v }))}
          placeholder="Add routine notes here"
          placeholderTextColor={t.colors.textFaint}
          selectionColor={t.colors.primary}
          multiline
          style={{ color: t.colors.text, fontSize: t.font.size.sm, paddingVertical: 2 }}
        />

        <Pressable onPress={openRest} hitSlop={4} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="timer-outline" size={16} color={t.colors.primary} />
          <Text variant="label" color={t.colors.primary}>
            Rest Timer: {formatRest(item.restSeconds, p.defaultRestSeconds)}
          </Text>
        </Pressable>

        <View style={{ gap: t.spacing(1.5) }}>
          <Row gap={2}>
            <Text variant="caption" muted weight="700" style={{ width: 34, textAlign: 'center' }}>
              SET
            </Text>
            {cols.map((c) => (
              <Text key={c.key} variant="caption" muted weight="700" style={{ flex: 1, textAlign: 'center' }}>
                {c.label}
              </Text>
            ))}
            <View style={{ width: 30 }} />
          </Row>
          {item.sets.map((s, i) => (
            <Row key={s.id} gap={2}>
              <View style={{ width: 34, alignItems: 'center' }}>
                <SetTypeBadge
                  setType={s.setType}
                  index={numbers[i]}
                  onPress={() => {
                    void Haptics.selectionAsync().catch(() => {});
                    updateSet(s.id, { setType: nextSetType(s.setType) });
                  }}
                  onLongPress={() =>
                    p.showSheet({
                      title: 'Set Type',
                      options: setTypeSheetOptions(
                        s.setType,
                        (st) => updateSet(s.id, { setType: st }),
                        () => removeSet(s.id),
                      ),
                    })
                  }
                />
              </View>
              {cols.map((c) => (
                <NumberCell
                  key={c.key}
                  value={s[c.key]}
                  format={c.format}
                  parse={c.parse}
                  placeholder={c.placeholder}
                  keyboardType={c.keyboardType}
                  accessibilityLabel={`Set ${i + 1} ${c.label}`}
                  onChange={(v) => updateSet(s.id, { [c.key]: v })}
                />
              ))}
              <IconButton
                icon="close"
                size={18}
                color={t.colors.textFaint}
                accessibilityLabel={`Remove set ${i + 1}`}
                onPress={() => removeSet(s.id)}
                style={{ width: 30, alignItems: 'center' }}
              />
            </Row>
          ))}
        </View>

        <Pressable
          onPress={addSet}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: t.spacing(2),
            borderRadius: t.radius.md,
            backgroundColor: t.colors.surfaceAlt,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="add" size={18} color={t.colors.text} />
          <Text variant="label">Add Set</Text>
        </Pressable>
      </View>
    </View>
  );
});
