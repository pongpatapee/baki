import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActionSheet } from '@/components/routines/ActionSheet';
import { RoutineExerciseEditor } from '@/components/routines/RoutineExerciseEditor';
import { Button, EmptyState, Loading, Text, TextField } from '@/components/ui';
import { getExercisesByIds } from '@/db/repositories/exercises';
import { detailToDraft, getRoutineDetail, saveRoutine } from '@/db/repositories/routines';
import { newId } from '@/db/ids';
import type { ExerciseRow } from '@/db/schema';
import {
  defaultSets,
  draftsEqual,
  isLinkedWithNext,
  linkWithNext,
  moveItem,
  normalizeSupersets,
  removeFromSuperset,
  supersetColorIndex,
  type DraftExercise,
  type RoutineDraft,
} from '@/domain/routineEdit';
import { pickExercises } from '@/stores/exercisePicker';
import { useSettings, useTheme } from '@/theme/AppProviders';

interface Loaded {
  draft: RoutineDraft;
  info: Map<string, ExerciseRow>;
}

export default function RoutineEditScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ id?: string; folderId?: string }>();
  const routineId = typeof params.id === 'string' && params.id ? params.id : null;
  const folderId = typeof params.folderId === 'string' && params.folderId ? params.folderId : null;
  const [loaded, setLoaded] = useState<Loaded | 'missing' | null>(() =>
    routineId ? null : { draft: { id: newId(), folderId, name: '', notes: null, exercises: [] }, info: new Map() },
  );

  useEffect(() => {
    if (!routineId) return;
    let cancelled = false;
    void getRoutineDetail(routineId).then((detail) => {
      if (cancelled) return;
      setLoaded(
        detail
          ? { draft: detailToDraft(detail), info: new Map(detail.exercises.map((e) => [e.exerciseId, e.exercise])) }
          : 'missing',
      );
    });
    return () => {
      cancelled = true;
    };
  }, [routineId]);

  if (loaded === 'missing') {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen
          options={{
            title: 'Edit Routine',
            headerLeft: () => (
              <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
                <Text color={t.colors.primary}>Close</Text>
              </Pressable>
            ),
          }}
        />
        <EmptyState icon="alert-circle-outline" title="Routine not found" message="It may have been deleted." />
      </View>
    );
  }
  if (!loaded) return <Loading />;
  return <RoutineEditor key={loaded.draft.id} isNew={!routineId} initial={loaded.draft} initialInfo={loaded.info} />;
}

