/** History tab: finished workouts as a month-grouped list or a calendar. */
import { useMemo, useState } from 'react';
import { SectionList, View } from 'react-native';

import { HistoryCalendar } from '@/components/history/HistoryCalendar';
import { useWorkoutHistory } from '@/components/history/useWorkoutHistory';
import { WorkoutCard } from '@/components/history/WorkoutCard';
import { EmptyState, Loading, Segmented, Text } from '@/components/ui';
import { groupByMonth } from '@/domain/workout';
import { useSettings, useTheme } from '@/theme/AppProviders';

type Mode = 'list' | 'calendar';

export default function HistoryTab() {
  const t = useTheme();
  const { weightUnit } = useSettings();
  const { items, loaded } = useWorkoutHistory();
  const [mode, setMode] = useState<Mode>('list');
  const sections = useMemo(() => groupByMonth(items), [items]);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.background }}>
      <View style={{ paddingHorizontal: t.spacing(4), paddingTop: t.spacing(2), paddingBottom: t.spacing(1) }}>
        <Segmented<Mode>
          options={[
            { value: 'list', label: 'List' },
            { value: 'calendar', label: 'Calendar' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>
      {!loaded ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="No workouts yet"
          message="Finished workouts show up here. Start one from the Workout tab."
        />
      ) : mode === 'calendar' ? (
        <HistoryCalendar items={items} weightUnit={weightUnit} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(it) => it.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingHorizontal: t.spacing(4), paddingBottom: t.spacing(10) }}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                backgroundColor: t.colors.background,
                paddingTop: t.spacing(4),
                paddingBottom: t.spacing(2),
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}
            >
              <Text variant="label" muted style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {section.title}
              </Text>
              <Text variant="label" faint>
                {section.data.length} {section.data.length === 1 ? 'workout' : 'workouts'}
              </Text>
            </View>
          )}
          renderItem={({ item }) => <WorkoutCard item={item} weightUnit={weightUnit} />}
          ItemSeparatorComponent={() => <View style={{ height: t.spacing(3) }} />}
        />
      )}
    </View>
  );
}
