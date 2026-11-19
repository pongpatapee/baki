import { View } from 'react-native';

import { Row, Text } from '@/components/ui';
import type { MuscleShare } from '@/domain/stats';
import { MUSCLE_GROUP_LABELS } from '@/domain/types';
import { useTheme } from '@/theme/AppProviders';

/** Horizontal bars of working sets per muscle group (primary = 1, secondary = 0.5). */
export function MuscleBars({ data, limit = 12 }: { data: readonly MuscleShare[]; limit?: number }) {
  const t = useTheme();
  const rows = data.slice(0, limit);
  const max = Math.max(1, ...rows.map((r) => r.sets));
  return (
    <View style={{ gap: t.spacing(2.5) }}>
      {rows.map((r) => (
        <View key={r.muscle} style={{ gap: 4 }}>
          <Row justify="space-between">
            <Text variant="label">{MUSCLE_GROUP_LABELS[r.muscle]}</Text>
            <Text variant="caption" muted>
              {formatSets(r.sets)} sets · {Math.round(r.fraction * 100)}%
            </Text>
          </Row>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.colors.surfaceAlt, overflow: 'hidden' }}>
            <View
              style={{
                width: `${Math.max(2, (r.sets / max) * 100)}%`,
                height: '100%',
                borderRadius: 4,
                backgroundColor: t.colors.primary,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function formatSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
