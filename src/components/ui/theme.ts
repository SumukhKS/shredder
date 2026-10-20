import { useColorScheme } from 'react-native';

import { Colors, type ThemeColors } from '@/constants/theme';

export function useColors(): ThemeColors {
  return useColorScheme() === 'dark' ? Colors.dark : Colors.light;
}

export function useIsDark() {
  return useColorScheme() === 'dark';
}
