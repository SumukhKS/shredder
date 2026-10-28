import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { hardShadow, Radius, Space } from '@/constants/theme';

import { AppText } from './text';
import { useColors } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'md' | 'lg' | 'sm';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
}

/**
 * Chunky button that physically "presses into" its hard shadow. Primary buttons
 * are solid orange, secondary ones raised dark surfaces.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  style,
  haptic = true,
}: ButtonProps) {
  const c = useColors();
  const palette: Record<Variant, { bg: string; fg: string; border: string; shadow: boolean }> = {
    primary: { bg: c.primary, fg: c.onPrimary, border: c.border, shadow: true },
    accent: { bg: c.accent, fg: c.onAccent, border: c.border, shadow: true },
    secondary: { bg: c.surface, fg: c.text, border: c.border, shadow: true },
    danger: { bg: c.surface, fg: c.danger, border: c.danger, shadow: false },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent', shadow: false },
  };
  const p = palette[variant];
  const height = size === 'lg' ? 58 : size === 'sm' ? 38 : 50;
  const offset = size === 'sm' ? 2 : 4;
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (haptic && Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal: size === 'sm' ? Space.md : Space.xl,
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: variant === 'ghost' ? 0 : 2,
          opacity: inactive ? 0.5 : 1,
        },
        p.shadow && !pressed && !inactive ? hardShadow(c.shadow, offset) : null,
        p.shadow && pressed ? { transform: [{ translateX: offset }, { translateY: offset }] } : null,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={p.fg} /> : null}
          <AppText variant={size === 'sm' ? 'smallBold' : 'bodyBold'} color={p.fg}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
  size = 22,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, { opacity: pressed ? 0.5 : 1 }]}>
      <Ionicons name={icon} size={size} color={color ?? c.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.row, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  icon: { padding: Space.xs },
});
