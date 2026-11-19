import { useKeepAwake } from 'expo-keep-awake';

import { useSettings } from '@/theme/AppProviders';

const TAG = 'baki-active-workout';

function Active() {
  useKeepAwake(TAG);
  return null;
}

/** Keeps the screen on while mounted, if the "keep awake" setting is enabled. */
export function KeepAwakeWhileWorkout() {
  const { keepAwake } = useSettings();
  return keepAwake ? <Active /> : null;
}
