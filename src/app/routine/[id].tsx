import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { SetTypeBadge } from '@/components/SetTypeBadge';
import { useActionSheet } from '@/components/routines/ActionSheet';
import { describeTargets } from '@/components/routines/setColumns';
import { startRoutineSafely } from '@/components/routines/startRoutine';
import { Button, EmptyState, ExerciseAvatar, IconButton, Loading, Row, Screen, Spacer, Text } from '@/components/ui';
import {
  deleteRoutine,
  duplicateRoutine,
  getRoutineDetail,
  routineByIdQuery,
  type RoutineDetail,
} from '@/db/repositories/routines';
import { formatRest, isLinkedWithNext, supersetColorIndex, workingSetNumbers } from '@/domain/routineEdit';
import { useSettings, useTheme } from '@/theme/AppProviders';

export default function RoutineDetailScreen() {
  const t = useTheme();
  const settings = useSettings();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sheet = useActionSheet();
  const { data: rows } = useLiveQuery(routineByIdQuery(id), [id]);
  const version = rows[0]?.updatedAt;
  const [detail, setDetail] = useState<RoutineDetail | null | undefined>(undefined);

  // Reload whenever the routine row changes (every save bumps its updatedAt).
  useEffect(() => {
    let cancelled = false;
    void getRoutineDetail(id).then((d) => {
      if (!cancelled) setDetail(d);
    });
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  const colors = useMemo(() => supersetColorIndex(detail?.exercises ?? []), [detail]);

  const openMenu = () =>
    sheet.show({
      title: detail?.routine.name,
      options: [
        { label: 'Edit Routine', icon: 'create-outline', onPress: () => router.push({ pathname: '/routine/edit', params: { id } }) },
        {
          label: 'Duplicate',
          icon: 'copy-outline',
          onPress: async () => {
            const newId = await duplicateRoutine(id);
            if (newId) router.replace(`/routine/${newId}`);
          },
        },
        {
          label: 'Delete Routine',
          icon: 'trash-outline',
          destructive: true,
          onPress: () =>
            Alert.alert(`Delete "${detail?.routine.name}"?`, 'Workouts you logged from it are kept.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await deleteRoutine(id);
                  router.back();
                },
              },
            ]),
        },
      ],
    });

  const header = (
    <Stack.Screen
      options={{
        title: detail?.routine.name ?? 'Routine',
        headerRight: () =>
          detail ? (
            <Row gap={1}>
              <Pressable
                onPress={() => router.push({ pathname: '/routine/edit', params: { id } })}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text color={t.colors.primary} weight="600">
                  Edit
                </Text>
              </Pressable>
              <IconButton icon="ellipsis-horizontal" accessibilityLabel="Routine options" onPress={openMenu} />
            </Row>
          ) : null,
      }}
    />
  );

  if (detail === undefined) return <Loading />;
  if (detail === null) {
    return (
      <Screen>
        {header}
        <EmptyState icon="alert-circle-outline" title="Routine not found" message="It may have been deleted." />
      </Screen>
    );
  }

  const totalSets = detail.exercises.reduce((n, e) => n + e.sets.length, 0);

  return (
    <Screen scroll edges={['bottom']}>
      {header}
      <Text variant="title">{detail.routine.name}</Text>
      <Text muted style={{ marginTop: t.spacing(1) }}>
        {detail.exercises.length} {detail.exercises.length === 1 ? 'exercise' : 'exercises'} · {totalSets}{' '}
        {totalSets === 1 ? 'set' : 'sets'}
      </Text>
      {detail.routine.notes ? (
        <Text muted style={{ marginTop: t.spacing(2) }}>
          {detail.routine.notes}
        </Text>
      ) : null}
      <Spacer size={4} />
      <Button
        title="Start Routine"
        icon="play"
        size="lg"
        onPress={() => void startRoutineSafely(id)}
        disabled={detail.exercises.length === 0}
      />
      <Spacer size={5} />

      {detail.exercises.length === 0 ? (
        <EmptyState
          icon="barbell-outline"
          title="No exercises"
          message="Edit this routine to add exercises."
          action={<Button title="Edit Routine" variant="secondary" onPress={() => router.push({ pathname: '/routine/edit', params: { id } })} />}
        />
      ) : (
        detail.exercises.map((e, index) => {
          const color =
            e.supersetGroup != null ? t.colors.chart[(colors.get(e.supersetGroup) ?? 0) % t.colors.chart.length]! : null;
          const linked = isLinkedWithNext(detail.exercises, index);
          const numbers = workingSetNumbers(e.sets);
          return (
            <View key={e.id} style={{ marginBottom: linked ? 0 : t.spacing(3) }}>
              <View
                style={{
                  backgroundColor: t.colors.surface,
                  borderRadius: t.radius.lg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: t.colors.border,
                  padding: t.spacing(4),
                  overflow: 'hidden',
                  gap: t.spacing(2),
                }}
              >
                {color ? (
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: color }} />
                ) : null}
                <Pressable onPress={() => router.push(`/exercise/${e.exerciseId}`)}>
                  <Row gap={3}>
                    <ExerciseAvatar name={e.exercise.name} exerciseId={e.exerciseId} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text weight="600" color={t.colors.primary}>
                        {e.exercise.name}
                      </Text>
                      <Text variant="caption" muted>
                        {color ? 'Superset · ' : ''}Rest {formatRest(e.restSeconds, settings.defaultRestSeconds)}
                      </Text>
                    </View>
                  </Row>
                </Pressable>
                {e.notes ? <Text variant="label" muted weight="400">{e.notes}</Text> : null}
                {e.sets.map((s, i) => (
                  <Row key={s.id} gap={3}>
                    <SetTypeBadge setType={s.setType} index={numbers[i]} size={26} />
                    <Text>
                      {describeTargets(s, e.exercise.exerciseType, settings.weightUnit, settings.distanceUnit)}
                    </Text>
                  </Row>
                ))}
              </View>
              {linked ? (
                <View style={{ height: t.spacing(3), width: 4, backgroundColor: color ?? undefined }} />
              ) : null}
            </View>
          );
        })
      )}
      {sheet.element}
    </Screen>
  );
}
