import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme/AppProviders';

export function ChartEmpty({ height, message }: { height: number; message: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        height,
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.spacing(2),
        borderRadius: t.radius.md,
        backgroundColor: t.colors.surfaceAlt,
      }}
    >
      <Ionicons name="analytics-outline" size={28} color={t.colors.textFaint} />
      <Text variant="label" faint align="center">
        {message}
      </Text>
    </View>
  );
}
