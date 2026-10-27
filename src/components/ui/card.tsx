import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { glow, Gradients, Radius, Space } from '@/constants/theme';

import { useColors } from './theme';

interface CardProps extends ViewProps {
  /** hero: the one loud surface on a screen. card: raised block. flat: quiet grouped list. */
  tone?: 'hero' | 'card' | 'flat';
  bg?: string;
  /** Solid blaze gradient face (black text on it), for the loudest surfaces. */
  filled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Card({ tone = 'card', bg, filled, onPress, style, children, ...rest }: CardProps) {
  const c = useColors();
  const radius = tone === 'hero' ? Radius.hero : tone === 'card' ? Radius.card : Radius.row;
  const base: ViewStyle = {
    backgroundColor: filled ? c.primary : (bg ?? c.surface),
    borderRadius: radius,
    padding: tone === 'hero' ? Space.xl : Space.lg,
    borderWidth: 1,
    borderColor: tone === 'hero' ? c.shadow : tone === 'card' ? c.border : c.hairline,
  };
  const lift = tone === 'hero' ? glow(c.glow, 28) : tone === 'card' ? glow('rgba(255,90,31,0.07)', 16) : null;
  // A light sheen from the top-left edge gives surfaces some depth.
  const sheen =
    (tone === 'flat' || bg) && !filled ? null : (
      <LinearGradient
        pointerEvents="none"
        colors={filled ? Gradients.blaze : tone === 'hero' ? Gradients.char : Gradients.sheen}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius - 1 }]}
      />
    );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [base, lift, pressed ? { transform: [{ scale: 0.98 }], opacity: 0.9 } : null, style]}
        {...rest}>
        {sheen}
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[base, lift, style]} {...rest}>
      {sheen}
      {children}
    </View>
  );
}
