import { View } from 'react-native';

import { Badge, Card, Divider, Row, SectionHeader, Text } from '@/components/ui';
import type { ExerciseRow } from '@/db/schema';
import { EQUIPMENT_LABELS, EXERCISE_TYPE_LABELS, MUSCLE_GROUP_LABELS, SET_FIELDS } from '@/domain/types';
import { useTheme } from '@/theme/AppProviders';

export function ExerciseInfo({ exercise }: { exercise: ExerciseRow }) {
  const t = useTheme();
  const fields = SET_FIELDS[exercise.exerciseType];
  const tracks = [fields.weight && 'weight', fields.reps && 'reps', fields.distance && 'distance', fields.duration && 'time']
    .filter(Boolean)
    .join(', ');
  const rows: [string, string][] = [
    ['Type', EXERCISE_TYPE_LABELS[exercise.exerciseType]],
    ['Tracks', tracks],
    ['Equipment', EQUIPMENT_LABELS[exercise.equipment]],
  ];
  return (
    <View>
      <Card style={{ gap: t.spacing(3) }}>
        <Text variant="label" muted>
          Primary muscle
        </Text>
        <Row wrap>
          <Badge label={MUSCLE_GROUP_LABELS[exercise.primaryMuscle]} />
        </Row>
        {exercise.secondaryMuscles.length > 0 ? (
          <>
            <Text variant="label" muted>
              Secondary muscles
            </Text>
            <Row wrap>
              {exercise.secondaryMuscles.map((m) => (
                <Badge key={m} label={MUSCLE_GROUP_LABELS[m]} color={t.colors.textMuted} />
              ))}
            </Row>
          </>
        ) : null}
      </Card>
      <SectionHeader title="Details" />
      <Card style={{ paddingVertical: t.spacing(1) }}>
        {rows.map(([k, v], i) => (
          <View key={k}>
            {i > 0 ? <Divider /> : null}
            <Row justify="space-between" style={{ paddingVertical: t.spacing(3) }}>
              <Text muted>{k}</Text>
              <Text weight="600">{v}</Text>
            </Row>
          </View>
        ))}
      </Card>
      <SectionHeader title="Notes" />
      <Card>
        <Text muted={!exercise.notes}>{exercise.notes?.trim() || (exercise.isCustom ? 'No notes. Tap Edit to add some.' : 'No notes.')}</Text>
      </Card>
    </View>
  );
}
