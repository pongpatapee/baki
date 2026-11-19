/** Finished workout detail: stats, exercises with all sets, PR badges; menu with edit/repeat/delete. */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { formatWorkoutDate } from '@/components/history/format';
import { ExerciseSetList } from '@/components/history/WorkoutSections';
import { usePrompt } from '@/components/routines/PromptModal';
import { Card, Divider, EmptyState, IconButton, Loading, Text } from '@/components/ui';
import { ActionSheet, type SheetOption } from '@/components/workout/ActionSheet';
import { setsOf, useWorkoutData, useWorkoutPrs, useWorkoutTotals } from '@/components/workout/useWorkoutData';
import { WorkoutStats } from '@/components/workout/WorkoutStats';
import { deleteWorkout, saveWorkoutAsRoutine } from '@/db/repositories/workouts';
import { startWorkout } from '@/stores/activeWorkout';
import { useSettings, useTheme } from '@/theme/AppProviders';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const settings = useSettings();
  const data = useWorkoutData(id);
  const totals = useWorkoutTotals(data);
  const prs = useWorkoutPrs(id);
  const prompt = usePrompt();
  const [menuOpen, setMenuOpen] = useState(false);

  const supersetColors = useMemo(() => {
    const palette = t.colors.chart.slice(1);
    const map = new Map<string, string>();
    for (const e of data.exercises) {
      if (e.supersetGroup && !map.has(e.supersetGroup)) map.set(e.supersetGroup, palette[map.size % palette.length]!);
    }
    return map;
  }, [data.exercises, t.colors.chart]);

  const workout = data.workout;

  const options: SheetOption[] = workout
    ? [
        {
          key: 'edit',
          label: 'Edit Workout',
          icon: 'create-outline',
          onPress: () => router.push(`/history/edit/${workout.id}`),
        },
        {
          key: 'routine',
          label: 'Save as Routine',
          icon: 'bookmark-outline',
          onPress: () =>
            prompt.show({
              title: 'Save as Routine',
              initialValue: workout.title,
              placeholder: 'Routine name',
              confirmLabel: 'Save',
              onSubmit: (name) => {
                saveWorkoutAsRoutine(workout.id, name)
                  .then(() => Alert.alert('Routine saved', `"${name}" was added to your routines.`))
                  .catch((e: unknown) => Alert.alert('Could not save routine', String(e)));
              },
            }),
        },
        {
          key: 'repeat',
          label: 'Repeat Workout',
          icon: 'refresh',
          onPress: () => void startWorkout({ fromWorkoutId: workout.id }),
        },
        {
          key: 'delete',
          label: 'Delete Workout',
          icon: 'trash-outline',
          destructive: true,
          onPress: () =>
            Alert.alert('Delete workout?', 'This workout will be removed from your history.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  router.back();
                  deleteWorkout(workout.id).catch((e: unknown) => Alert.alert('Could not delete', String(e)));
                },
              },
            ]),
        },
      ]
    : [];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Workout',
          headerRight: () =>
            workout ? (
              <IconButton icon="ellipsis-horizontal" accessibilityLabel="Workout options" onPress={() => setMenuOpen(true)} />
            ) : null,
        }}
      />
      {!data.loaded ? (
        <Loading />
      ) : !workout ? (
        <View style={{ flex: 1, backgroundColor: t.colors.background }}>
          <EmptyState icon="alert-circle-outline" title="Workout not found" message="It may have been deleted." />
        </View>
      ) : (
        <ScrollView
          style={{ backgroundColor: t.colors.background }}
          contentContainerStyle={{ padding: t.spacing(4), gap: t.spacing(3), paddingBottom: t.spacing(12) }}
        >
          <View style={{ gap: 4 }}>
            <Text variant="title">{workout.title}</Text>
            <Text variant="label" muted weight="400">
              {formatWorkoutDate(workout.startedAt)}
            </Text>
          </View>
          {workout.notes ? <Text>{workout.notes}</Text> : null}
          <Card style={{ gap: t.spacing(3) }}>
            {totals ? (
              <WorkoutStats
                durationS={totals.durationS}
                volumeKg={totals.volumeKg}
                setCount={totals.setCount}
                prCount={prs.length}
                weightUnit={settings.weightUnit}
              />
            ) : null}
          </Card>
          <Divider style={{ marginVertical: t.spacing(1) }} />
          {data.exercises.map((e) => (
            <ExerciseSetList
              key={e.id}
              exercise={e}
              sets={setsOf(data, e.id)}
              prs={prs.filter((p) => p.exerciseId === e.exerciseId)}
              weightUnit={settings.weightUnit}
              distanceUnit={settings.distanceUnit}
              supersetColor={e.supersetGroup ? supersetColors.get(e.supersetGroup) : null}
            />
          ))}
        </ScrollView>
      )}
      <ActionSheet visible={menuOpen} title={workout?.title} options={options} onClose={() => setMenuOpen(false)} />
      {prompt.element}
    </>
  );
}
