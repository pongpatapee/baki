import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme/AppProviders';

/** Vertical single-choice list inside a card, with a checkmark on the selected row. */
export function OptionList<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string; description?: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.colors.border,
        overflow: 'hidden',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: t.spacing(4),
              paddingVertical: t.spacing(3),
              gap: t.spacing(3),
              borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: t.colors.border,
              backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
            })}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text weight={active ? '600' : '400'}>{o.label}</Text>
              {o.description ? (
                <Text variant="caption" muted>
                  {o.description}
                </Text>
              ) : null}
            </View>
            {active ? <Ionicons name="checkmark" size={20} color={t.colors.primary} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
