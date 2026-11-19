/**
 * Compact "workout in progress" bar shown above the tab bar while a workout is running.
 * Tapping it reopens the live workout. Also keeps the screen awake (per settings) and shows the
 * rest countdown, so both keep working while the workout screen is minimized.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { KeepAwakeWhileWorkout } from '@/components/workout/KeepAwake';
import { useNow } from '@/components/workout/useNow';
import { activeWorkoutQuery } from '@/db/repositories/workouts';
import { formatDuration } from '@/domain/units';
import { remainingSeconds } from '@/domain/workout';
import { useRestTimer } from '@/stores/restTimer';
import { useTheme } from '@/theme/AppProviders';

export function ActiveWorkoutBar() {
  const { data } = useLiveQuery(activeWorkoutQuery());
  const workout = data[0];
  if (!workout) return null;
  return <Bar title={workout.title} startedAt={workout.startedAt} />;
}

function Bar({ title, startedAt }: { title: string; startedAt: number }) {
  const t = useTheme();
  const now = useNow(1000);
  const restEnd = useRestTimer((s) => s.endAt);
  const rest = restEnd != null ? remainingSeconds(restEnd, now) : null;

  return (
    <>
      <KeepAwakeWhileWorkout />
      <Pressable
        onPress={() => router.push('/workout/active')}
        accessibilityRole="button"
        accessibilityLabel="Open workout in progress"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing(3),
          paddingHorizontal: t.spacing(4),
          paddingVertical: t.spacing(2.5),
          backgroundColor: t.colors.surface,
          borderTopWidth: 1,
          borderTopColor: t.colors.border,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: t.colors.success,
          }}
        />
        <View style={{ flex: 1 }}>
          <Text variant="label" muted weight="500">
            Workout in progress · {formatDuration((now - startedAt) / 1000)}
          </Text>
          <Text weight="600" numberOfLines={1}>
            {title}
          </Text>
        </View>
        {rest != null && rest > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.primaryMuted,
            }}
          >
            <Ionicons name="timer-outline" size={14} color={t.colors.primary} />
            <Text variant="label" color={t.colors.primary} style={{ fontVariant: ['tabular-nums'] }}>
              {formatDuration(rest)}
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-up" size={20} color={t.colors.textMuted} />
      </Pressable>
    </>
  );
}
