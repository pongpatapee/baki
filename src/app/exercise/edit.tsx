import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { OptionList } from '@/components/exercises/OptionList';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Spacer,
  Text,
  TextField,
} from '@/components/ui';
import {
  createCustomExercise,
  deleteExercise,
  exerciseByIdQuery,
  ExerciseValidationError,
  getExercise,
  mergeExercise,
  updateExercise,
  type ExerciseInput,
} from '@/db/repositories/exercises';
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  EXERCISE_TYPE_LABELS,
  EXERCISE_TYPES,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUPS,
  type ExerciseType,
  type MuscleGroup,
} from '@/domain/types';
import type { ExerciseRow } from '@/db/schema';
import { pickExercises } from '@/stores/exercisePicker';
import { useTheme } from '@/theme/AppProviders';

const TYPE_DESCRIPTIONS: Record<ExerciseType, string> = {
  weight_reps: 'Bench press, curls, rows',
  bodyweight_reps: 'Push ups, sit ups, burpees',
  weighted_bodyweight: 'Weighted pull ups and dips (added weight)',
  assisted_bodyweight: 'Assisted pull ups and dips (counterweight)',
  duration: 'Planks, wall sits, dead hangs',
  distance_duration: 'Running, cycling, rowing',
  weight_distance: "Farmer's walks, sled pushes",
};

const BLANK: ExerciseInput = {
  name: '',
  exerciseType: 'weight_reps',
  equipment: 'none',
  primaryMuscle: 'chest',
  secondaryMuscles: [],
  notes: null,
};

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function ExerciseEditScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : null;
  const { data: rows, updatedAt } = useLiveQuery(exerciseByIdQuery(id ?? ''), [id]);
  const live = id ? rows[0] : undefined;
  // Keep the first loaded row so the form stays mounted (and can navigate away) after a
  // delete or merge makes the live row disappear.
  const [loaded, setLoaded] = useState<ExerciseRow | undefined>(undefined);
  if (live && live.deletedAt == null && loaded?.id !== live.id) setLoaded(live);

  if (!id) {
    const prefill = typeof params.name === 'string' ? params.name : '';
    return <ExerciseForm key="new" id={null} existing={undefined} initial={{ ...BLANK, name: prefill }} />;
  }
  const existing = loaded?.id === id ? loaded : undefined;
  if (!existing) {
    if (updatedAt == null || (live && live.deletedAt == null)) return <Loading />;
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Exercise' }} />
        <EmptyState icon="alert-circle-outline" title="Exercise not found" message="It may have been deleted or merged." />
      </Screen>
    );
  }
  return (
    <ExerciseForm
      key={existing.id}
      id={existing.id}
      existing={existing}
      initial={{
        name: existing.name,
        exerciseType: existing.exerciseType,
        equipment: existing.equipment,
        primaryMuscle: existing.primaryMuscle,
        secondaryMuscles: existing.secondaryMuscles,
        notes: existing.notes,
      }}
    />
  );
}

