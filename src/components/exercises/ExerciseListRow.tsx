import { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Badge, ExerciseAvatar, Text } from '@/components/ui';
import type { ExerciseRow } from '@/db/schema';
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from '@/domain/types';
import { useTheme } from '@/theme/AppProviders';

export function exerciseSubtitle(e: Pick<ExerciseRow, 'primaryMuscle' | 'equipment'>): string {
  const muscle = MUSCLE_GROUP_LABELS[e.primaryMuscle];
  return e.equipment === 'none' ? muscle : `${muscle} · ${EQUIPMENT_LABELS[e.equipment]}`;
}

export const ExerciseListRow = memo(function ExerciseListRow({
  exercise,
  onPress,
  onLongPress,
  selected,
  right,
}: {
  exercise: ExerciseRow;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing(3),
        paddingVertical: t.spacing(2.5),
        paddingHorizontal: t.spacing(4),
        backgroundColor: selected ? t.colors.primaryMuted : pressed ? t.colors.surfaceAlt : 'transparent',
      })}
    >
      {selected ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: t.colors.primary }} /> : null}
      <ExerciseAvatar name={exercise.name} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="600" numberOfLines={1}>
          {exercise.name}
        </Text>
        <Text variant="label" muted weight="400" numberOfLines={1}>
          {exerciseSubtitle(exercise)}
        </Text>
      </View>
      {exercise.isCustom ? <Badge label="Custom" color={t.colors.chart[1]} /> : null}
      {right}
    </Pressable>
  );
});
