import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { LineChart } from '@/components/charts';
import { Card, Chip, Divider, ListItem, Row, SectionHeader, Text } from '@/components/ui';
import type { PersonalRecordRow } from '@/db/schema';
import { prKindsForType } from '@/domain/prs';
import {
  EXERCISE_METRIC_LABELS,
  exerciseSessions,
  filterByRange,
  metricSeries,
  metricsForType,
  type ExerciseMetric,
  type StatRange,
  type StatSet,
} from '@/domain/stats';
import { PR_KIND_LABELS, type ExerciseType } from '@/domain/types';
import { useTheme } from '@/theme/AppProviders';

import { formatDisplayMetric, formatPrValue, longDate, metricToDisplay, type Units } from './format';
import { RangeChips } from './RangeChips';

export function ExerciseSummary({
  type,
  sets,
  records,
  units,
}: {
  type: ExerciseType;
  sets: readonly StatSet[];
  records: readonly PersonalRecordRow[];
  units: Units;
}) {
  const t = useTheme();
  const metrics = metricsForType(type);
  const [metric, setMetric] = useState<ExerciseMetric>(metrics[0]!);
  const [range, setRange] = useState<StatRange>('3M');
  const [nowMs] = useState(() => Date.now());
  const active = metrics.includes(metric) ? metric : metrics[0]!;

  const sessions = useMemo(() => exerciseSessions(sets), [sets]);
  // React Compiler memoizes this; manual useMemo conflicts with its inferred dependencies.
  const points = filterByRange(metricSeries(sessions, active), (p) => p.t, range, nowMs).map((p) => ({
    t: p.t,
    value: metricToDisplay(active, p.value, units),
  }));

  const best = useMemo(() => {
    const map = new Map<string, PersonalRecordRow>();
    for (const r of records) {
      const cur = map.get(r.kind);
      if (!cur || r.value > cur.value) map.set(r.kind, r);
    }
    return prKindsForType(type)
      .map((k) => map.get(k))
      .filter((r): r is PersonalRecordRow => !!r);
  }, [records, type]);

  return (
    <View>
      <Card style={{ gap: t.spacing(3) }}>
        {metrics.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing(2) }}>
            {metrics.map((m) => (
              <Chip key={m} label={EXERCISE_METRIC_LABELS[m]} selected={m === active} onPress={() => setMetric(m)} />
            ))}
          </ScrollView>
        ) : null}
        <LineChart
          data={points}
          formatValue={(v) => formatDisplayMetric(active, v, units)}
          emptyMessage={sessions.length === 0 ? 'Log this exercise to see your progress' : 'No sessions in this range'}
        />
        <RangeChips value={range} onChange={setRange} />
      </Card>

      <SectionHeader title="Personal records" />
      <Card style={{ paddingVertical: t.spacing(1) }}>
        {best.length === 0 ? (
          <Text muted style={{ paddingVertical: t.spacing(3) }}>
            No records yet. Complete a set to set your first PR.
          </Text>
        ) : (
          best.map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <Divider /> : null}
              <ListItem
                title={PR_KIND_LABELS[r.kind]}
                subtitle={longDate(r.achievedAt)}
                right={
                  <Text weight="700" color={t.colors.text}>
                    {formatPrValue(r.kind, r.value, units)}
                  </Text>
                }
                onPress={() => router.push({ pathname: '/history/[id]', params: { id: r.workoutId } })}
              />
            </View>
          ))
        )}
      </Card>
      {sessions.length > 0 ? (
        <Row justify="space-between" style={{ marginTop: t.spacing(3) }}>
          <Text variant="caption" faint>
            {sessions.length} session{sessions.length === 1 ? '' : 's'}
          </Text>
          <Text variant="caption" faint>
            First logged {longDate(sessions[0]!.startedAt)}
          </Text>
        </Row>
      ) : null}
    </View>
  );
}
