/**
 * Cross-platform action sheet.
 *
 *   const sheet = useActionSheet();
 *   sheet.show({ title: 'Routine', options: [{ label: 'Edit', onPress: edit }] });
 *   return <>{...}{sheet.element}</>;
 *
 * iOS uses the native ActionSheetIOS; Android (where Alert supports at most 3 buttons) renders a
 * themed bottom sheet, so `element` must be rendered somewhere in the screen.
 */
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/AppProviders';

export interface SheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: IconName;
  /** Shows a checkmark (Android sheet) / is listed first (iOS has no checkmarks). */
  selected?: boolean;
}

export interface SheetRequest {
  title?: string;
  message?: string;
  options: SheetOption[];
}

/** Runs `fn` once a just-dismissed sheet has finished animating out, before presenting another modal. */
export function afterSheet(fn: () => void): void {
  setTimeout(fn, 350);
}

export function useActionSheet(): { show: (req: SheetRequest) => void; element: ReactNode } {
  const t = useTheme();
  const [req, setReq] = useState<SheetRequest | null>(null);

  const show = useCallback(
    (r: SheetRequest) => {
      if (Platform.OS === 'ios') {
        const labels = r.options.map((o) => (o.selected ? `✓ ${o.label}` : o.label));
        const destructive = r.options.flatMap((o, i) => (o.destructive ? [i] : []));
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: r.title,
            message: r.message,
            options: [...labels, 'Cancel'],
            cancelButtonIndex: labels.length,
            destructiveButtonIndex: destructive.length ? destructive : undefined,
            userInterfaceStyle: t.dark ? 'dark' : 'light',
            tintColor: t.colors.primary,
          },
          (i) => {
            if (i < r.options.length) r.options[i]!.onPress();
          },
        );
        return;
      }
      setReq(r);
    },
    [t],
  );

  const close = () => setReq(null);
  const element = <AndroidSheet request={req} onClose={close} />;
  return { show, element };
}

function AndroidSheet({ request, onClose }: { request: SheetRequest | null; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={request != null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} onPress={onClose} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '75%',
          backgroundColor: t.colors.surface,
          borderTopLeftRadius: t.radius.lg,
          borderTopRightRadius: t.radius.lg,
          paddingBottom: insets.bottom + t.spacing(2),
          paddingTop: t.spacing(2),
        }}
      >
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: t.colors.border }} />
        {request?.title || request?.message ? (
          <View style={{ paddingHorizontal: t.spacing(5), paddingTop: t.spacing(3), gap: 2 }}>
            {request.title ? (
              <Text variant="heading" numberOfLines={2}>
                {request.title}
              </Text>
            ) : null}
            {request.message ? <Text muted>{request.message}</Text> : null}
          </View>
        ) : null}
        <ScrollView style={{ marginTop: t.spacing(2) }}>
          {request?.options.map((o, i) => {
            const color = o.destructive ? t.colors.danger : t.colors.text;
            return (
              <Pressable
                key={`${o.label}-${i}`}
                onPress={() => {
                  onClose();
                  o.onPress();
                }}
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
                <Text color={color} style={{ flex: 1 }}>
                  {o.label}
                </Text>
                {o.selected ? <Ionicons name="checkmark" size={20} color={t.colors.primary} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
