import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, EmptyState, Row, Text } from '@/components/ui';
import { groupHistory, type StatSetWithPosition } from '@/db/repositories/stats';
import { setOneRepMax } from '@/domain/volume';
import { formatWeight } from '@/domain/units';
import { useTheme } from '@/theme/AppProviders';

import { formatSetSummary, longDate, type Units } from './format';

const PAGE = 20;

export function ExerciseHistory({ sets, units, prSetIds }: { sets: readonly StatSetWithPosition[]; units: Units; prSetIds: Set<string> }) {
  const t = useTheme();
  const sessions = useMemo(() => groupHistory(sets), [sets]);
  const [shown, setShown] = useState(PAGE);

  if (sessions.length === 0) {
    return <EmptyState icon="time-outline" title="No history yet" message="Sessions with this exercise will show up here." />;
  }

  return (
    <View style={{ gap: t.spacing(3) }}>
      {sessions.slice(0, shown).map((s) => {
        let working = 0;
        return (
          <Card
            key={s.workoutId}
            onPress={() => router.push({ pathname: '/history/[id]', params: { id: s.workoutId } })}
            style={{ gap: t.spacing(2) }}
          >
            <View>
              <Text variant="heading" numberOfLines={1}>
                {s.workoutTitle}
              </Text>
              <Text variant="label" muted>
                {longDate(s.startedAt)}
              </Text>
            </View>
            {s.sets.map((set) => {
              const isWarm = set.setType === 'warmup';
              if (!isWarm) working += 1;
              const label = isWarm ? 'W' : set.setType === 'drop' ? 'D' : set.setType === 'failure' ? 'F' : String(working);
              const labelColor = isWarm
                ? t.colors.warmup
                : set.setType === 'drop'
                  ? t.colors.drop
                  : set.setType === 'failure'
                    ? t.colors.failure
                    : t.colors.textMuted;
              const e1rm = setOneRepMax(set.exerciseType, set);
              return (
                <Row key={set.setId} gap={3}>
                  <Text weight="700" color={labelColor} style={{ width: 20, textAlign: 'center' }}>
                    {label}
                  </Text>
                  <Text style={{ flex: 1 }}>{formatSetSummary(set, units)}</Text>
                  {prSetIds.has(set.setId) ? <Badge label="PR" color={t.colors.warning} /> : null}
                  {e1rm != null && !isWarm ? (
                    <Text variant="caption" faint>
                      1RM {formatWeight(e1rm, units.weightUnit)}
                    </Text>
                  ) : null}
                </Row>
              );
            })}
          </Card>
        );
      })}
      {shown < sessions.length ? (
        <Button title={`Show more (${sessions.length - shown})`} variant="secondary" onPress={() => setShown((n) => n + PAGE)} />
      ) : null}
    </View>
  );
}
