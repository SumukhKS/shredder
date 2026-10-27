import { Platform } from 'react-native';

/**
 * Shredder design tokens.
 *
 * Direction: blaze on black. A pitch-black ground with warm charcoal surfaces and
 * one hot orange-red that carries actions, progress and streaks, polished into a
 * gradient (amber to vermilion) with a soft glow on the things that matter. Amber
 * and bone are its supporting tones for macros and sleep stages; red is for
 * destructive actions.
 */
const palette = {
  black: '#000000',
  char: '#15100D',
  charHi: '#221813',
  line: '#35271F',
  hairline: '#211814',
  white: '#FFFFFF',
  bone: '#F3E3D6',
  ash: '#A99E97',
  smoke: '#6E625B',
  ember: '#5A2814',
  blaze: '#FF5A1F',
  flame: '#FF8A3D',
  amber: '#FFB547',
  danger: '#FF3B30',
};

const dark = {
  bg: palette.black,
  surface: palette.char,
  surfaceHi: palette.charHi,
  text: palette.white,
  textMuted: palette.ash,
  border: palette.line,
  hairline: palette.hairline,
  shadow: palette.ember,
  primary: palette.blaze,
  primarySoft: palette.hairline,
  onPrimary: palette.black,
  accent: palette.flame,
  accentSoft: palette.hairline,
  onAccent: palette.black,
  success: palette.blaze,
  danger: palette.danger,
  ember: palette.flame,
  glow: 'rgba(255,90,31,0.32)',
  protein: palette.blaze,
  carbs: palette.amber,
  fat: palette.bone,
  water: palette.flame,
  steps: palette.blaze,
  sleep: palette.amber,
  // Sleep stages, deepest the hottest.
  deep: '#E0301E',
  light: palette.flame,
  rem: palette.amber,
  awake: palette.bone,
};

// The app is dark only; `light` is kept so existing imports keep working.
export const Colors = { light: dark, dark } as const;

export type ThemeColors = { [K in keyof typeof dark]: string };

/** Gradient stops for expo-linear-gradient. */
export const Gradients = {
  blaze: ['#FFA043', '#FF5A1F', '#E6301A'],
  char: ['#2A1A12', '#0E0907'],
  sheen: ['rgba(255,120,60,0.09)', 'rgba(255,120,60,0)'],
  ember: ['#FFD166', '#FF8A3D', '#FF5A1F'],
} as const satisfies Record<string, readonly [string, string, ...string[]]>;

export const Fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  body: 'PlusJakartaSans_500Medium',
  bodyBold: 'PlusJakartaSans_700Bold',
};

/** 4-pt spacing scale */
export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Radius encodes hierarchy: hero > card > row > chip */
export const Radius = { hero: 28, card: 20, row: 14, chip: 999 } as const;

/** Type scale (roughly a 1.25 ratio) */
export const Type = {
  hero: { fontFamily: Fonts.display, fontSize: 44, lineHeight: 46, letterSpacing: -1 },
  h1: { fontFamily: Fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6 },
  h2: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontFamily: Fonts.displaySemi, fontSize: 18, lineHeight: 22 },
  body: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 21 },
  bodyBold: { fontFamily: Fonts.bodyBold, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 17 },
  smallBold: { fontFamily: Fonts.bodyBold, fontSize: 13, lineHeight: 17 },
  stat: { fontFamily: Fonts.display, fontSize: 26, lineHeight: 28, letterSpacing: -0.5 },
} as const;

export type TypeVariant = keyof typeof Type;

/** Hard offset shadow used on chunky buttons (boxShadow works on all platforms with the New Architecture) */
export function hardShadow(color: string, offset = 4) {
  return { boxShadow: `${offset}px ${offset}px 0px ${color}` } as const;
}

/** Soft halo that lifts a surface off the black ground. */
export function glow(color: string, radius = 24) {
  return { boxShadow: `0px 0px ${radius}px 0px ${color}` } as const;
}

/** `#RRGGBB` with an alpha (0-1); other colour strings are returned unchanged. */
export function withAlpha(hex: string, a: number) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return hex + Math.round(a * 255).toString(16).padStart(2, '0');
}

export const isWeb = Platform.OS === 'web';
