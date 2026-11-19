/**
 * Starting workouts. The workout itself lives in SQLite (the row with endedAt = null) and screens
 * read it with live queries, so it survives the app being killed. Nothing here holds workout data.
 */
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { create } from 'zustand';

import {
  discardWorkout,
  getActiveWorkout,
  startEmptyWorkout,
  startWorkoutFromRoutine,
  startWorkoutFromWorkout,
} from '@/db/repositories/workouts';

import { skipRestTimer } from './restTimer';

export interface StartWorkoutOptions {
  /** Start from this routine (targets prefilled). */
  routineId?: string;
  /** "Repeat workout": copy the exercises and sets of this finished workout. */
  fromWorkoutId?: string;
}

type Choice = 'resume' | 'discard' | 'cancel';

function askAboutExisting(title: string): Promise<Choice> {
  return new Promise((resolve) => {
    Alert.alert(
      'Workout in progress',
      `"${title}" is still running. Resume it, or discard it and start a new one?`,
      [
        { text: 'Resume', onPress: () => resolve('resume') },
        { text: 'Discard & Start New', style: 'destructive', onPress: () => resolve('discard') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });
}

let starting = false;

/**
 * Starts a workout (empty, from a routine, or repeating a past one) and opens the live screen.
 * If one is already in progress the user chooses between resuming it and discarding it.
 */
export async function startWorkout(opts: StartWorkoutOptions = {}): Promise<void> {
  if (starting) return;
  starting = true;
  try {
    const existing = await getActiveWorkout();
    if (existing) {
      const choice = await askAboutExisting(existing.title);
      if (choice === 'cancel') return;
      if (choice === 'resume') {
        router.push('/workout/active');
        return;
      }
      await discardWorkout(existing.id);
    }
    skipRestTimer();
    if (opts.routineId) await startWorkoutFromRoutine(opts.routineId);
    else if (opts.fromWorkoutId) await startWorkoutFromWorkout(opts.fromWorkoutId);
    else await startEmptyWorkout();
    router.push('/workout/active');
  } catch (e) {
    Alert.alert('Could not start workout', e instanceof Error ? e.message : String(e));
  } finally {
    starting = false;
  }
}

/** Ephemeral UI state of the live workout screen (never workout data). */
interface ActiveWorkoutUiState {
  /** Set while finishing/discarding so the screen doesn't flash "no workout". */
  leaving: boolean;
}

export const useActiveWorkoutUi = create<ActiveWorkoutUiState>(() => ({ leaving: false }));