function RoutineEditor({
  isNew,
  initial,
  initialInfo,
}: {
  isNew: boolean;
  initial: RoutineDraft;
  initialInfo: Map<string, ExerciseRow>;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const sheet = useActionSheet();

  const [draft, setDraft] = useState<RoutineDraft>(initial);
  const [exerciseInfo, setExerciseInfo] = useState<Map<string, ExerciseRow>>(initialInfo);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);

  const dirty = !draftsEqual(draft, initial);
  usePreventRemove(dirty && !finished, ({ repeat }) => {
    Alert.alert('Discard changes?', 'You have unsaved changes to this routine.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ]);
  });
  useEffect(() => {
    if (finished) router.back();
  }, [finished]);

  // ---------- Mutations (stable callbacks so exercise cards can be memoized) ----------

  const updateExercises = useCallback((fn: (list: DraftExercise[]) => DraftExercise[]) => {
    setDraft((d) => ({ ...d, exercises: fn(d.exercises) }));
  }, []);

  const onChange = useCallback(
    (id: string, fn: (e: DraftExercise) => DraftExercise) =>
      updateExercises((list) => list.map((e) => (e.id === id ? fn(e) : e))),
    [updateExercises],
  );
  const onMove = useCallback(
    (index: number, delta: -1 | 1) =>
      updateExercises((list) => normalizeSupersets(moveItem(list, index, index + delta), newId)),
    [updateExercises],
  );
  const onLinkNext = useCallback(
    (index: number) => updateExercises((list) => linkWithNext(list, index, newId)),
    [updateExercises],
  );
  const onUnlink = useCallback(
    (index: number) => updateExercises((list) => removeFromSuperset(list, index, newId)),
    [updateExercises],
  );
  const onRemove = useCallback(
    (index: number) => updateExercises((list) => normalizeSupersets(list.filter((_, i) => i !== index), newId)),
    [updateExercises],
  );

  const rememberExercises = useCallback((rows: ExerciseRow[]) => {
    setExerciseInfo((m) => {
      const next = new Map(m);
      for (const r of rows) next.set(r.id, r);
      return next;
    });
  }, []);

  const onReplace = useCallback(
    (index: number) => {
      pickExercises({ title: 'Replace Exercise' }, ([id]) => {
        if (!id) return;
        void getExercisesByIds([id]).then((rows) => {
          rememberExercises(rows);
          updateExercises((list) => list.map((e, i) => (i === index ? { ...e, exerciseId: id } : e)));
        });
      });
    },
    [rememberExercises, updateExercises],
  );

  const addExercises = () => {
    pickExercises({ multiple: true, title: 'Add Exercises' }, (ids) => {
      void getExercisesByIds(ids).then((rows) => {
        rememberExercises(rows);
        const byId = new Map(rows.map((r) => [r.id, r]));
        const added: DraftExercise[] = ids.flatMap((exerciseId) => {
          const ex = byId.get(exerciseId);
          if (!ex) return [];
          return [
            {
              id: newId(),
              exerciseId,
              supersetGroup: null,
              restSeconds: null,
              notes: null,
              sets: defaultSets(newId, ex.exerciseType),
            },
          ];
        });
        updateExercises((list) => [...list, ...added]);
      });
    });
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setNameError('Give your routine a name.');
      return;
    }
    setSaving(true);
    try {
      await saveRoutine({ ...draft, exercises: normalizeSupersets(draft.exercises, newId) });
      setFinished(true);
    } catch (e) {
      Alert.alert('Could not save routine', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const colors = useMemo(() => supersetColorIndex(draft.exercises), [draft.exercises]);

  const header = (
    <Stack.Screen
      options={{
        title: isNew ? 'New Routine' : 'Edit Routine',
        headerLeft: () => (
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
            <Text color={t.colors.primary}>Cancel</Text>
          </Pressable>
        ),
        headerRight: () => (
          <Pressable onPress={save} disabled={saving} hitSlop={8} accessibilityRole="button">
            <Text color={t.colors.primary} weight="700" style={{ opacity: saving ? 0.5 : 1 }}>
              Save
            </Text>
          </Pressable>
        ),
      }}
    />
  );

  const list = draft.exercises;
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: t.spacing(4), paddingBottom: insets.bottom + t.spacing(12), gap: t.spacing(3) }}
      >
        <TextField
          value={draft.name}
          onChangeText={(name) => {
            setNameError(null);
            setDraft((d) => ({ ...d, name }));
          }}
          placeholder="Routine title"
          autoFocus={isNew}
          autoCapitalize="words"
          returnKeyType="done"
          error={nameError}
          style={{ fontSize: t.font.size.xl, fontWeight: t.font.weight.semibold }}
        />
        <TextField
          value={draft.notes ?? ''}
          onChangeText={(notes) => setDraft((d) => ({ ...d, notes }))}
          placeholder="Notes (optional)"
          multiline
          style={{ minHeight: 44, textAlignVertical: 'top' }}
        />

        {list.length === 0 ? (
          <EmptyState
            icon="barbell-outline"
            title="No exercises yet"
            message="Add exercises to build your routine."
          />
        ) : (
          <View>
            {list.map((item, index) => {
              const group = item.supersetGroup;
              const color = group != null ? t.colors.chart[(colors.get(group) ?? 0) % t.colors.chart.length]! : null;
              const linked = isLinkedWithNext(list, index);
              return (
                <View key={item.id}>
                  <RoutineExerciseEditor
                    item={item}
                    exercise={exerciseInfo.get(item.exerciseId)}
                    index={index}
                    count={list.length}
                    supersetColor={color}
                    linkedWithNext={linked}
                    weightUnit={settings.weightUnit}
                    distanceUnit={settings.distanceUnit}
                    defaultRestSeconds={settings.defaultRestSeconds}
                    newId={newId}
                    showSheet={sheet.show}
                    onChange={onChange}
                    onMove={onMove}
                    onLinkNext={onLinkNext}
                    onUnlink={onUnlink}
                    onReplace={onReplace}
                    onRemove={onRemove}
                  />
                  {index < list.length - 1 ? (
                    linked ? (
                      <View style={{ alignItems: 'center', height: t.spacing(5), justifyContent: 'center' }}>
                        <View style={{ position: 'absolute', top: 0, bottom: 0, width: 4, left: 0, backgroundColor: color ?? undefined }} />
                        <Ionicons name="link" size={16} color={color ?? t.colors.textMuted} />
                      </View>
                    ) : (
                      <View style={{ height: t.spacing(3) }} />
                    )
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        <Button title="Add Exercises" icon="add" size="lg" onPress={addExercises} />
      </ScrollView>
      {sheet.element}
    </View>
  );
}
