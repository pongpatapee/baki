/**
 * Cross-screen contract for picking exercises.
 *
 *   pickExercises({ multiple: true, title: 'Add Exercises' }, (ids) => { ... });
 *
 * opens the `/exercise-picker` modal; the modal calls `resolvePick(ids)` when the user confirms
 * (or `cancelPick()` on dismiss). The callback receives exercise ids in the order they were selected.
 */
import { router } from 'expo-router';
import { create } from 'zustand';

export interface PickerOptions {
  multiple?: boolean;
  title?: string;
  /** Label for the confirm button in multi-select mode, e.g. "Add 3 exercises". */
  confirmLabel?: string;
  /** Exercise ids to hide from the list (e.g. the exercise being merged). */
  excludeIds?: string[];
}

interface PickerState {
  options: PickerOptions;
  callback: ((ids: string[]) => void) | null;
}

export const useExercisePicker = create<PickerState>(() => ({ options: {}, callback: null }));

export function pickExercises(options: PickerOptions, onPick: (ids: string[]) => void): void {
  useExercisePicker.setState({ options, callback: onPick });
  router.push('/exercise-picker');
}

export function resolvePick(ids: string[]): void {
  const cb = useExercisePicker.getState().callback;
  useExercisePicker.setState({ callback: null });
  if (cb && ids.length > 0) cb(ids);
}

export function cancelPick(): void {
  useExercisePicker.setState({ callback: null });
}
