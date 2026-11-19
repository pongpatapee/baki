import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Bar, CartesianChart, useChartPressState } from 'victory-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme/AppProviders';

import { ChartEmpty } from './ChartEmpty';
import { compactNumber, evenIndices, useChartFont } from './chartUtils';
import { PressIndicator } from './PressIndicator';

export interface BarDatum {
  /** Label for the x axis / pressed caption (e.g. "Jan 6"). */
  label: string;
  value: number;
}

export interface BarChartProps {
  data: readonly BarDatum[];
  title?: string;
  formatValue: (v: number) => string;
  formatAxisValue?: (v: number) => string;
  /** Header shown when nothing is pressed (e.g. weekly average). */
  summary?: { value: string; caption: string };
  height?: number;
  color?: string;
  emptyMessage?: string;
  /** Caption prefix for a pressed bar, e.g. "Week of". */
  pressedPrefix?: string;
}

/** Category bar chart (weekly totals etc.). Press and hold to read a bar's value. */
export function BarChart({
  data,
  title,
  formatValue,
  formatAxisValue = compactNumber,
  summary,
  height = 180,
  color,
  emptyMessage = 'No data yet',
  pressedPrefix,
}: BarChartProps) {
  const t = useTheme();
  const font = useChartFont();
  const fill = color ?? t.colors.primary;
  const { state, isActive } = useChartPressState({ x: 0, y: { value: 0 } });
  const [active, setActive] = useState(-1);
  const onIndex = useCallback((i: number) => setActive(i), []);
  useAnimatedReaction(
    () => (state.isActive.value ? state.matchedIndex.value : -1),
    (i, prev) => {
      if (i !== prev) scheduleOnRN(onIndex, i);
    },
  );

  const rows = useMemo(() => data.map((d, i) => ({ x: i, value: d.value })), [data]);
  const ticks = useMemo(() => evenIndices(rows.length, 4), [rows.length]);
  const hasValues = rows.some((r) => r.value > 0);

  const pressed = isActive && active >= 0 ? data[active] : undefined;
  const header = pressed
    ? { value: formatValue(pressed.value), caption: `${pressedPrefix ? pressedPrefix + ' ' : ''}${pressed.label}` }
    : summary;

  return (
    <View style={{ gap: t.spacing(2) }}>
      {title ? (
        <Text variant="label" muted>
          {title}
        </Text>
      ) : null}
      {header && hasValues ? (
        <View style={{ minHeight: 42 }}>
          <Text variant="heading" weight="700" style={{ fontSize: 22 }}>
            {header.value}
          </Text>
          <Text variant="caption" muted>
            {header.caption}
          </Text>
        </View>
      ) : null}
      {!hasValues ? (
        <ChartEmpty height={height} message={emptyMessage} />
      ) : (
        <View style={{ height }}>
          <CartesianChart
            data={rows}
            xKey="x"
            yKeys={['value']}
            domain={{ y: [0] }}
            padding={{ left: 0, right: 4, top: 4, bottom: 0 }}
            domainPadding={{ left: rows.length > 1 ? 14 : 40, right: rows.length > 1 ? 14 : 40, top: 12 }}
            chartPressState={state}
            chartPressConfig={{ pan: { activateAfterLongPress: 120 } }}
            frame={{ lineWidth: 0 }}
            xAxis={{
              font,
              tickValues: ticks,
              labelColor: t.colors.textFaint,
              lineColor: 'transparent',
              formatXLabel: (v) => data[Math.round(Number(v))]?.label ?? '',
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
                <Bar
                  points={points.value}
                  chartBounds={chartBounds}
                  color={fill}
                  innerPadding={rows.length > 30 ? 0.2 : 0.35}
                  roundedCorners={{ topLeft: 3, topRight: 3 }}
                  animate={{ type: 'timing', duration: 250 }}
                />
                {isActive ? (
                  <PressIndicator
                    x={state.x.position}
                    y={state.y.value.position}
                    bounds={chartBounds}
                    color={t.colors.text}
                    ringColor={t.colors.surface}
                  />
                ) : null}
              </>
            )}
          </CartesianChart>
        </View>
      )}
    </View>
  );
}
