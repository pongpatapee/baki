/**
 * Cross-platform text prompt (Alert.prompt is iOS-only).
 *
 *   const prompt = usePrompt();
 *   prompt.show({ title: 'Rename Folder', initialValue: name, onSubmit: (v) => ... });
 *   return <>{...}{prompt.element}</>;
 */
import { useCallback, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Row, Text, TextField } from '@/components/ui';
import { useTheme } from '@/theme/AppProviders';

export interface PromptRequest {
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
}

export function usePrompt(): { show: (req: PromptRequest) => void; element: ReactNode } {
  const [state, setState] = useState<{ req: PromptRequest | null; n: number }>({ req: null, n: 0 });
  const show = useCallback((req: PromptRequest) => setState((s) => ({ req, n: s.n + 1 })), []);
  const close = useCallback(() => setState((s) => ({ req: null, n: s.n })), []);
  // Keyed per request so the text field starts from `initialValue` every time.
  const element = <PromptDialog key={state.n} request={state.req} onClose={close} />;
  return { show, element };
}

function PromptDialog({ request, onClose }: { request: PromptRequest | null; onClose: () => void }) {
  const t = useTheme();
  const [value, setValue] = useState(request?.initialValue ?? '');
  const submit = () => {
    const v = value.trim();
    if (!v || !request) return;
    onClose();
    request.onSubmit(v);
  };
  return (
    <Modal visible={request != null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', padding: t.spacing(6) }}
      >
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} onPress={onClose} />
        <View
          style={{
            backgroundColor: t.colors.surface,
            borderRadius: t.radius.lg,
            padding: t.spacing(5),
            gap: t.spacing(3),
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.colors.border,
          }}
        >
          <Text variant="heading">{request?.title}</Text>
          {request?.message ? <Text muted>{request.message}</Text> : null}
          <TextField
            autoFocus
            value={value}
            onChangeText={setValue}
            placeholder={request?.placeholder}
            returnKeyType="done"
            onSubmitEditing={submit}
            selectTextOnFocus
          />
          <Row justify="flex-end" gap={2}>
            <Button title="Cancel" variant="ghost" onPress={onClose} />
            <Button title={request?.confirmLabel ?? 'Save'} onPress={submit} disabled={!value.trim()} />
          </Row>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
