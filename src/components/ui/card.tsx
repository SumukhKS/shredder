import { Pressable, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { Radius, Space } from '@/constants/theme';

import { useColors } from './theme';

interface CardProps extends ViewProps {
  /** hero: the one loud surface on a screen. card: raised block. flat: quiet grouped list. */
  tone?: 'hero' | 'card' | 'flat';
  bg?: string;
  /** Solid orange face (black text on it), for the loudest surfaces. */
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
    borderColor: tone === 'flat' ? c.hairline : c.border,
  };
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [base, pressed ? { transform: [{ scale: 0.98 }], opacity: 0.9 } : null, style]}
        {...rest}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[base, style]} {...rest}>
      {children}
    </View>
  );
}
