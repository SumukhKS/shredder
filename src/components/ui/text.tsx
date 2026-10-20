import { Text, type TextProps } from 'react-native';

import { Type, type ThemeColors, type TypeVariant } from '@/constants/theme';

import { useColors } from './theme';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: keyof ThemeColors | (string & {});
  align?: 'left' | 'center' | 'right';
}

export function AppText({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const c = useColors();
  const resolved = color in c ? c[color as keyof ThemeColors] : color;
  return <Text {...rest} style={[Type[variant], { color: resolved, textAlign: align }, style]} />;
}
