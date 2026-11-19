/** Post-workout summary: celebration, stats, PRs and the best set of each exercise. */
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { formatWorkoutDate } from '@/components/history/format';
import { ExerciseBestRow, PrList } from '@/components/history/WorkoutSections';
import { Button, Card, Divider, Loading, SafeArea, SectionHeader, Text } from '@/components/ui';
import { setsOf, useWorkoutData, useWorkoutPrs, useWorkoutTotals } from '@/components/workout/useWorkoutData';
import { WorkoutStats } from '@/components/workout/WorkoutStats';
import { countFinishedWorkouts } from '@/db/repositories/workouts';
import { useSettings, useTheme } from '@/theme/AppProviders';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

function done() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

export default function WorkoutSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const settings = useSettings();
  const data = useWorkoutData(id);
  const totals = useWorkoutTotals(data);
  const prs = useWorkoutPrs(id);
  const [nth, setNth] = useState<number | null>(null);

  useEffect(() => {
    countFinishedWorkouts()
      .then(setNth)
      .catch(() => {});
  }, []);

  if (!data.loaded) return <Loading />;
  const { workout } = data;

  return (
    <SafeArea edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.colors.background }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing(4), gap: t.spacing(3), paddingBottom: t.spacing(8) }}>
        <View style={{ alignItems: 'center', gap: t.spacing(2), paddingVertical: t.spacing(6) }}>
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: t.colors.warning + '26',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="trophy" size={44} color={t.colors.warning} />
          </View>
          <Text variant="display" align="center">
            Workout complete
          </Text>
          {nth != null && nth > 0 ? (
            <Text muted align="center">
              Nice work! That&apos;s your {ordinal(nth)} workout.
            </Text>
          ) : null}
        </View>

        {!workout ? (
          <Text muted align="center">
            This workout was deleted.
          </Text>
        ) : (
          <>
            <Card style={{ gap: t.spacing(3) }}>
              <View style={{ gap: 2 }}>
                <Text variant="heading">{workout.title}</Text>
                <Text variant="label" muted weight="400">
                  {formatWorkoutDate(workout.startedAt)}
                </Text>
              </View>
              <Divider />
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

            {prs.length > 0 ? (
              <>
                <SectionHeader title={`Personal records (${prs.length})`} />
                <PrList
                  prs={prs}
                  exercises={data.exercises}
                  weightUnit={settings.weightUnit}
                  distanceUnit={settings.distanceUnit}
                />
              </>
            ) : null}

            <SectionHeader title="Exercises" />
            <Card style={{ paddingVertical: t.spacing(2) }}>
              {data.exercises.map((e, i) => (
                <View key={e.id}>
                  {i > 0 ? <Divider /> : null}
                  <ExerciseBestRow
                    exercise={e}
                    sets={setsOf(data, e.id)}
                    prCount={prs.filter((p) => p.exerciseId === e.exerciseId).length}
                    weightUnit={settings.weightUnit}
                    distanceUnit={settings.distanceUnit}
                  />
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: t.spacing(4), paddingBottom: t.spacing(2) }}>
        <Button title="Done" size="lg" onPress={done} />
      </View>
    </SafeArea>
  );
}
