/** History card: title, date, duration / volume / PRs, and "3 × Bench Press (Barbell)" lines. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo } from 'react';
import { View } from 'react-native';

import { Card, Row, Text } from '@/components/ui';
import type { WorkoutListItem } from '@/db/repositories/workouts';
import type { WeightUnit } from '@/domain/types';
import { formatElapsed, formatVolume } from '@/domain/units';
import { useTheme } from '@/theme/AppProviders';

import { formatWorkoutDate } from './format';

const MAX_LINES = 4;

function WorkoutCardImpl({ item, weightUnit }: { item: WorkoutListItem; weightUnit: WeightUnit }) {
  const t = useTheme();
  const more = item.exercises.length - MAX_LINES;
  return (
    <Card onPress={() => router.push(`/history/${item.id}`)} style={{ gap: t.spacing(3) }}>
      <View style={{ gap: 2 }}>
        <Text variant="heading" numberOfLines={1}>
          {item.title}
        </Text>
        <Text variant="label" muted weight="400">
          {formatWorkoutDate(item.startedAt)}
        </Text>
      </View>
      <Row gap={4}>
        <Meta icon="time-outline" label={formatElapsed(item.durationS)} />
        <Meta icon="barbell-outline" label={formatVolume(item.volumeKg, weightUnit)} />
        {item.prCount > 0 ? (
          <Meta icon="trophy" label={`${item.prCount} ${item.prCount === 1 ? 'PR' : 'PRs'}`} color={t.colors.warning} />
        ) : null}
      </Row>
      <View style={{ gap: 4 }}>
        {item.exercises.slice(0, MAX_LINES).map((e, i) => (
          <Text key={`${e.exerciseId}-${i}`} variant="label" weight="400" numberOfLines={1}>
            <Text variant="label" muted>{`${e.setCount} × `}</Text>
            {e.name}
          </Text>
        ))}
        {more > 0 ? (
          <Text variant="label" faint>
            + {more} more {more === 1 ? 'exercise' : 'exercises'}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function Meta({ icon, label, color }: { icon: 'time-outline' | 'barbell-outline' | 'trophy'; label: string; color?: string }) {
  const t = useTheme();
  return (
    <Row gap={1}>
      <Ionicons name={icon} size={14} color={color ?? t.colors.textMuted} />
      <Text variant="label" color={color ?? t.colors.textMuted}>
        {label}
      </Text>
    </Row>
  );
}

export const WorkoutCard = memo(WorkoutCardImpl);
