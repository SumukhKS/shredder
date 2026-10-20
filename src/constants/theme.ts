import { Platform } from 'react-native';

/**
 * Shredder design tokens.
 *
 * Direction: arcade scoreboard meets gym chalk. A lilac-white "chalk" ground,
 * deep violet ink, and chunky ink-outlined surfaces with a hard offset shadow.
 * Volt (electric violet) is the action colour; Ember is reserved for XP and
 * streaks so progress always reads as heat. Macros keep fixed colours everywhere.
 */
const palette = {
  chalk: '#F4F2FF',
  paper: '#FFFFFF',
  ink: '#1D1840',
  inkSoft: '#5E5880',
  line: '#DCD7F2',
  volt: '#5B3DF5',
  voltSoft: '#E7E1FF',
  ember: '#FF5A36',
  emberSoft: '#FFE3DB',
  mint: '#14B892',
  sun: '#FFB800',
  sky: '#2E9BFF',
  danger: '#E5304C',

  night: '#141129',
  nightRaised: '#201C3D',
  nightLine: '#37315E',
  moon: '#F1EEFF',
  moonSoft: '#A49DC8',
};

export const Colors = {
  light: {
    bg: palette.chalk,
    surface: palette.paper,
    text: palette.ink,
    textMuted: palette.inkSoft,
    border: palette.ink,
    hairline: palette.line,
    shadow: palette.ink,
    primary: palette.volt,
    primarySoft: palette.voltSoft,
    onPrimary: '#FFFFFF',
    xp: palette.ember,
    xpSoft: palette.emberSoft,
    success: palette.mint,
    danger: palette.danger,
    protein: palette.mint,
    carbs: palette.sun,
    fat: palette.sky,
    water: palette.sky,
    steps: palette.volt,
    sleep: '#8B6CFF',
  },
  dark: {
    bg: palette.night,
    surface: palette.nightRaised,
    text: palette.moon,
    textMuted: palette.moonSoft,
    border: palette.nightLine,
    hairline: palette.nightLine,
    shadow: '#000000',
    primary: '#7C64FF',
    primarySoft: '#2E2760',
    onPrimary: '#FFFFFF',
    xp: '#FF6B4A',
    xpSoft: '#3D2230',
    success: palette.mint,
    danger: '#FF5470',
    protein: palette.mint,
    carbs: palette.sun,
    fat: palette.sky,
    water: palette.sky,
    steps: '#7C64FF',
    sleep: '#A28BFF',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };

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

/** Hard offset shadow used on ink-outlined surfaces (boxShadow works on all platforms with the New Architecture) */
export function hardShadow(color: string, offset = 4) {
  return { boxShadow: `${offset}px ${offset}px 0px ${color}` } as const;
}

export const isWeb = Platform.OS === 'web';
