/**
 * Inline-editable workout title and notes (commit on end editing). The inputs are keyed by the
 * stored value, so an external change resets the local text without syncing state in an effect.
 */
import { useState } from 'react';
import { TextInput } from 'react-native';

import { updateWorkout } from '@/db/repositories/workouts';
import type { WorkoutRow } from '@/db/schema';
import { useTheme } from '@/theme/AppProviders';

export function TitleField({ workout }: { workout: WorkoutRow }) {
  return <TitleInput key={workout.title} workout={workout} />;
}

function TitleInput({ workout }: { workout: WorkoutRow }) {
  const t = useTheme();
  const [title, setTitle] = useState(workout.title);
  return (
    <TextInput
      value={title}
      onChangeText={setTitle}
      onEndEditing={() => {
        const v = title.trim();
        if (!v) setTitle(workout.title);
        else if (v !== workout.title) void updateWorkout(workout.id, { title: v });
      }}
      placeholder="Workout title"
      placeholderTextColor={t.colors.textFaint}
      selectionColor={t.colors.primary}
      returnKeyType="done"
      accessibilityLabel="Workout title"
      style={{ color: t.colors.text, fontSize: t.font.size.xxl, fontWeight: '700', paddingVertical: 4 }}
    />
  );
}

export function NotesField({ workout }: { workout: WorkoutRow }) {
  return <NotesInput key={workout.notes ?? ''} workout={workout} />;
}

function NotesInput({ workout }: { workout: WorkoutRow }) {
  const t = useTheme();
  const [notes, setNotes] = useState(workout.notes ?? '');
  return (
    <TextInput
      value={notes}
      onChangeText={setNotes}
      onEndEditing={() => {
        const v = notes.trim() ? notes : null;
        if (v !== workout.notes) void updateWorkout(workout.id, { notes: v });
      }}
      placeholder="Workout notes"
      placeholderTextColor={t.colors.textFaint}
      selectionColor={t.colors.primary}
      multiline
      accessibilityLabel="Workout notes"
      style={{
        color: t.colors.text,
        fontSize: t.font.size.sm,
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.md,
        paddingHorizontal: t.spacing(3),
        paddingVertical: t.spacing(2),
        minHeight: 40,
      }}
    />
  );
}
