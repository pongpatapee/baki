/** Duration · Volume · Sets row used by the live workout, summary and detail screens. */
import { View } from 'react-native';

import { Stat } from '@/components/ui';
import { formatDuration, formatElapsed, formatVolume } from '@/domain/units';
import type { WeightUnit } from '@/domain/types';
import { useTheme } from '@/theme/AppProviders';

import { useNow } from './useNow';

export function WorkoutStats({
  durationS,
  volumeKg,
  setCount,
  prCount,
  weightUnit,
  live,
  startedAt,
}: {
  durationS: number;
  volumeKg: number;
  setCount: number;
  prCount?: number;
  weightUnit: WeightUnit;
  /** Live clock for an in-progress workout (ticks every second). */
  live?: boolean;
  startedAt?: number;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: t.spacing(3) }}>
      {live && startedAt != null ? (
        <LiveDuration startedAt={startedAt} />
      ) : (
        <Stat label="Duration" value={formatElapsed(durationS)} icon="time-outline" />
      )}
      <Stat label="Volume" value={formatVolume(volumeKg, weightUnit)} icon="barbell-outline" />
      <Stat label="Sets" value={String(setCount)} icon="checkmark-done-outline" />
      {prCount != null ? <Stat label="PRs" value={String(prCount)} icon="trophy-outline" /> : null}
    </View>
  );
}

function LiveDuration({ startedAt }: { startedAt: number }) {
  const now = useNow(1000);
  return <Stat label="Duration" value={formatDuration((now - startedAt) / 1000)} icon="time-outline" />;
}
