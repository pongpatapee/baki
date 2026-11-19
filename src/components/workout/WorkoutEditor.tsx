/**
 * The exercise/set editor shared by the live workout ("active") and editing a finished workout
 * ("edit"). All edits are written to SQLite immediately; data comes back through live queries.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { setTypeColor } from '@/components/SetTypeBadge';
import { Button, IconButton, Text } from '@/components/ui';
import {
  addExercisesToWorkout,
  addSet,
  removeFromSuperset,
  removeSet,
  removeWorkoutExercise,
  reorderWorkoutExercises,
  replaceWorkoutExercise,
  setSetCompleted,
  supersetWith,
  updateSet,
  updateWorkoutExercise,
} from '@/db/repositories/workouts';
import type { WorkoutSetRow } from '@/db/schema';
import { SET_TYPE_LABELS, SET_TYPES } from '@/domain/types';
import { formatRest, REST_PRESETS } from '@/domain/workout';
import { startRestTimer } from '@/stores/restTimer';
import { pickExercises } from '@/stores/exercisePicker';
import { useSettings, useTheme } from '@/theme/AppProviders';

import { ActionSheet, type SheetOption } from './ActionSheet';
import { ExerciseCard } from './ExerciseCard';
import { type SetValuesPatch } from './SetRow';
import { setsOf, type WorkoutData } from './useWorkoutData';

const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

function reportError(e: unknown) {
  Alert.alert('Something went wrong', e instanceof Error ? e.message : String(e));
}

export function WorkoutEditor({
  data,
  previousSets,
  mode,
  header,
  footer,
  bottomInset = 0,
}: {
  data: WorkoutData;
  previousSets: Map<string, WorkoutSetRow[]>;
  mode: 'active' | 'edit';
  header?: ReactNode;
  footer?: ReactNode;
  /** Extra scroll padding (e.g. for the rest timer bar). */
  bottomInset?: number;
}) {
  const t = useTheme();
  const settings = useSettings();
  const workoutId = data.workout?.id ?? null;
  const { exercises } = data;

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [restFor, setRestFor] = useState<string | null>(null);
  const [supersetFor, setSupersetFor] = useState<string | null>(null);
  const [setOptionsFor, setSetOptionsFor] = useState<string | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);

  // Refs so the memoized row callbacks stay stable across data refreshes.
  const dataRef = useRef(data);
  const restRef = useRef({ mode, defaultRest: settings.defaultRestSeconds });
  useLayoutEffect(() => {
    dataRef.current = data;
    restRef.current = { mode, defaultRest: settings.defaultRestSeconds };
  }, [data, mode, settings.defaultRestSeconds]);

  const supersetColors = useMemo(() => {
    const palette = t.colors.chart.slice(1);
    const map = new Map<string, string>();
    for (const e of exercises) {
      if (e.supersetGroup && !map.has(e.supersetGroup)) {
        map.set(e.supersetGroup, palette[map.size % palette.length]!);
      }
    }
    return map;
  }, [exercises, t.colors.chart]);

  const onToggleComplete = useCallback((set: WorkoutSetRow, completed: boolean, values: SetValuesPatch) => {
    setSetCompleted(set.id, completed, values).catch(reportError);
    if (!completed) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (restRef.current.mode !== 'active') return;
    const we = dataRef.current.exercises.find((e) => e.id === set.workoutExerciseId);
    const seconds = we?.restSeconds ?? restRef.current.defaultRest;
    startRestTimer(seconds, set.workoutExerciseId);
  }, []);

  const onChangeValues = useCallback((setId: string, values: Partial<SetValuesPatch>) => {
    updateSet(setId, values).catch(reportError);
  }, []);

  const onRemoveSet = useCallback((setId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    removeSet(setId).catch(reportError);
  }, []);

  const onAddSet = useCallback((weId: string) => {
    void Haptics.selectionAsync().catch(() => {});
    addSet(weId).catch(reportError);
  }, []);

  const onChangeNotes = useCallback((weId: string, notes: string | null) => {
    updateWorkoutExercise(weId, { notes }).catch(reportError);
  }, []);

  const onOpenMenu = useCallback((id: string) => setMenuFor(id), []);
  const onOpenRest = useCallback((id: string) => setRestFor(id), []);
  const onOpenSetOptions = useCallback((id: string) => setSetOptionsFor(id), []);

  const addExercises = () => {
    if (!workoutId) return;
    pickExercises({ multiple: true, title: 'Add Exercises' }, (ids) => {
      addExercisesToWorkout(workoutId, ids).catch(reportError);
    });
  };

  // ----- sheets -----

  const menuExercise = exercises.find((e) => e.id === menuFor) ?? null;
  const menuOptions: SheetOption[] = menuExercise
    ? [
        {
          key: 'reorder',
          label: 'Reorder Exercises',
          icon: 'swap-vertical',
          onPress: () => setReorderOpen(true),
        },
        {
          key: 'replace',
          label: 'Replace Exercise',
          icon: 'repeat',
          onPress: () =>
            pickExercises({ multiple: false, title: 'Replace Exercise', excludeIds: [menuExercise.exerciseId] }, (ids) => {
              const id = ids[0];
              if (id) replaceWorkoutExercise(menuExercise.id, id).catch(reportError);
            }),
        },
        ...(exercises.length > 1
          ? [
              {
                key: 'superset',
                label: menuExercise.supersetGroup ? 'Change Superset' : 'Add to Superset',
                icon: 'link' as const,
                onPress: () => setSupersetFor(menuExercise.id),
              },
            ]
          : []),
        ...(menuExercise.supersetGroup
          ? [
              {
                key: 'unsuperset',
                label: 'Remove from Superset',
                icon: 'unlink' as const,
                onPress: () => removeFromSuperset(menuExercise.id).catch(reportError),
              },
            ]
          : []),
        ...(mode === 'active'
          ? [
              {
                key: 'rest',
                label: `Rest Timer (${formatRest(menuExercise.restSeconds ?? settings.defaultRestSeconds)})`,
                icon: 'timer-outline' as const,
                onPress: () => setRestFor(menuExercise.id),
              },
            ]
          : []),
        {
          key: 'remove',
          label: 'Remove Exercise',
          icon: 'trash-outline',
          destructive: true,
          onPress: () =>
            Alert.alert('Remove exercise?', `${menuExercise.exerciseName} and its sets will be removed.`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => removeWorkoutExercise(menuExercise.id).catch(reportError),
              },
            ]),
        },
      ]
    : [];

  const restExercise = exercises.find((e) => e.id === restFor) ?? null;
  const restOptions: SheetOption[] = restExercise
    ? [
        {
          key: 'default',
          label: `Default (${formatRest(settings.defaultRestSeconds)})`,
          selected: restExercise.restSeconds == null,
          onPress: () => updateWorkoutExercise(restExercise.id, { restSeconds: null }).catch(reportError),
        },
        {
          key: 'off',
          label: 'Off',
          selected: restExercise.restSeconds === 0,
          onPress: () => updateWorkoutExercise(restExercise.id, { restSeconds: 0 }).catch(reportError),
        },
        ...REST_PRESETS.map((s) => ({
          key: String(s),
          label: formatRest(s),
          selected: restExercise.restSeconds === s,
          onPress: () => updateWorkoutExercise(restExercise.id, { restSeconds: s }).catch(reportError),
        })),
      ]
    : [];

  const supersetExercise = exercises.find((e) => e.id === supersetFor) ?? null;
  const supersetOptions: SheetOption[] = supersetExercise
    ? exercises
        .filter((e) => e.id !== supersetExercise.id)
        .map((e) => ({
          key: e.id,
          label: e.exerciseName,
          icon: 'barbell-outline' as const,
          color: e.supersetGroup ? supersetColors.get(e.supersetGroup) : undefined,
          selected: !!e.supersetGroup && e.supersetGroup === supersetExercise.supersetGroup,
          onPress: () => supersetWith(supersetExercise.id, e.id).catch(reportError),
        }))
    : [];

  const optionsSet = setOptionsFor
    ? (exercises.flatMap((e) => setsOf(data, e.id)).find((s) => s.id === setOptionsFor) ?? null)
    : null;
  const setTypeOptions: SheetOption[] = optionsSet
    ? [
        ...SET_TYPES.map((st) => ({
          key: st,
          label: SET_TYPE_LABELS[st],
          color: st === 'normal' ? undefined : setTypeColor(t, st),
          selected: optionsSet.setType === st,
          onPress: () => updateSet(optionsSet.id, { setType: st }).catch(reportError),
        })),
        {
          key: 'remove',
          label: 'Remove Set',
          icon: 'trash-outline' as const,
          destructive: true,
          onPress: () => removeSet(optionsSet.id).catch(reportError),
        },
      ]
    : [];

  const moveExercise = (index: number, delta: number) => {
    if (!workoutId) return;
    const ids = exercises.map((e) => e.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    void Haptics.selectionAsync().catch(() => {});
    reorderWorkoutExercises(workoutId, ids).catch(reportError);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ padding: t.spacing(3), gap: t.spacing(3), paddingBottom: t.spacing(10) + bottomInset }}
      >
        {header}
        {exercises.map((e) => (
          <ExerciseCard
            key={e.id}
            exercise={e}
            sets={setsOf(data, e.id)}
            previousSets={previousSets.get(e.exerciseId)}
            supersetColor={e.supersetGroup ? (supersetColors.get(e.supersetGroup) ?? null) : null}
            mode={mode}
            weightUnit={settings.weightUnit}
            distanceUnit={settings.distanceUnit}
            defaultRestSeconds={settings.defaultRestSeconds}
            onOpenMenu={onOpenMenu}
            onOpenRest={onOpenRest}
            onAddSet={onAddSet}
            onChangeNotes={onChangeNotes}
            onOpenSetOptions={onOpenSetOptions}
            onToggleComplete={onToggleComplete}
            onChangeValues={onChangeValues}
            onRemoveSet={onRemoveSet}
          />
        ))}
        {exercises.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: t.spacing(8), gap: t.spacing(2) }}>
            <Ionicons name="barbell-outline" size={40} color={t.colors.textFaint} />
            <Text variant="heading">Get started</Text>
            <Text muted align="center">
              Add an exercise to start your workout
            </Text>
          </View>
        ) : null}
        <Button title="Add Exercises" icon="add" onPress={addExercises} />
        {footer}
      </ScrollView>

      <ActionSheet
        visible={!!menuExercise}
        title={menuExercise?.exerciseName}
        options={menuOptions}
        onClose={() => setMenuFor(null)}
      />
      <ActionSheet
        visible={!!restExercise}
        title="Rest Timer"
        subtitle={restExercise?.exerciseName}
        options={restOptions}
        onClose={() => setRestFor(null)}
      />
      <ActionSheet
        visible={!!supersetExercise}
        title="Superset with…"
        subtitle={supersetExercise?.exerciseName}
        options={supersetOptions}
        onClose={() => setSupersetFor(null)}
      />
      <ActionSheet
        visible={!!optionsSet}
        title="Set Type"
        options={setTypeOptions}
        onClose={() => setSetOptionsFor(null)}
      >
        {optionsSet ? (
          <View style={{ paddingHorizontal: t.spacing(5), paddingBottom: t.spacing(2), gap: t.spacing(2) }}>
            <Text variant="label" muted>
              RPE
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing(2) }}>
              {[null, ...RPE_VALUES].map((v) => {
                const active = optionsSet.rpe === v;
                return (
                  <Pressable
                    key={String(v)}
                    onPress={() => updateSet(optionsSet.id, { rpe: v }).catch(reportError)}
                    style={{
                      minWidth: 40,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: t.radius.pill,
                      alignItems: 'center',
                      backgroundColor: active ? t.colors.primary : t.colors.surfaceAlt,
                    }}
                  >
                    <Text variant="label" color={active ? t.colors.onPrimary : t.colors.text}>
                      {v == null ? '–' : String(v)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </ActionSheet>
      <ActionSheet visible={reorderOpen} title="Reorder Exercises" onClose={() => setReorderOpen(false)}>
        {exercises.map((e, i) => (
          <View
            key={e.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: t.spacing(5),
              paddingVertical: t.spacing(1.5),
              gap: t.spacing(2),
            }}
          >
            {e.supersetGroup ? (
              <View
                style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: supersetColors.get(e.supersetGroup) }}
              />
            ) : null}
            <Text style={{ flex: 1 }} numberOfLines={1} weight="500">
              {e.exerciseName}
            </Text>
            <IconButton icon="chevron-up" accessibilityLabel="Move up" disabled={i === 0} onPress={() => moveExercise(i, -1)} />
            <IconButton
              icon="chevron-down"
              accessibilityLabel="Move down"
              disabled={i === exercises.length - 1}
              onPress={() => moveExercise(i, 1)}
            />
          </View>
        ))}
        <View style={{ padding: t.spacing(4) }}>
          <Button title="Done" variant="secondary" onPress={() => setReorderOpen(false)} />
        </View>
      </ActionSheet>
    </KeyboardAvoidingView>
  );
}
