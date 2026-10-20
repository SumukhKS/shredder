import { Pressable, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { hardShadow, Radius, Space } from '@/constants/theme';

import { useColors } from './theme';

interface CardProps extends ViewProps {
  /** hero: the one loud surface on a screen. card: outlined block. flat: quiet grouped list. */
  tone?: 'hero' | 'card' | 'flat';
  bg?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Card({ tone = 'card', bg, onPress, style, children, ...rest }: CardProps) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: bg ?? c.surface,
    borderRadius: tone === 'hero' ? Radius.hero : tone === 'card' ? Radius.card : Radius.row,
    padding: tone === 'hero' ? Space.xl : Space.lg,
    borderWidth: tone === 'flat' ? 1 : 2,
    borderColor: tone === 'flat' ? c.hairline : c.border,
  };
  const shadow = tone === 'flat' ? null : hardShadow(c.shadow, tone === 'hero' ? 6 : 4);

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          base,
          pressed ? { transform: [{ translateX: 3 }, { translateY: 3 }] } : shadow,
          style,
        ]}
        {...rest}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[base, shadow, style]} {...rest}>
      {children}
    </View>
  );
}
