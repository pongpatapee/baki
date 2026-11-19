/** Countdown bar for the rest timer, with −15s / +15s / Skip. Renders nothing when idle. */
import { View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { formatDuration } from '@/domain/units';
import { remainingSeconds } from '@/domain/workout';
import { adjustRestTimer, skipRestTimer, useRestTimer } from '@/stores/restTimer';
import { useTheme } from '@/theme/AppProviders';

import { useNow } from './useNow';

export const REST_BAR_HEIGHT = 72;

export function RestTimerBar() {
  const endAt = useRestTimer((s) => s.endAt);
  if (endAt == null) return null;
  return <RunningBar endAt={endAt} />;
}

function RunningBar({ endAt }: { endAt: number }) {
  const t = useTheme();
  const total = useRestTimer((s) => s.totalSeconds);
  const now = useNow(250);
  const left = remainingSeconds(endAt, now);
  const progress = total > 0 ? Math.min(1, Math.max(0, (endAt - now) / (total * 1000))) : 0;

  return (
    <View
      style={{
        backgroundColor: t.colors.surface,
        borderTopWidth: 1,
        borderTopColor: t.colors.border,
        height: REST_BAR_HEIGHT,
      }}
    >
      <View style={{ height: 4, backgroundColor: t.colors.surfaceAlt }}>
        <View style={{ height: 4, width: `${progress * 100}%`, backgroundColor: t.colors.primary }} />
      </View>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: t.spacing(4),
          gap: t.spacing(2),
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="caption" muted>
            Rest
          </Text>
          <Text variant="title" style={{ fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">
            {formatDuration(left)}
          </Text>
        </View>
        <Button title="−15" size="sm" variant="secondary" onPress={() => adjustRestTimer(-15)} />
        <Button title="+15" size="sm" variant="secondary" onPress={() => adjustRestTimer(15)} />
        <Button title="Skip" size="sm" onPress={skipRestTimer} />
      </View>
    </View>
  );
}
