import { View } from 'react-native';

import { Text } from '@/components/ui';
import { trimNumber } from '@/domain/units';
import { useTheme } from '@/theme/AppProviders';

/**
 * Side view of one loaded barbell sleeve: plates as coloured rectangles, heaviest nearest the
 * collar. Plate height scales with weight; colours come from the theme's chart palette, assigned
 * by the plate's rank among the available plates so a given plate always has the same colour.
 */
export function PlateVisual({ plates, available }: { plates: readonly number[]; available: readonly number[] }) {
  const t = useTheme();
  const sorted = [...available].sort((a, b) => b - a);
  const max = sorted[0] ?? 1;
  const colorOf = (p: number) => plateColor(t, p, sorted);
  const thin = plates.length > 10;
  return (
    <View style={{ height: 150, flexDirection: 'row', alignItems: 'center' }}>
      {/* bar shaft */}
      <View style={{ width: 28, height: 12, backgroundColor: t.colors.textFaint, borderRadius: 2 }} />
      {/* collar */}
      <View style={{ width: 8, height: 34, backgroundColor: t.colors.textMuted, borderRadius: 2 }} />
      {plates.map((p, i) => {
        const h = 40 + 105 * Math.sqrt(p / max);
        return (
          <View
            key={i}
            style={{
              width: thin ? 14 : 20,
              height: h,
              marginLeft: 2,
              borderRadius: 4,
              backgroundColor: colorOf(p),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {!thin ? (
              <Text
                variant="caption"
                weight="700"
                color={t.colors.onPrimary}
                style={{ fontSize: 9, transform: [{ rotate: '-90deg' }], width: 40, textAlign: 'center' }}
                numberOfLines={1}
              >
                {trimNumber(p, 2)}
              </Text>
            ) : null}
          </View>
        );
      })}
      {/* sleeve end */}
      <View
        style={{
          flex: 1,
          height: 16,
          marginLeft: 2,
          backgroundColor: t.colors.surfaceAlt,
          borderTopRightRadius: 3,
          borderBottomRightRadius: 3,
        }}
      />
    </View>
  );
}

export function plateColor(theme: ReturnType<typeof useTheme>, plate: number, available: readonly number[]): string {
  const sorted = [...available].sort((a, b) => b - a);
  const idx = sorted.findIndex((x) => Math.abs(x - plate) < 1e-6);
  return theme.colors.chart[(idx < 0 ? 0 : idx) % theme.colors.chart.length]!;
}
