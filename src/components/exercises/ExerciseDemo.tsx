/**
 * Exercise demonstration: crossfades between the start and end position photos so it reads like a
 * short animation (like Hevy's demos). Static start photo when the OS "reduce motion" setting is on.
 * Renders nothing for exercises without bundled photos (custom exercises, unmapped seeds).
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

import { EXERCISE_IMAGES } from '@/db/seed/exerciseImages';
import { useTheme } from '@/theme/AppProviders';

const HOLD_MS = 1100;
const FADE_MS = 350;
/** Source photos are 3:2. */
const ASPECT = 3 / 2;

export function hasExerciseDemo(exerciseId: string): boolean {
  return EXERCISE_IMAGES[exerciseId] != null;
}

export function ExerciseDemo({ exerciseId }: { exerciseId: string }) {
  const t = useTheme();
  const frames = EXERCISE_IMAGES[exerciseId];
  const [endOpacity] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduceMotion(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!frames || reduceMotion) {
      endOpacity.setValue(0);
      return;
    }
    const fade = (toValue: number) =>
      Animated.timing(endOpacity, {
        toValue,
        duration: FADE_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
    const loop = Animated.loop(
      Animated.sequence([Animated.delay(HOLD_MS), fade(1), Animated.delay(HOLD_MS), fade(0)]),
    );
    loop.start();
    return () => loop.stop();
  }, [frames, reduceMotion, endOpacity]);

  if (!frames) return null;
  const [start, end] = frames;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Exercise demonstration"
      style={{
        width: '100%',
        aspectRatio: ASPECT,
        borderRadius: t.radius.lg,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
      }}
    >
      <Image source={start} style={{ position: 'absolute', inset: 0 }} contentFit="cover" />
      <Animated.View style={{ position: 'absolute', inset: 0, opacity: endOpacity }}>
        <Image source={end} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      </Animated.View>
    </View>
  );
}
