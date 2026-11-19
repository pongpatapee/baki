/**
 * Baki UI kit. Small, theme-aware primitives used by every screen.
 * Prefer these over raw RN components so the app looks consistent in light and dark.
 */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextProps as RNTextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/AppProviders';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ---------- Text ----------

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  muted?: boolean;
  faint?: boolean;
  color?: string;
  weight?: TextStyle['fontWeight'];
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', muted, faint, color, weight, align, style, ...rest }: TextProps) {
  const t = useTheme();
  const v: Record<TextVariant, TextStyle> = {
    display: { fontSize: t.font.size.display, fontWeight: t.font.weight.heavy, letterSpacing: -0.5 },
    title: { fontSize: t.font.size.xxl, fontWeight: t.font.weight.bold, letterSpacing: -0.3 },
    heading: { fontSize: t.font.size.lg, fontWeight: t.font.weight.semibold },
    body: { fontSize: t.font.size.md },
    label: { fontSize: t.font.size.sm, fontWeight: t.font.weight.medium },
    caption: { fontSize: t.font.size.xs },
  };
  const c = color ?? (faint ? t.colors.textFaint : muted ? t.colors.textMuted : t.colors.text);
  return (
    <RNText
      style={[v[variant], { color: c }, weight ? { fontWeight: weight } : null, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}

// ---------- Layout ----------

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Safe-area edges to pad. Screens under a native header usually want ['bottom'] or []. */
  edges?: Edge[];
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
}

export function Screen({
  children,
  scroll,
  edges = [],
  padded = true,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
}: ScreenProps) {
  const t = useTheme();
  const pad = padded ? { padding: t.spacing(4) } : null;
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: t.colors.background }, style]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: t.spacing(12) }, contentContainerStyle]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode="on-drag"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Row({
  children,
  gap = 2,
  align = 'center',
  justify,
  style,
  wrap,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: align, justifyContent: justify, gap: t.spacing(gap) },
        wrap ? { flexWrap: 'wrap' } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Spacer({ size = 4 }: { size?: number }) {
  const t = useTheme();
  return <View style={{ height: t.spacing(size) }} />;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border }, style]} />;
}

export function Card({
  children,
  style,
  onPress,
  onLongPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const t = useTheme();
  const cardStyle: ViewStyle = {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    padding: t.spacing(4),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  };
  if (!onPress && !onLongPress) return <View style={[cardStyle, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [cardStyle, pressed ? { opacity: 0.75 } : null, style]}
    >
      {children}
    </Pressable>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <Row justify="space-between" style={{ marginTop: t.spacing(5), marginBottom: t.spacing(2) }}>
      <Text variant="label" muted style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {title}
      </Text>
      {action}
    </Row>
  );
}

// ---------- Buttons ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: ButtonVariant;
  icon?: IconName;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  variant = 'primary',
  icon,
  size = 'md',
  loading,
  disabled,
  fullWidth,
  style,
  ...rest
}: ButtonProps) {
  const t = useTheme();
  const bg: Record<ButtonVariant, string> = {
    primary: t.colors.primary,
    secondary: t.colors.surfaceAlt,
    ghost: 'transparent',
    danger: t.colors.primaryMuted,
    success: t.colors.success,
  };
  const fg: Record<ButtonVariant, string> = {
    primary: t.colors.onPrimary,
    secondary: t.colors.text,
    ghost: t.colors.primary,
    danger: t.colors.danger,
    success: '#FFFFFF',
  };
  const pad = { sm: [6, 12], md: [11, 16], lg: [15, 20] }[size];
  const fontSize = { sm: t.font.size.sm, md: t.font.size.md, lg: t.font.size.lg }[size];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg[variant],
          paddingVertical: pad[0],
          paddingHorizontal: pad[1],
          borderRadius: t.radius.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.spacing(2),
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        fullWidth ? { alignSelf: 'stretch' } : null,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={fontSize + 3} color={fg[variant]} /> : null}
          <Text style={{ color: fg[variant], fontSize, fontWeight: t.font.weight.semibold }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color,
  size = 22,
  accessibilityLabel,
  disabled,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [{ padding: 6, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }, style]}
    >
      <Ionicons name={icon} size={size} color={color ?? t.colors.text} />
    </Pressable>
  );
}

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.colors.text} />;
}

