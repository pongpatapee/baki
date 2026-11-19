/**
 * Edit a finished workout. Edits are written immediately (same functions as the live workout);
 * leaving the screen drops unchecked sets and recomputes PRs for the affected exercises.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, View } from 'react-native';

import { Button, EmptyState, Loading, Row, TextField } from '@/components/ui';
import { usePreviousSets, useWorkoutData } from '@/components/workout/useWorkoutData';
import { WorkoutEditor } from '@/components/workout/WorkoutEditor';
import { NotesField, TitleField } from '@/components/workout/WorkoutFields';
import { deleteWorkout, finalizeEditedWorkout, updateWorkout } from '@/db/repositories/workouts';
import type { WorkoutRow } from '@/db/schema';
import { formatHoursMinutes, formatLocalDateTime, parseHoursMinutes, parseLocalDateTime } from '@/domain/workout';
import { useTheme } from '@/theme/AppProviders';

export default function EditWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const data = useWorkoutData(id);
  const previous = usePreviousSets(
    id,
    data.exercises.map((e) => e.exerciseId),
  );
  const finalized = useRef(false);

  // Leaving by back gesture still finalizes (silently).
  useEffect(() => {
    return () => {
      if (!finalized.current && id) void finalizeEditedWorkout(id).catch(() => {});
    };
  }, [id]);

  const save = async () => {
    if (!id) return;
    Keyboard.dismiss();
    await new Promise((r) => setTimeout(r, 120));
    const res = await finalizeEditedWorkout(id);
    if (res.ok || res.reason === 'not_found') {
      finalized.current = true;
      router.back();
      return;
    }
    Alert.alert('No completed sets', 'Check off at least one set, or delete this workout.', [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Delete Workout',
        style: 'destructive',
        onPress: () => {
          finalized.current = true;
          router.dismissTo('/history');
          void deleteWorkout(id);
        },
      },
    ]);
  };

  const workout = data.workout;
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Edit Workout',
          headerRight: () => <Button title="Save" size="sm" onPress={save} />,
        }}
      />
      {!data.loaded ? (
        <Loading />
      ) : !workout ? (
        <View style={{ flex: 1, backgroundColor: t.colors.background }}>
          <EmptyState icon="alert-circle-outline" title="Workout not found" />
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: t.colors.background }}>
          <WorkoutEditor
            data={data}
            previousSets={previous}
            mode="edit"
            header={
              <View style={{ gap: t.spacing(3), paddingHorizontal: t.spacing(1), paddingBottom: t.spacing(1) }}>
                <TitleField workout={workout} />
                {/* Keyed so stored changes reset the text fields. */}
                <TimeFields key={`${workout.startedAt}-${workout.endedAt}`} workout={workout} />
                <NotesField workout={workout} />
              </View>
            }
          />
        </View>
      )}
    </>
  );
}

function TimeFields({ workout }: { workout: WorkoutRow }) {
  const t = useTheme();
  const durationS = Math.max(0, Math.round(((workout.endedAt ?? workout.startedAt) - workout.startedAt) / 1000));
  const [start, setStart] = useState(formatLocalDateTime(workout.startedAt));
  const [duration, setDuration] = useState(formatHoursMinutes(durationS));
  const [startError, setStartError] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);

  const commitStart = () => {
    const ts = parseLocalDateTime(start);
    if (ts == null) {
      setStartError('Use YYYY-MM-DD HH:MM');
      return;
    }
    setStartError(null);
    if (ts !== workout.startedAt) void updateWorkout(workout.id, { startedAt: ts, endedAt: ts + durationS * 1000 });
  };
  const commitDuration = () => {
    const s = parseHoursMinutes(duration);
    if (s == null || s <= 0) {
      setDurationError('Use h:mm');
      return;
    }
    setDurationError(null);
    if (s !== durationS) void updateWorkout(workout.id, { endedAt: workout.startedAt + s * 1000 });
  };

  return (
    <Row gap={3} align="flex-start">
      <TextField
        label="Start"
        value={start}
        onChangeText={setStart}
        onEndEditing={commitStart}
        error={startError}
        autoCorrect={false}
        keyboardType="numbers-and-punctuation"
        containerStyle={{ flex: 3 }}
      />
      <TextField
        label="Duration"
        value={duration}
        onChangeText={setDuration}
        onEndEditing={commitDuration}
        error={durationError}
        keyboardType="numbers-and-punctuation"
        containerStyle={{ flex: 2 }}
        style={{ fontVariant: ['tabular-nums'] }}
        placeholder="h:mm"
        placeholderTextColor={t.colors.textFaint}
      />
    </Row>
  );
}
