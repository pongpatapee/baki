import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Card, Divider, EmptyState, ListItem, Row, SectionHeader, Text } from '@/components/ui';
import type { PersonalRecordRow } from '@/db/schema';
import { repMaxTable } from '@/domain/prs';
import type { StatSet } from '@/domain/stats';
import { PR_KIND_LABELS, type ExerciseType } from '@/domain/types';
import { formatWeight } from '@/domain/units';
import { countsVolume } from '@/domain/volume';
import { useTheme } from '@/theme/AppProviders';

import { formatPrValue, longDate, type Units } from './format';

export function ExerciseRecords({
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
  const showRepMax = countsVolume(type);
  const table = useMemo(
    () =>
      showRepMax
        ? repMaxTable(sets.map((s) => ({ ...s, achievedAt: s.completedAt ?? s.startedAt })), 12)
        : [],
    [sets, showRepMax],
  );
  const progression = useMemo(() => [...records].sort((a, b) => b.achievedAt - a.achievedAt), [records]);

  // Previous value per record (for "+2.5 kg" deltas).
  const previous = useMemo(() => {
    const out = new Map<string, number>();
    const last = new Map<string, number>();
    for (const r of [...records].sort((a, b) => a.achievedAt - b.achievedAt)) {
      const p = last.get(r.kind);
      if (p !== undefined) out.set(r.id, p);
      last.set(r.kind, r.value);
    }
    return out;
  }, [records]);

  if (records.length === 0 && table.every((x) => x == null)) {
    return <EmptyState icon="trophy-outline" title="No records yet" message="Your personal records will appear here." />;
  }

  return (
    <View>
      {showRepMax ? (
        <>
          <SectionHeader title="Rep maxes" />
          <Card style={{ paddingVertical: t.spacing(1) }}>
            {table.map((row, i) => (
              <View key={i}>
                {i > 0 ? <Divider /> : null}
                <Row justify="space-between" style={{ paddingVertical: t.spacing(2.5) }}>
                  <Text variant="label" muted style={{ width: 70 }}>
                    {i + 1} rep{i === 0 ? '' : 's'}
                    {i === table.length - 1 ? '+' : ''}
                  </Text>
                  <Text weight="600" style={{ flex: 1 }}>
                    {row ? formatWeight(row.weightKg, units.weightUnit) : '-'}
                  </Text>
                  <Text variant="caption" faint>
                    {row ? longDate(row.achievedAt) : ''}
                  </Text>
                </Row>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Record history" />
      <Card style={{ paddingVertical: t.spacing(1) }}>
        {progression.map((r, i) => {
          const prev = previous.get(r.id);
          const delta =
            prev !== undefined && r.kind !== 'most_reps' && r.kind !== 'longest_duration' && r.kind !== 'longest_distance'
              ? `+${formatPrValue(r.kind, r.value - prev, units)}`
              : prev !== undefined
                ? `prev ${formatPrValue(r.kind, prev, units)}`
                : 'First record';
          return (
            <View key={r.id}>
              {i > 0 ? <Divider /> : null}
              <ListItem
                title={`${PR_KIND_LABELS[r.kind]} · ${formatPrValue(r.kind, r.value, units)}`}
                subtitle={`${longDate(r.achievedAt)} · ${delta}`}
                chevron
                onPress={() => router.push({ pathname: '/history/[id]', params: { id: r.workoutId } })}
              />
            </View>
          );
        })}
      </Card>
    </View>
  );
}
