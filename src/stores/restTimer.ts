/**
 * Rest timer. Ephemeral (Zustand), but stores an absolute end timestamp so the countdown stays
 * correct across backgrounding. A local notification covers the case where the app is in the
 * background when the rest ends; in the foreground we fire a haptic.
 */
import * as Haptics from 'expo-haptics';
import { create } from 'zustand';

import { cancelRestNotification, scheduleRestNotification } from '@/lib/notifications';

interface RestTimerState {
  /** Absolute epoch ms when the rest ends; null when no timer runs. */
  endAt: number | null;
  /** Length of the current rest including adjustments, for the progress bar. */
  totalSeconds: number;
  /** workout_exercise the rest belongs to (for display). */
  workoutExerciseId: string | null;
}

export const useRestTimer = create<RestTimerState>(() => ({ endAt: null, totalSeconds: 0, workoutExerciseId: null }));

let notificationId: string | null = null;
let generation = 0;
let timeout: ReturnType<typeof setTimeout> | null = null;

function clearLocal() {
  if (timeout) clearTimeout(timeout);
  timeout = null;
  const id = notificationId;
  notificationId = null;
  generation++;
  void cancelRestNotification(id);
}

function arm(endAt: number) {
  const gen = generation;
  const ms = Math.max(0, endAt - Date.now());
  timeout = setTimeout(() => {
    if (gen !== generation) return;
    // Fired late (JS was suspended in the background): the notification already told the user.
    const late = Date.now() - endAt > 2000;
    timeout = null;
    notificationId = null;
    useRestTimer.setState({ endAt: null, totalSeconds: 0, workoutExerciseId: null });
    if (!late) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, ms);
  void scheduleRestNotification(ms / 1000).then((id) => {
    if (gen !== generation) void cancelRestNotification(id);
    else notificationId = id;
  });
}

/** Starts (or restarts) the rest timer. 0 seconds = no timer. */
export function startRestTimer(seconds: number, workoutExerciseId: string | null = null): void {
  clearLocal();
  if (seconds <= 0) {
    useRestTimer.setState({ endAt: null, totalSeconds: 0, workoutExerciseId: null });
    return;
  }
  const endAt = Date.now() + seconds * 1000;
  useRestTimer.setState({ endAt, totalSeconds: seconds, workoutExerciseId });
  arm(endAt);
}

/** Adds (or with a negative value, removes) seconds; ends the timer if it would drop to zero. */
export function adjustRestTimer(deltaSeconds: number): void {
  const { endAt, totalSeconds } = useRestTimer.getState();
  if (endAt == null) return;
  const next = endAt + deltaSeconds * 1000;
  if (next <= Date.now()) {
    skipRestTimer();
    return;
  }
  clearLocal();
  useRestTimer.setState({ endAt: next, totalSeconds: Math.max(1, totalSeconds + deltaSeconds) });
  arm(next);
}

export function skipRestTimer(): void {
  clearLocal();
  useRestTimer.setState({ endAt: null, totalSeconds: 0, workoutExerciseId: null });
}
