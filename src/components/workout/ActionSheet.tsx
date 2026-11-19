/**
 * Bottom sheet with a list of actions (RN Modal based, works on iOS and Android).
 * Option handlers run after the sheet has fully closed, so they can safely navigate or open
 * another sheet/modal.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/AppProviders';

export interface SheetOption {
  key: string;
  label: string;
  icon?: IconName;
  /** Accent for the icon/label (e.g. set type colors). */
  color?: string;
  destructive?: boolean;
  selected?: boolean;
  onPress: () => void;
}

export function ActionSheet({
  visible,
  title,
  subtitle,
  options = [],
  onClose,
  children,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  options?: SheetOption[];
  onClose: () => void;
  children?: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const pending = useRef<(() => void) | null>(null);

  const flush = () => {
    const fn = pending.current;
    pending.current = null;
    fn?.();
  };

  // iOS runs the pending action in onDismiss (after the native modal is gone); elsewhere once hidden.
  useEffect(() => {
    if (!visible && Platform.OS !== 'ios') {
      const id = setTimeout(flush, 0);
      return () => clearTimeout(id);
    }
  }, [visible]);

  const choose = (o: SheetOption) => {
    pending.current = o.onPress;
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={flush}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View
          style={{
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: t.radius.lg,
            borderTopRightRadius: t.radius.lg,
            paddingTop: t.spacing(2),
            paddingBottom: insets.bottom + t.spacing(2),
            maxHeight: '80%',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.colors.border,
              marginBottom: t.spacing(2),
            }}
          />
          {title ? (
            <View style={{ paddingHorizontal: t.spacing(4), paddingBottom: t.spacing(2), gap: 2 }}>
              <Text variant="heading" align="center">
                {title}
              </Text>
              {subtitle ? (
                <Text variant="label" muted align="center" weight="400">
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : null}
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            {children}
            {options.map((o) => {
              const color = o.destructive ? t.colors.danger : (o.color ?? t.colors.text);
              return (
                <Pressable
                  key={o.key}
                  onPress={() => choose(o)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !!o.selected }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing(3),
                    paddingHorizontal: t.spacing(5),
                    paddingVertical: t.spacing(3.5),
                    backgroundColor: pressed ? t.colors.surfaceAlt : 'transparent',
                  })}
                >
                  {o.icon ? <Ionicons name={o.icon} size={20} color={color} /> : null}
                  <Text style={{ flex: 1 }} color={color} weight="500">
                    {o.label}
                  </Text>
                  {o.selected ? <Ionicons name="checkmark" size={20} color={t.colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
