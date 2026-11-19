/**
 * Shared pieces of the summary and workout detail screens: PR list and per-exercise set lists.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { SetTypeBadge, workingSetNumbers } from '@/components/SetTypeBadge';
import { Badge, Card, Divider, ExerciseAvatar, Row, Text } from '@/components/ui';
import type { WorkoutExerciseWithInfo } from '@/db/repositories/workouts';
import type { PersonalRecordRow, WorkoutSetRow } from '@/db/schema';
import { PR_KIND_LABELS, type DistanceUnit, type WeightUnit } from '@/domain/types';
import { formatWeight } from '@/domain/units';
import { bestSet, formatSetCompact, setColumns, setE1rm } from '@/domain/workout';
import { useTheme } from '@/theme/AppProviders';

import { formatPrValue } from './format';

const COLUMN_TITLES = { weight: 'WEIGHT', reps: 'REPS', distance: 'DISTANCE', duration: 'TIME' } as const;

export function PrList({
  prs,
  exercises,
  weightUnit,
  distanceUnit,
}: {
  prs: PersonalRecordRow[];
  exercises: WorkoutExerciseWithInfo[];
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}) {
  const t = useTheme();
  const names = new Map(exercises.map((e) => [e.exerciseId, e.exerciseName]));
  // Group by exercise, keeping the workout's exercise order.
  const order = new Map(exercises.map((e, i) => [e.exerciseId, i]));
  const sorted = [...prs].sort((a, b) => (order.get(a.exerciseId) ?? 99) - (order.get(b.exerciseId) ?? 99));
  return (
    <Card style={{ gap: t.spacing(3) }}>
      {sorted.map((pr, i) => (
        <View key={pr.id} style={{ gap: t.spacing(3) }}>
          {i > 0 ? <Divider /> : null}
          <Row gap={3}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: t.colors.warning + '26',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="trophy" size={17} color={t.colors.warning} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text weight="600" numberOfLines={1}>
                {names.get(pr.exerciseId) ?? 'Exercise'}
              </Text>
              <Text variant="label" muted weight="400">
                {PR_KIND_LABELS[pr.kind]}
              </Text>
            </View>
            <Text weight="700">{formatPrValue(pr.kind, pr.value, weightUnit, distanceUnit)}</Text>
          </Row>
        </View>
      ))}
    </Card>
  );
}

/** Exercise cards listing every set; PR'd sets get a trophy badge. */
export function ExerciseSetList({
  exercise,
  sets,
  prs,
  weightUnit,
  distanceUnit,
  supersetColor,
}: {
  exercise: WorkoutExerciseWithInfo;
  sets: WorkoutSetRow[];
  prs: PersonalRecordRow[];
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  supersetColor?: string | null;
}) {
  const t = useTheme();
  const nums = workingSetNumbers(sets);
  const best = bestSet(exercise.exerciseType, sets);
  const prBySet = new Map<string, PersonalRecordRow[]>();
  for (const pr of prs) {
    const list = prBySet.get(pr.workoutSetId) ?? [];
    list.push(pr);
    prBySet.set(pr.workoutSetId, list);
  }
  return (
    <Card
      style={{
        gap: t.spacing(2),
        borderLeftWidth: supersetColor ? 4 : undefined,
        borderLeftColor: supersetColor ?? undefined,
      }}
    >
      <Pressable onPress={() => router.push(`/exercise/${exercise.exerciseId}`)} accessibilityRole="link">
        <Row gap={3}>
          <ExerciseAvatar name={exercise.exerciseName} exerciseId={exercise.exerciseId} size={36} />
          <View style={{ flex: 1 }}>
            <Text weight="700" color={t.colors.primary} numberOfLines={2}>
              {exercise.exerciseName}
            </Text>
            {supersetColor ? (
              <Text variant="caption" weight="700" color={supersetColor}>
                SUPERSET
              </Text>
            ) : null}
          </View>
        </Row>
      </Pressable>
      {exercise.notes ? (
        <Text variant="label" muted weight="400">
          {exercise.notes}
        </Text>
      ) : null}
      <Row style={{ marginTop: t.spacing(1) }}>
        <Text variant="caption" muted weight="700" style={{ width: 40 }} align="center">
          SET
        </Text>
        <Text variant="caption" muted weight="700" style={{ flex: 1 }}>
          {setColumns(exercise.exerciseType)
            .map((c) => COLUMN_TITLES[c])
            .join(' & ')}
        </Text>
      </Row>
      {sets.map((s, i) => {
        const e1rm = setE1rm(exercise.exerciseType, s);
        const setPrs = prBySet.get(s.id) ?? [];
        return (
          <Row key={s.id} gap={2} style={{ minHeight: 30 }}>
            <View style={{ width: 40, alignItems: 'center' }}>
              <SetTypeBadge setType={s.setType} index={nums[i] ?? null} size={26} />
            </View>
            <Text weight={best?.id === s.id ? '700' : '500'} style={{ flex: 1 }}>
              {formatSetCompact(exercise.exerciseType, s, weightUnit, distanceUnit, { spaced: true })}
              {s.rpe != null ? <Text variant="label" muted>{`  @${s.rpe}`}</Text> : null}
            </Text>
            {setPrs.length ? (
              <Badge label={setPrs.length > 1 ? `${setPrs.length} PRs` : 'PR'} color={t.colors.warning} />
            ) : null}
            {e1rm != null ? (
              <Text variant="caption" faint>
                1RM {formatWeight(e1rm, weightUnit)}
              </Text>
            ) : null}
          </Row>
        );
      })}
    </Card>
  );
}

/** Compact line per exercise: "3 sets · best 100 kg × 5". */
export function ExerciseBestRow({
  exercise,
  sets,
  prCount,
  weightUnit,
  distanceUnit,
}: {
  exercise: WorkoutExerciseWithInfo;
  sets: WorkoutSetRow[];
  prCount: number;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}) {
  const t = useTheme();
  const best = bestSet(exercise.exerciseType, sets);
  return (
    <Row gap={3} style={{ paddingVertical: t.spacing(2) }}>
      <ExerciseAvatar name={exercise.exerciseName} exerciseId={exercise.exerciseId} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="600" numberOfLines={1}>
          {exercise.exerciseName}
        </Text>
        <Text variant="label" muted weight="400" numberOfLines={1}>
          {sets.length} {sets.length === 1 ? 'set' : 'sets'}
          {best ? ` · Best: ${formatSetCompact(exercise.exerciseType, best, weightUnit, distanceUnit, { spaced: true })}` : ''}
        </Text>
      </View>
      {prCount > 0 ? <Badge label={prCount > 1 ? `${prCount} PRs` : 'PR'} color={t.colors.warning} /> : null}
    </Row>
  );
}
