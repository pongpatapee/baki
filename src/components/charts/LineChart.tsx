import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { CartesianChart, Line, Scatter, useChartPressState } from 'victory-native';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme/AppProviders';

import { compactNumber, shortDate, useChartFont } from './chartUtils';
import { ChartEmpty } from './ChartEmpty';
import { PressIndicator } from './PressIndicator';

export interface LinePoint {
  /** Epoch ms. */
  t: number;
  value: number;
}

export interface LineChartProps {
  data: readonly LinePoint[];
  /** Full value text for the header, e.g. "102.5 kg". */
  formatValue: (v: number) => string;
  /** Short axis label for values; defaults to a compact number. */
  formatAxisValue?: (v: number) => string;
  height?: number;
  color?: string;
  emptyMessage?: string;
  /** Caption under the value when nothing is pressed (defaults to the latest point's date). */
  caption?: string;
}

const DAY = 24 * 3600 * 1000;

/**
 * Time-series line chart. Press and hold to scrub: the header shows the pressed value and date.
 * 0 points renders an empty state; 1 point renders a single dot on a padded domain.
 */
export function LineChart({
  data,
  formatValue,
  formatAxisValue = compactNumber,
  height = 220,
  color,
  emptyMessage = 'No data yet',
  caption,
}: LineChartProps) {
  const t = useTheme();
  const font = useChartFont();
  const stroke = color ?? t.colors.primary;
  const { state, isActive } = useChartPressState({ x: 0, y: { value: 0 } });
  const [active, setActive] = useState<number | null>(null);

  const rows = useMemo(() => data.map((p) => ({ t: p.t, value: p.value })), [data]);
  const spanYears = rows.length > 1 && new Date(rows[0]!.t).getFullYear() !== new Date(rows[rows.length - 1]!.t).getFullYear();

  const onIndex = useCallback((i: number) => setActive(i), []);
  useAnimatedReaction(
    () => (state.isActive.value ? state.matchedIndex.value : -1),
    (i, prev) => {
      if (i !== prev) scheduleOnRN(onIndex, i);
    },
  );

  const domain = useMemo(() => {
    if (rows.length !== 1) return undefined;
    const p = rows[0]!;
    return { x: [p.t - 7 * DAY, p.t + 7 * DAY] as [number, number], y: [0, p.value * 1.25 || 1] as [number, number] };
  }, [rows]);

  if (rows.length === 0) return <ChartEmpty height={height} message={emptyMessage} />;

  const shown = isActive && active != null && active >= 0 ? rows[active] : rows[rows.length - 1];
  const first = rows[0]!.value;
  const last = rows[rows.length - 1]!.value;
  const change = rows.length > 1 && first > 0 ? (last - first) / first : null;

  return (
    <View style={{ gap: t.spacing(2) }}>
      <View style={{ minHeight: 44 }}>
        <Text variant="title">{shown ? formatValue(shown.value) : ''}</Text>
        <Text variant="label" muted>
          {isActive && shown
            ? shortDate(shown.t, true)
            : caption ??
              (change != null
                ? `${change >= 0 ? '+' : ''}${Math.round(change * 100)}% since ${shortDate(rows[0]!.t)}`
                : shown
                  ? shortDate(shown.t, true)
                  : '')}
        </Text>
      </View>
      <View style={{ height }}>
        <CartesianChart
          data={rows}
          xKey="t"
          yKeys={['value']}
          domain={domain}
          padding={{ left: 0, right: 4, top: 4, bottom: 0 }}
          domainPadding={{ top: 16, bottom: 12, left: 12, right: 12 }}
          chartPressState={state}
          chartPressConfig={{ pan: { activateAfterLongPress: 120 } }}
          frame={{ lineWidth: 0 }}
          xAxis={{
            font,
            tickCount: Math.min(4, rows.length),
            labelColor: t.colors.textFaint,
            lineColor: 'transparent',
            formatXLabel: (v) => (typeof v === 'number' ? (spanYears ? shortDate(v, true) : shortDate(v, false)) : ''),
          }}
          yAxis={[
            {
              font,
              tickCount: 4,
              labelColor: t.colors.textFaint,
              lineColor: t.colors.border,
              formatYLabel: (v) => formatAxisValue(Number(v)),
            },
          ]}
        >
          {({ points, chartBounds }) => (
            <>
              {rows.length > 1 ? (
                <Line
                  points={points.value}
                  color={stroke}
                  strokeWidth={2.5}
                  curveType="monotoneX"
                  animate={{ type: 'timing', duration: 250 }}
                />
              ) : null}
              <Scatter points={points.value} radius={rows.length > 40 ? 0 : 3.5} color={stroke} />
              {isActive ? (
                <PressIndicator
                  x={state.x.position}
                  y={state.y.value.position}
                  bounds={chartBounds}
                  color={stroke}
                  ringColor={t.colors.surface}
                />
              ) : null}
            </>
          )}
        </CartesianChart>
      </View>
    </View>
  );
}
