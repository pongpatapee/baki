import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ExerciseHistory } from '@/components/stats/ExerciseHistory';
import { ExerciseInfo } from '@/components/stats/ExerciseInfo';
import { ExerciseRecords } from '@/components/stats/ExerciseRecords';
import { ExerciseSummary } from '@/components/stats/ExerciseSummary';
import { useLiveData } from '@/components/stats/useLiveData';
import { Badge, EmptyState, IconButton, Loading, Row, Screen, Segmented, Text } from '@/components/ui';
import { recordProgressionQuery } from '@/db/repositories/personalRecords';
import { loadExercise, loadStatSets, STATS_TABLES } from '@/db/repositories/stats';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from '@/domain/types';
import { useSettings, useTheme } from '@/theme/AppProviders';

type Tab = 'summary' | 'history' | 'records' | 'info';

const TABS: { value: Tab; label: string }[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'history', label: 'History' },
  { value: 'records', label: 'Records' },
  { value: 'info', label: 'Info' },
];

export default function ExerciseDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = String(rawId ?? '');
  const t = useTheme();
  const settings = useSettings();
  const units = useMemo(
    () => ({ weightUnit: settings.weightUnit, distanceUnit: settings.distanceUnit }),
    [settings.weightUnit, settings.distanceUnit],
  );
  const [tab, setTab] = useState<Tab>('summary');

  const exercise = useLiveData(() => loadExercise(id), [id], ['exercises']);
  const sets = useLiveData(() => loadStatSets({ exerciseId: id }), [id], STATS_TABLES);
  const { data: records } = useLiveQuery(recordProgressionQuery(id), [id]);
  const prSetIds = useMemo(() => new Set((records ?? []).map((r) => r.workoutSetId)), [records]);

  const ex = exercise.data;
  if (exercise.loading && ex === undefined) return <Loading />;
  if (!ex) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Exercise' }} />
        <EmptyState icon="help-circle-outline" title="Exercise not found" message="It may have been deleted." />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom']}>
      <Stack.Screen
        options={{
          title: ex.name,
          headerRight: ex.isCustom
            ? () => (
                <IconButton
                  icon="create-outline"
                  accessibilityLabel="Edit exercise"
                  onPress={() => router.push({ pathname: '/exercise/edit', params: { id } })}
                />
              )
            : undefined,
        }}
      />
      <View style={{ marginBottom: t.spacing(4) }}>
        <Row gap={2} wrap>
          <Text muted>
            {MUSCLE_GROUP_LABELS[ex.primaryMuscle]} · {EQUIPMENT_LABELS[ex.equipment]}
          </Text>
          {ex.isCustom ? <Badge label="Custom" color={t.colors.textMuted} /> : null}
          {ex.deletedAt != null ? <Badge label="Deleted" color={t.colors.danger} /> : null}
        </Row>
      </View>
      <Segmented options={TABS} value={tab} onChange={setTab} />
      <View style={{ marginTop: t.spacing(4) }}>
        {sets.data === undefined ? (
          <Loading />
        ) : tab === 'summary' ? (
          <ExerciseSummary type={ex.exerciseType} sets={sets.data} records={records ?? []} units={units} />
        ) : tab === 'history' ? (
          <ExerciseHistory sets={sets.data} units={units} prSetIds={prSetIds} />
        ) : tab === 'records' ? (
          <ExerciseRecords type={ex.exerciseType} sets={sets.data} records={records ?? []} units={units} />
        ) : (
          <ExerciseInfo exercise={ex} />
        )}
      </View>
    </Screen>
  );
}
