import { ActivityIndicator, Modal, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme/AppProviders';

/** Blocking progress dialog for long operations (import / restore / rebuild). */
export function ProgressOverlay({ visible, label, fraction }: { visible: boolean; label: string; fraction: number | null }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: t.colors.background + 'CC', alignItems: 'center', justifyContent: 'center', padding: t.spacing(8) }}>
        <View
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: t.colors.surface,
            borderRadius: t.radius.lg,
            padding: t.spacing(5),
            gap: t.spacing(3),
            alignItems: 'center',
          }}
        >
          <ActivityIndicator color={t.colors.primary} />
          <Text weight="600" align="center">
            {label}
          </Text>
          {fraction != null ? <ProgressBar fraction={fraction} /> : null}
        </View>
      </View>
    </Modal>
  );
}

export function ProgressBar({ fraction }: { fraction: number }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: t.colors.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: t.colors.primary }} />
    </View>
  );
}
