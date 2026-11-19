import { useMemo } from 'react';
import { Platform } from 'react-native';
// victory-native 43 renders with the unscoped `react-native-skia` package; fonts must come from the
// same Skia instance as the chart's canvas.
import { matchFont, type SkFont } from '@shopify/react-native-skia';

const FONT_FAMILY = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });

/** System font for axis labels (no bundled font asset needed). */
export function useChartFont(size = 11): SkFont | null {
  return useMemo(() => {
    try {
      return matchFont({ fontFamily: FONT_FAMILY, fontSize: size, fontWeight: 'normal' });
    } catch {
      return null; // labels are skipped rather than crashing the screen
    }
  }, [size]);
}

/** 1234 -> "1.2k", 1250000 -> "1.3M", 82.5 -> "82.5". */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1000)}k`;
  if (abs >= 1000) return `${trim(n / 1000)}k`;
  return trim(n);
}

function trim(n: number): string {
  return String(Math.round(n * 10) / 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jan 5" (or "Jan 5, 2024" when not in the current year). */
export function shortDate(ms: number, withYear?: boolean): string {
  const d = new Date(ms);
  const y = withYear ?? d.getFullYear() !== new Date().getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${y ? `, ${d.getFullYear()}` : ''}`;
}

/** "Jan '25" axis label. */
export function monthLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

/** Up to `count` evenly spaced integer indices in [0, n). */
export function evenIndices(n: number, count: number): number[] {
  if (n <= 0) return [];
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>();
  for (let i = 0; i < count; i++) out.add(Math.round((i * (n - 1)) / (count - 1)));
  return [...out];
}
