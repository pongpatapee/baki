import { memo } from 'react';
import { View } from 'react-native';

import { Button, Card, IconButton, Row, Text } from '@/components/ui';
import type { RoutineRow } from '@/db/schema';
import { useTheme } from '@/theme/AppProviders';

export const RoutineCard = memo(function RoutineCard({
  routine,
  exerciseNames,
  onOpen,
  onStart,
  onMenu,
}: {
  routine: RoutineRow;
  exerciseNames: string[];
  onOpen: (id: string) => void;
  onStart: (id: string) => void;
  onMenu: (routine: RoutineRow) => void;
}) {
  const t = useTheme();
  const preview = exerciseNames.length ? exerciseNames.join(', ') : 'No exercises yet';
  return (
    <Card onPress={() => onOpen(routine.id)} onLongPress={() => onMenu(routine)} style={{ gap: t.spacing(3) }}>
      <Row align="flex-start" gap={2}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="heading" numberOfLines={1}>
            {routine.name}
          </Text>
          <Text variant="label" muted weight="400" numberOfLines={2}>
            {preview}
          </Text>
        </View>
        <IconButton
          icon="ellipsis-horizontal"
          accessibilityLabel={`Options for ${routine.name}`}
          onPress={() => onMenu(routine)}
          color={t.colors.textMuted}
        />
      </Row>
      <Button title="Start Routine" onPress={() => onStart(routine.id)} />
    </Card>
  );
});
