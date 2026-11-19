import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { Circle, Line as SkLine, vec } from '@shopify/react-native-skia';
import type { ChartBounds } from 'victory-native';

/** Vertical guide + dot drawn at the pressed point (inside a CartesianChart). */
export function PressIndicator({
  x,
  y,
  bounds,
  color,
  ringColor,
}: {
  x: SharedValue<number>;
  y: SharedValue<number>;
  bounds: ChartBounds;
  color: string;
  ringColor: string;
}) {
  const p1 = useDerivedValue(() => vec(x.value, bounds.top));
  const p2 = useDerivedValue(() => vec(x.value, bounds.bottom));
  return (
    <>
      <SkLine p1={p1} p2={p2} color={color} strokeWidth={1} opacity={0.5} />
      <Circle cx={x} cy={y} r={7} color={ringColor} />
      <Circle cx={x} cy={y} r={4.5} color={color} />
    </>
  );
}
