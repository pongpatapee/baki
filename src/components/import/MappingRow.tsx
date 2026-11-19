import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Badge, Chip, Row, Text } from '@/components/ui';
import type { HevyMappingTarget } from '@/db/repositories/importExport';
import type { MatchSuggestion } from '@/import/exerciseMatch';
import { EXERCISE_TYPE_LABELS } from '@/domain/types';
import { useTheme } from '@/theme/AppProviders';

export interface MappingRowProps {
  title: string;
  setCount: number;
  target: HevyMappingTarget;
  /** Name of the mapped library exercise when target.kind === 'existing'. */
  targetName?: string;
  exact: boolean;
  suggestion?: MatchSuggestion;
  onPress: () => void;
  onAcceptSuggestion: () => void;
}

export function MappingRow({ title, setCount, target, targetName, exact, suggestion, onPress, onAcceptSuggestion }: MappingRowProps) {
  const t = useTheme();
  const status =
    target.kind === 'existing'
      ? { icon: 'checkmark-circle' as const, color: t.colors.success, text: targetName ?? 'Library exercise' }
      : target.kind === 'create'
        ? { icon: 'add-circle' as const, color: t.colors.warning, text: `New custom · ${EXERCISE_TYPE_LABELS[target.exerciseType]}` }
        : { icon: 'remove-circle' as const, color: t.colors.textFaint, text: 'Skipped (not imported)' };
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingVertical: t.spacing(3), opacity: pressed ? 0.6 : 1, gap: t.spacing(1.5) })}>
      <Row justify="space-between" align="flex-start">
        <View style={{ flex: 1, gap: 2 }}>
          <Text weight="600" numberOfLines={2}>
            {title}
          </Text>
          <Row gap={1.5}>
            <Ionicons name={status.icon} size={15} color={status.color} />
            <Text variant="label" muted numberOfLines={1} style={{ flex: 1 }}>
              {target.kind === 'existing' ? '→ ' : ''}
              {status.text}
            </Text>
          </Row>
        </View>
        <Row gap={1}>
          {target.kind === 'existing' && exact ? <Badge label="Match" color={t.colors.success} /> : null}
          <Text variant="caption" faint>
            {setCount} sets
          </Text>
          <Ionicons name="chevron-forward" size={16} color={t.colors.textFaint} />
        </Row>
      </Row>
      {target.kind !== 'existing' && suggestion ? (
        <Row gap={2}>
          <Text variant="caption" muted>
            Did you mean
          </Text>
          <Chip label={suggestion.name} icon="swap-horizontal" onPress={onAcceptSuggestion} />
        </Row>
      ) : null}
    </Pressable>
  );
}
