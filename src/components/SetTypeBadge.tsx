/**
 * Set number / set-type label used by the routine builder and the live workout screen.
 *
 *   const nums = workingSetNumbers(sets);
 *   <SetTypeBadge setType={s.setType} index={nums[i]} onPress={() => update(nextSetType(s.setType))} />
 *
 * Normal sets show their 1-based working-set number (`index`); warm-up, failure and drop sets
 * show W / F / D in the set-type color. Use `setTypeSheetOptions` with `useActionSheet`
 * (`@/components/routines/ActionSheet`) to let the user pick a type explicitly.
 */
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { nextSetType, setLabel, workingSetNumbers } from '@/domain/routineEdit';
import { SET_TYPE_LABELS, SET_TYPES, type SetType } from '@/domain/types';
import type { Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/AppProviders';

import type { SheetOption } from './routines/ActionSheet';

export { nextSetType, workingSetNumbers };

export function setTypeColor(t: Theme, setType: SetType): string {
  switch (setType) {
    case 'warmup':
      return t.colors.warmup;
    case 'failure':
      return t.colors.failure;
    case 'drop':
      return t.colors.drop;
    default:
      return t.colors.text;
  }
}

export interface SetTypeBadgeProps {
  setType: SetType;
  /** 1-based working-set number shown for normal sets (see `workingSetNumbers`). */
  index: number | null | undefined;
  onPress?: () => void;
  onLongPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function SetTypeBadge({ setType, index, onPress, onLongPress, size = 30, style }: SetTypeBadgeProps) {
  const t = useTheme();
  const color = setTypeColor(t, setType);
  const label = setLabel(setType, index ?? null);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Set ${label}, ${SET_TYPE_LABELS[setType]}. Tap to change set type.`}
      style={({ pressed }) => [
        {
          minWidth: size,
          height: size,
          paddingHorizontal: 4,
          borderRadius: t.radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: setType === 'normal' ? t.colors.surfaceAlt : color + '26',
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Text weight="700" color={color} style={{ fontSize: t.font.size.sm }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Options for an action sheet that lets the user choose a set type (or remove the set). */
export function setTypeSheetOptions(
  current: SetType,
  onSelect: (t: SetType) => void,
  onRemove?: () => void,
): SheetOption[] {
  const opts: SheetOption[] = SET_TYPES.map((st) => ({
    label: SET_TYPE_LABELS[st],
    selected: st === current,
    onPress: () => onSelect(st),
  }));
  if (onRemove) opts.push({ label: 'Remove Set', destructive: true, icon: 'trash-outline', onPress: onRemove });
  return opts;
}