function ExerciseForm({
  id,
  existing,
  initial,
}: {
  id: string | null;
  existing: ExerciseRow | undefined;
  initial: ExerciseInput;
}) {
  const t = useTheme();
  const [initialJson] = useState(() => JSON.stringify(initial));
  const [form, setFormState] = useState<ExerciseInput>(initial);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const setForm = (fn: (f: ExerciseInput) => ExerciseInput) => setFormState(fn);

  const dirty = JSON.stringify(form) !== initialJson;
  usePreventRemove(dirty && !finished, ({ repeat }) => {
    Alert.alert('Discard changes?', 'Your changes to this exercise will be lost.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: repeat },
    ]);
  });

  // Navigate only after `finished` has disabled the unsaved-changes guard.
  const [exitAction, setExitAction] = useState<'back' | 'library' | null>(null);
  useEffect(() => {
    if (!finished || !exitAction) return;
    if (exitAction === 'back') router.back();
    else router.dismissTo('/exercises');
  }, [finished, exitAction]);
  const exit = (action: 'back' | 'library') => {
    setFinished(true);
    setExitAction(action);
  };

  const isBuiltIn = existing != null && !existing.isCustom;
  const set = <K extends keyof ExerciseInput>(k: K, v: ExerciseInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const toggleSecondary = (m: MuscleGroup) =>
    setForm((f) => ({
      ...f,
      secondaryMuscles: f.secondaryMuscles.includes(m)
        ? f.secondaryMuscles.filter((x) => x !== m)
        : [...f.secondaryMuscles, m],
    }));

  const save = async () => {
    if (!isBuiltIn && !form.name.trim()) {
      setNameError('Give your exercise a name.');
      return;
    }
    setSaving(true);
    try {
      if (!id) await createCustomExercise(form);
      else if (isBuiltIn) await updateExercise(id, { notes: form.notes });
      else await updateExercise(id, form);
      exit('back');
    } catch (e) {
      if (e instanceof ExerciseValidationError && e.message.includes('already exists')) setNameError(e.message);
      else Alert.alert('Could not save exercise', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(
      `Delete "${existing.name}"?`,
      'It will be removed from the exercise library. Logged workouts keep their history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExercise(existing.id);
              exit('library');
            } catch (e) {
              Alert.alert('Could not delete exercise', errorMessage(e));
            }
          },
        },
      ],
    );
  };

  const startMerge = () => {
    if (!existing) return;
    pickExercises({ title: 'Merge Into…', excludeIds: [existing.id] }, ([targetId]) => {
      if (!targetId) return;
      void getExercise(targetId).then((target) => {
        if (!target) return;
        Alert.alert(
          `Merge into "${target.name}"?`,
          `All workout history and routine entries of "${existing.name}" will move to "${target.name}", and "${existing.name}" will be removed. This cannot be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Merge',
              style: 'destructive',
              onPress: async () => {
                try {
                  await mergeExercise(existing.id, target.id);
                  exit('library');
                } catch (e) {
                  Alert.alert('Could not merge exercises', errorMessage(e));
                }
              },
            },
          ],
        );
      });
    });
  };

  const typeOptions = useMemo(
    () => EXERCISE_TYPES.map((v) => ({ value: v, label: EXERCISE_TYPE_LABELS[v], description: TYPE_DESCRIPTIONS[v] })),
    [],
  );

  const title = !id ? 'New Exercise' : isBuiltIn ? 'Exercise Notes' : 'Edit Exercise';
  const header = (
    <Stack.Screen
      options={{
        title,
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

  return (
    <Screen scroll edges={['bottom']}>
      {header}
      {isBuiltIn ? (
        <Card>
          <Row justify="space-between">
            <Text variant="heading" style={{ flex: 1 }}>
              {form.name}
            </Text>
            <Badge label="Built-in" color={t.colors.textMuted} />
          </Row>
          <Spacer size={1} />
          <Text muted>
            {EXERCISE_TYPE_LABELS[form.exerciseType]} · {EQUIPMENT_LABELS[form.equipment]} ·{' '}
            {MUSCLE_GROUP_LABELS[form.primaryMuscle]}
          </Text>
          <Spacer size={2} />
          <Text variant="caption" faint>
            Built-in exercises can&apos;t be renamed or changed, but you can keep your own notes.
          </Text>
        </Card>
      ) : (
        <>
          <TextField
            label="Name"
            value={form.name}
            onChangeText={(v) => {
              setNameError(null);
              set('name', v);
            }}
            placeholder="e.g. Cable Y Raise"
            autoFocus={!id}
            autoCapitalize="words"
            returnKeyType="done"
            error={nameError}
          />

          <SectionHeader title="Exercise Type" />
          <OptionList options={typeOptions} value={form.exerciseType} onChange={(v) => set('exerciseType', v)} />
          {id ? (
            <Text variant="caption" faint style={{ marginTop: t.spacing(1.5) }}>
              Changing the type changes which fields are logged. Existing sets keep their values.
            </Text>
          ) : null}

          <SectionHeader title="Equipment" />
          <Row wrap gap={2}>
            {EQUIPMENT.map((e) => (
              <Chip
                key={e}
                label={EQUIPMENT_LABELS[e]}
                selected={form.equipment === e}
                onPress={() => set('equipment', e)}
              />
            ))}
          </Row>

          <SectionHeader title="Primary Muscle" />
          <Row wrap gap={2}>
            {MUSCLE_GROUPS.map((m) => (
              <Chip
                key={m}
                label={MUSCLE_GROUP_LABELS[m]}
                selected={form.primaryMuscle === m}
                onPress={() =>
                  setForm((f) => ({ ...f, primaryMuscle: m, secondaryMuscles: f.secondaryMuscles.filter((x) => x !== m) }))
                }
              />
            ))}
          </Row>

          <SectionHeader title="Secondary Muscles" />
          <Row wrap gap={2}>
            {MUSCLE_GROUPS.filter((m) => m !== form.primaryMuscle).map((m) => (
              <Chip
                key={m}
                label={MUSCLE_GROUP_LABELS[m]}
                selected={form.secondaryMuscles.includes(m)}
                color={t.colors.chart[1]}
                onPress={() => toggleSecondary(m)}
              />
            ))}
          </Row>
        </>
      )}

      <SectionHeader title="Notes" />
      <TextField
        value={form.notes ?? ''}
        onChangeText={(v) => set('notes', v)}
        placeholder="Setup cues, seat position, grip…"
        multiline
        style={{ minHeight: 88, textAlignVertical: 'top' }}
      />

      {existing?.isCustom ? (
        <>
          <SectionHeader title="Manage" />
          <Button title="Merge into another exercise…" icon="git-merge-outline" variant="secondary" onPress={startMerge} />
          <Spacer size={2} />
          <Button title="Delete Exercise" icon="trash-outline" variant="danger" onPress={confirmDelete} />
        </>
      ) : null}
    </Screen>
  );
}
