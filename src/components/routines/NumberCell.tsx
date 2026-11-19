import { useState } from 'react';
import { TextInput, type KeyboardTypeOptions } from 'react-native';

import { useTheme } from '@/theme/AppProviders';

/**
 * Compact numeric input for set tables. Keeps the raw text while typing (so "12." or "1:" are
 * allowed) and reports parsed values upward; re-syncs only when the value changes externally.
 */
export function NumberCell<V>({
  value,
  format,
  parse,
  onChange,
  placeholder,
  keyboardType = 'decimal-pad',
  accessibilityLabel,
}: {
  value: V | null;
  format: (v: V) => string;
  parse: (text: string) => V | null;
  onChange: (v: V | null) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const [text, setText] = useState(() => (value == null ? '' : format(value)));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    // External change: only overwrite the text when it no longer represents the value.
    setPrevValue(value);
    if (parse(text) !== value) setText(value == null ? '' : format(value));
  }

  return (
    <TextInput
      value={text}
      onChangeText={(s) => {
        setText(s);
        onChange(parse(s));
      }}
      onBlur={() => setText(value == null ? '' : format(value))}
      placeholder={placeholder}
      placeholderTextColor={t.colors.textFaint}
      selectionColor={t.colors.primary}
      keyboardType={keyboardType}
      selectTextOnFocus
      accessibilityLabel={accessibilityLabel}
      style={{
        flex: 1,
        minWidth: 0,
        textAlign: 'center',
        color: t.colors.text,
        fontSize: t.font.size.md,
        fontWeight: t.font.weight.semibold,
        backgroundColor: t.colors.surfaceAlt,
        borderRadius: t.radius.sm,
        paddingVertical: 7,
        paddingHorizontal: 4,
      }}
    />
  );
}
