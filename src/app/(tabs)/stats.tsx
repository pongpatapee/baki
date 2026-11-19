import { Ionicons } from '@expo/vector-icons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { BarChart, shortDate } from '@/components/charts';
import { formatPrValue, longDate } from '@/components/stats/format';
import { MuscleBars } from '@/components/stats/MuscleBars';
import { RangeChips } from '@/components/stats/RangeChips';
import { useLiveData } from '@/components/stats/useLiveData';
import {
  Card,
  Divider,
  EmptyState,
  ExerciseAvatar,
  ListItem,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Stat,
  Text,
} from '@/components/ui';
import { recentRecordsQuery } from '@/db/repositories/personalRecords';
import { loadExerciseLookup, loadFinishedWorkouts, loadStatSets, STATS_TABLES } from '@/db/repositories/stats';
import {
  filterByRange,
  headlineStats,
  muscleDistribution,
  topExercises,
  weeklyBuckets,
  weeklyStreak,
  type StatRange,
} from '@/domain/stats';
import { PR_KIND_LABELS } from '@/domain/types';
import { formatElapsed, formatVolume, kgToUnit } from '@/domain/units';
import { useSettings, useTheme } from '@/theme/AppProviders';

async function loadAll() {
  const [workouts, sets] = await Promise.all([loadFinishedWorkouts(), loadStatSets()]);
  return { workouts, sets, loadedAt: Date.now() };
}

