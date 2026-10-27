import { Colors, type ThemeColors } from '@/constants/theme';

/** Shredder is always dark: pitch black with white and silver. */
export function useColors(): ThemeColors {
  return Colors.dark;
}

export function useIsDark() {
  return true;
}