// ---------- Inputs ----------

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({ label, error, style, containerStyle, ...rest }: TextFieldProps) {
  const t = useTheme();
  return (
    <View style={[{ gap: t.spacing(1.5) }, containerStyle]}>
      {label ? (
        <Text variant="label" muted>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={t.colors.textFaint}
        selectionColor={t.colors.primary}
        style={[
          {
            backgroundColor: t.colors.surfaceAlt,
            color: t.colors.text,
            borderRadius: t.radius.md,
            paddingHorizontal: t.spacing(3),
            paddingVertical: t.spacing(2.5),
            fontSize: t.font.size.md,
            borderWidth: 1,
            borderColor: error ? t.colors.danger : 'transparent',
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" color={t.colors.danger}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function SearchField(props: TextInputProps) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: t.colors.surfaceAlt,
        borderRadius: t.radius.md,
        paddingHorizontal: t.spacing(3),
        gap: t.spacing(2),
      }}
    >
      <Ionicons name="search" size={18} color={t.colors.textFaint} />
      <TextInput
        placeholder="Search"
        placeholderTextColor={t.colors.textFaint}
        selectionColor={t.colors.primary}
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={{ flex: 1, color: t.colors.text, paddingVertical: t.spacing(2.5), fontSize: t.font.size.md }}
        {...props}
      />
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  icon?: IconName;
}) {
  const t = useTheme();
  const accent = color ?? t.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: t.radius.pill,
        backgroundColor: selected ? accent : t.colors.surfaceAlt,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? t.colors.onPrimary : t.colors.textMuted} /> : null}
      <Text variant="label" color={selected ? t.colors.onPrimary : t.colors.textMuted}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Segmented control for 2-5 options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.colors.surfaceAlt,
        borderRadius: t.radius.md,
        padding: 3,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: t.radius.sm,
              alignItems: 'center',
              backgroundColor: active ? t.colors.surface : 'transparent',
            }}
          >
            <Text variant="label" color={active ? t.colors.text : t.colors.textMuted}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Lists & states ----------

export function ListItem({
  title,
  subtitle,
  left,
  right,
  onPress,
  onLongPress,
  chevron,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing(3),
        paddingVertical: t.spacing(3),
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="500" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="label" muted numberOfLines={1} weight="400">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={t.colors.textFaint} /> : null}
    </Pressable>
  );
}

/** Round letter avatar for an exercise (no images are bundled). */
export function ExerciseAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const t = useTheme();
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text weight="700" muted style={{ fontSize: size * 0.42 }}>
        {letter}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon = 'barbell-outline',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: t.spacing(8), gap: t.spacing(3) }}>
      <Ionicons name={icon} size={44} color={t.colors.textFaint} />
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text muted align="center">
          {message}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.background }}>
      <ActivityIndicator color={t.colors.primary} />
    </View>
  );
}

/** Small stat block: big value with a caption, used on summaries and dashboards. */
export function Stat({ label, value, icon }: { label: string; value: string; icon?: IconName }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Row gap={1}>
        {icon ? <Ionicons name={icon} size={13} color={t.colors.textMuted} /> : null}
        <Text variant="caption" muted>
          {label}
        </Text>
      </Row>
      <Text variant="heading" weight="700">
        {value}
      </Text>
    </View>
  );
}

export function Badge({ label, color }: { label: string; color?: string }) {
  const t = useTheme();
  const c = color ?? t.colors.primary;
  return (
    <View style={{ backgroundColor: c + '26', paddingHorizontal: 8, paddingVertical: 2, borderRadius: t.radius.pill }}>
      <Text variant="caption" weight="700" color={c}>
        {label}
      </Text>
    </View>
  );
}