export default function StatsTab() {
  const t = useTheme();
  const settings = useSettings();
  const units = { weightUnit: settings.weightUnit, distanceUnit: settings.distanceUnit };
  const [range, setRange] = useState<StatRange>('3M');

  const all = useLiveData(loadAll, [], STATS_TABLES);
  const lookup = useLiveData(loadExerciseLookup, [], ['exercises']);
  const { data: recentPrs } = useLiveQuery(recentRecordsQuery(8));

  const view = useMemo(() => {
    if (!all.data) return null;
    const nowMs = all.data.loadedAt;
    const workouts = filterByRange(all.data.workouts, (w) => w.startedAt, range, nowMs);
    const sets = filterByRange(all.data.sets, (s) => s.startedAt, range, nowMs);
    const weeks = weeklyBuckets(all.data.workouts, all.data.sets, range, nowMs);
    return {
      workouts,
      headline: headlineStats(workouts, sets),
      streak: weeklyStreak(
        all.data.workouts.map((w) => w.startedAt),
        nowMs,
      ),
      weeks,
      muscles: muscleDistribution(sets),
      top: topExercises(sets, 8),
    };
  }, [all.data, range]);

  if (!view) return <Loading />;

  if (all.data!.workouts.length === 0) {
    return (
      <Screen scroll>
        <EmptyState
          icon="stats-chart-outline"
          title="No stats yet"
          message="Finish a workout (or import your Hevy history from Settings) to see charts and records."
        />
        <ToolsCard />
      </Screen>
    );
  }

  const weekCount = Math.max(1, view.weeks.length);
  const weekLabel = (ms: number) => shortDate(ms, false);
  const volumeData = view.weeks.map((w) => ({ label: weekLabel(w.weekStart), value: kgToUnit(w.volumeKg, units.weightUnit) }));
  const countData = view.weeks.map((w) => ({ label: weekLabel(w.weekStart), value: w.workouts }));
  const durationData = view.weeks.map((w) => ({ label: weekLabel(w.weekStart), value: w.durationS / 3600 }));
  const totalHours = view.weeks.reduce((a, w) => a + w.durationS, 0);

  return (
    <Screen scroll>
      <RangeChips value={range} onChange={setRange} ranges={['1M', '3M', '6M', '1Y', 'ALL']} />

      <Card style={{ marginTop: t.spacing(4), gap: t.spacing(4) }}>
        <Row gap={3}>
          <Stat icon="barbell-outline" label="Workouts" value={String(view.headline.workouts)} />
          <Stat icon="layers-outline" label="Volume" value={formatVolume(view.headline.volumeKg, units.weightUnit)} />
        </Row>
        <Row gap={3}>
          <Stat icon="time-outline" label="Time" value={formatElapsed(view.headline.durationS)} />
          <Stat
            icon="flame-outline"
            label="Week streak"
            value={`${view.streak.current} wk${view.streak.current === 1 ? '' : 's'}`}
          />
        </Row>
        <Text variant="caption" faint>
          {view.headline.sets.toLocaleString('en-US')} working sets · {view.headline.reps.toLocaleString('en-US')} reps · best
          streak {view.streak.longest} wk{view.streak.longest === 1 ? '' : 's'}
        </Text>
      </Card>

      <SectionHeader title="Volume per week" />
      <Card>
        <BarChart
          data={volumeData}
          formatValue={(v) => `${Math.round(v).toLocaleString('en-US')} ${units.weightUnit}`}
          summary={{
            value: `${Math.round(volumeData.reduce((a, d) => a + d.value, 0) / weekCount).toLocaleString('en-US')} ${units.weightUnit}`,
            caption: 'Average per week · hold to inspect',
          }}
          pressedPrefix="Week of"
        />
      </Card>

      <SectionHeader title="Workouts per week" />
      <Card>
        <BarChart
          data={countData}
          color={t.colors.chart[1]}
          formatValue={(v) => `${v} workout${v === 1 ? '' : 's'}`}
          formatAxisValue={(v) => (Number.isInteger(v) ? String(v) : '')}
          summary={{ value: (view.headline.workouts / weekCount).toFixed(1), caption: 'Average per week' }}
          pressedPrefix="Week of"
          height={150}
        />
      </Card>

      <SectionHeader title="Training time per week" />
      <Card>
        <BarChart
          data={durationData}
          color={t.colors.chart[2]}
          formatValue={(v) => formatElapsed(v * 3600)}
          formatAxisValue={(v) => `${Math.round(v * 10) / 10}h`}
          summary={{ value: formatElapsed(totalHours / weekCount), caption: 'Average per week' }}
          pressedPrefix="Week of"
          height={150}
        />
      </Card>

      <SectionHeader title="Muscle distribution" />
      <Card>
        {view.muscles.length === 0 ? (
          <Text muted>No working sets in this range.</Text>
        ) : (
          <>
            <MuscleBars data={view.muscles} />
            <Text variant="caption" faint style={{ marginTop: t.spacing(3) }}>
              Working sets. Primary muscle counts 1 set, each secondary muscle ½.
            </Text>
          </>
        )}
      </Card>

      <SectionHeader title="Top exercises" />
      <Card style={{ paddingVertical: t.spacing(1) }}>
        {view.top.length === 0 ? (
          <Text muted style={{ paddingVertical: t.spacing(3) }}>
            No exercises in this range.
          </Text>
        ) : (
          view.top.map((u, i) => {
            const name = lookup.data?.get(u.exerciseId)?.name ?? 'Exercise';
            return (
              <View key={u.exerciseId}>
                {i > 0 ? <Divider /> : null}
                <ListItem
                  title={name}
                  subtitle={`${u.workouts} workout${u.workouts === 1 ? '' : 's'}${u.volumeKg > 0 ? ` · ${formatVolume(u.volumeKg, units.weightUnit)}` : ''}`}
                  left={<ExerciseAvatar name={name} size={36} />}
                  right={
                    <Text weight="700">
                      {u.sets} <Text variant="caption" muted>sets</Text>
                    </Text>
                  }
                  onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: u.exerciseId } })}
                />
              </View>
            );
          })
        )}
      </Card>

      <SectionHeader title="Recent personal records" />
      <Card style={{ paddingVertical: t.spacing(1) }}>
        {(recentPrs ?? []).length === 0 ? (
          <Text muted style={{ paddingVertical: t.spacing(3) }}>
            No records yet.
          </Text>
        ) : (
          (recentPrs ?? []).map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <Divider /> : null}
              <ListItem
                title={lookup.data?.get(r.exerciseId)?.name ?? 'Exercise'}
                subtitle={`${PR_KIND_LABELS[r.kind]} · ${longDate(r.achievedAt)}`}
                left={<Ionicons name="trophy" size={20} color={t.colors.warning} />}
                right={<Text weight="700">{formatPrValue(r.kind, r.value, units)}</Text>}
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: r.exerciseId } })}
              />
            </View>
          ))
        )}
      </Card>

      <ToolsCard />
    </Screen>
  );
}

function ToolsCard() {
  const t = useTheme();
  return (
    <>
      <SectionHeader title="Tools" />
      <Card style={{ paddingVertical: t.spacing(1) }}>
        <ListItem
          title="Plate calculator"
          subtitle="Which plates to load for a target weight"
          left={<Ionicons name="disc-outline" size={22} color={t.colors.primary} />}
          chevron
          onPress={() => router.push('/tools/plates')}
        />
        <Divider />
        <ListItem
          title="Warm-up calculator"
          subtitle="Ramp-up sets for your working weight"
          left={<Ionicons name="trending-up-outline" size={22} color={t.colors.primary} />}
          chevron
          onPress={() => router.push('/tools/warmup')}
        />
      </Card>
    </>
  );
}
