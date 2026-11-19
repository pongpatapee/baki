/**
 * Live workout screen. The workout is the row with endedAt = null; everything is read with live
 * queries and every edit is written immediately, so the app can be killed and resumed safely.
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, Keyboard, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, EmptyState, IconButton, Loading, Text } from '@/components/ui';
import { KeepAwakeWhileWorkout } from '@/components/workout/KeepAwake';
import { REST_BAR_HEIGHT, RestTimerBar } from '@/components/workout/RestTimerBar';
import { usePreviousSets, useWorkoutData, useWorkoutTotals } from '@/components/workout/useWorkoutData';
import { WorkoutEditor } from '@/components/workout/WorkoutEditor';
import { NotesField, TitleField } from '@/components/workout/WorkoutFields';
import { WorkoutStats } from '@/components/workout/WorkoutStats';
import {
  activeWorkoutQuery,
  discardWorkout,
  finishWorkout,
  getRoutineUpdateCandidate,
  updateRoutineFromWorkout,
} from '@/db/repositories/workouts';
import type { WorkoutRow } from '@/db/schema';
import { useActiveWorkoutUi } from '@/stores/activeWorkout';
import { skipRestTimer, useRestTimer } from '@/stores/restTimer';
import { useSettings, useTheme } from '@/theme/AppProviders';

function confirm(title: string, message: string, ok: string, destructive = false): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Lets a focused input fire its end-editing commit before we read the database. */
async function flushInputs() {
  Keyboard.dismiss();
  await new Promise((r) => setTimeout(r, 120));
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function ActiveWorkoutScreen() {
  const t = useTheme();
  const active = useLiveQuery(activeWorkoutQuery());
  const leaving = useActiveWorkoutUi((s) => s.leaving);

  useEffect(() => {
    useActiveWorkoutUi.setState({ leaving: false });
  }, []);

  const workout = active.data[0] ?? null;

  if (active.updatedAt == null || (leaving && !workout)) return <Loading />;
  if (!workout) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
        <EmptyState
          title="No workout in progress"
          message="Start a workout from the Workout tab."
          action={<Button title="Close" variant="secondary" onPress={close} />}
        />
      </SafeAreaView>
    );
  }
  return <ActiveWorkout workout={workout} />;
}

function ActiveWorkout({ workout }: { workout: WorkoutRow }) {
  const t = useTheme();
  const settings = useSettings();
  const data = useWorkoutData(workout.id);
  const totals = useWorkoutTotals(data);
  const previous = usePreviousSets(
    workout.id,
    data.exercises.map((e) => e.exerciseId),
  );
  const restRunning = useRestTimer((s) => s.endAt != null);
  const busy = useRef(false);

  const finish = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await flushInputs();
      const completed = totals?.setCount ?? 0;
      const incomplete = totals?.incompleteSetCount ?? 0;
      if (completed === 0) {
        const discard = await confirm(
          'No completed sets',
          'Check off at least one set to finish, or discard this workout.',
          'Discard Workout',
          true,
        );
        if (discard) await doDiscard();
        return;
      }
      if (incomplete > 0) {
        const ok = await confirm(
          'Finish workout?',
          `${incomplete} unchecked ${incomplete === 1 ? 'set' : 'sets'} will be discarded.`,
          'Finish Anyway',
        );
        if (!ok) return;
      }
      useActiveWorkoutUi.setState({ leaving: true });
      const res = await finishWorkout(workout.id);
      if (!res.ok) {
        useActiveWorkoutUi.setState({ leaving: false });
        Alert.alert('Could not finish', 'Check off at least one set first.');
        return;
      }
      skipRestTimer();
      const candidate = await getRoutineUpdateCandidate(workout.id);
      if (candidate) {
        const update = await new Promise<boolean>((resolve) =>
          Alert.alert(
            `Update routine "${candidate.routineName}"?`,
            'Your workout differs from the routine. Save the exercises and sets you did to the routine?',
            [
              { text: 'Keep Original', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Update Routine', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          ),
        );
        if (update) await updateRoutineFromWorkout(workout.id);
      }
      router.replace(`/workout/summary/${workout.id}`);
    } catch (e) {
      useActiveWorkoutUi.setState({ leaving: false });
      Alert.alert('Could not finish', e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
    }
  };

  const doDiscard = async () => {
    useActiveWorkoutUi.setState({ leaving: true });
    skipRestTimer();
    close();
    await discardWorkout(workout.id);
  };

  const discard = async () => {
    const ok = await confirm('Discard workout?', 'This workout and all its sets will be deleted.', 'Discard', true);
    if (ok) await doDiscard();
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.colors.background }}>
      <KeepAwakeWhileWorkout />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: t.spacing(2),
          paddingVertical: t.spacing(1),
          gap: t.spacing(2),
          borderBottomWidth: 1,
          borderBottomColor: t.colors.border,
        }}
      >
        <IconButton icon="chevron-down" accessibilityLabel="Minimize workout" onPress={close} size={26} />
        <Text variant="heading" style={{ flex: 1 }}>
          Log Workout
        </Text>
        <Button title="Finish" variant="success" size="sm" onPress={finish} />
      </View>

      <WorkoutEditor
        data={data}
        previousSets={previous}
        mode="active"
        bottomInset={restRunning ? REST_BAR_HEIGHT : 0}
        header={
          <View style={{ gap: t.spacing(3), paddingHorizontal: t.spacing(1), paddingBottom: t.spacing(1) }}>
            <TitleField workout={workout} />
            {totals ? (
              <WorkoutStats
                durationS={totals.durationS}
                volumeKg={totals.volumeKg}
                setCount={totals.setCount}
                weightUnit={settings.weightUnit}
                live
                startedAt={workout.startedAt}
              />
            ) : null}
            <NotesField workout={workout} />
          </View>
        }
        footer={<Button title="Discard Workout" variant="danger" icon="trash-outline" onPress={discard} />}
      />
      <RestTimerBar />
    </SafeAreaView>
  );
}
