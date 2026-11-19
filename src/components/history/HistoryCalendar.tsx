/** Month calendar with dots on workout days; tap a day to list its workouts. */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { IconButton, Row, Text } from '@/components/ui';
import type { WorkoutListItem } from '@/db/repositories/workouts';
import type { WeightUnit } from '@/domain/types';
import { dayKey, monthGrid, monthLabel, weekdayInitials } from '@/domain/workout';
import { useTheme } from '@/theme/AppProviders';

import { formatShortDate } from './format';
import { WorkoutCard } from './WorkoutCard';

const WEEK_START = 1 as const;

export function HistoryCalendar({ items, weightUnit }: { items: WorkoutListItem[]; weightUnit: WeightUnit }) {
  const t = useTheme();
  const today = new Date();
  const [month, setMonth] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState<string>(dayKey(today));

  const byDay = useMemo(() => {
    const map = new Map<string, WorkoutListItem[]>();
    for (const it of items) {
      const k = dayKey(it.startedAt);
      const list = map.get(k) ?? [];
      list.push(it);
      map.set(k, list);
    }
    return map;
  }, [items]);

  const weeks = useMemo(() => monthGrid(month.y, month.m, WEEK_START), [month]);
  const monthCount = useMemo(
    () =>
      items.filter((i) => {
        const d = new Date(i.startedAt);
        return d.getFullYear() === month.y && d.getMonth() === month.m;
      }).length,
    [items, month],
  );
  const shift = (delta: number) =>
    setMonth(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const todayKey = dayKey(today);
  const dayItems = byDay.get(selected) ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: t.spacing(4), gap: t.spacing(3), paddingBottom: t.spacing(10) }}>
      <View
        style={{
          backgroundColor: t.colors.surface,
          borderRadius: t.radius.lg,
          padding: t.spacing(3),
          gap: t.spacing(2),
        }}
      >
        <Row justify="space-between">
          <IconButton icon="chevron-back" accessibilityLabel="Previous month" onPress={() => shift(-1)} />
          <View style={{ alignItems: 'center' }}>
            <Text variant="heading">{monthLabel(month.y, month.m)}</Text>
            <Text variant="caption" muted>
              {monthCount} {monthCount === 1 ? 'workout' : 'workouts'}
            </Text>
          </View>
          <IconButton icon="chevron-forward" accessibilityLabel="Next month" onPress={() => shift(1)} />
        </Row>
        <View style={{ flexDirection: 'row' }}>
          {weekdayInitials(WEEK_START).map((d, i) => (
            <Text key={i} variant="caption" muted weight="700" align="center" style={{ flex: 1 }}>
              {d}
            </Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row' }}>
            {week.map((date, di) => {
              if (!date) return <View key={di} style={{ flex: 1, height: 44 }} />;
              const k = dayKey(date);
              const has = byDay.has(k);
              const isSel = k === selected;
              const isToday = k === todayKey;
              return (
                <Pressable
                  key={di}
                  onPress={() => setSelected(k)}
                  accessibilityRole="button"
                  accessibilityLabel={`${date.toDateString()}${has ? ', has workouts' : ''}`}
                  accessibilityState={{ selected: isSel }}
                  style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSel ? t.colors.primary : has ? t.colors.primaryMuted : 'transparent',
                      borderWidth: isToday && !isSel ? 1 : 0,
                      borderColor: t.colors.primary,
                    }}
                  >
                    <Text
                      weight={has || isSel ? '700' : '400'}
                      color={isSel ? t.colors.onPrimary : has ? t.colors.primary : t.colors.text}
                    >
                      {date.getDate()}
                    </Text>
                  </View>
                  {has && !isSel ? (
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 1,
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: t.colors.primary,
                      }}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <Text variant="label" muted style={{ textTransform: 'uppercase', letterSpacing: 0.8, marginTop: t.spacing(2) }}>
        {formatShortDate(new Date(selected + 'T12:00:00').getTime())}
      </Text>
      {dayItems.length === 0 ? (
        <Text muted>No workouts on this day.</Text>
      ) : (
        dayItems.map((it) => <WorkoutCard key={it.id} item={it} weightUnit={weightUnit} />)
      )}
    </ScrollView>
  );
}
