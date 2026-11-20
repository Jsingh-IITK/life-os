/**
 * Design tokens — Personal Life OS Design System v1.0.
 *
 * Semantic names only. Components must never reference a hex value or a raw
 * number directly; that is what keeps one component working in both themes
 * instead of needing a light and a dark variant.
 */

export const palette = {
  light: {
    backgroundPrimary: '#F7F4ED',
    backgroundSecondary: '#F0EEE6',
    surfacePrimary: '#FFFFFF',
    surfaceSecondary: '#F3F1EA',
    surfaceElevated: '#FFFFFF',
    textPrimary: '#252820',
    textSecondary: '#66695F',
    textMuted: '#85877D',
    borderPrimary: '#E8E3D9',
    brandPrimary: '#687C53',
    brandSecondary: '#A6B48F',
    brandSubtle: '#E8EBDD',
    success: '#4F805B',
    warning: '#B88443',
    danger: '#C66E61',
    info: '#6687A1',
    /** Text that sits on brandPrimary. */
    onBrand: '#FFFFFF',
  },
  dark: {
    backgroundPrimary: '#191B19',
    backgroundSecondary: '#202320',
    surfacePrimary: '#252825',
    surfaceSecondary: '#2C302C',
    surfaceElevated: '#333833',
    textPrimary: '#F2F0E9',
    textSecondary: '#B5B8AE',
    textMuted: '#8B9086',
    borderPrimary: '#383C37',
    brandPrimary: '#A6B88A',
    brandSecondary: '#80956C',
    brandSubtle: '#303A2C',
    success: '#85B88B',
    warning: '#D9AB69',
    danger: '#E18A7E',
    info: '#89AAC3',
    // Dark brand is a light sage, so text on it must be dark to stay legible.
    onBrand: '#191B19',
  },
} as const;

export type ColorScheme = 'light' | 'dark';
export type ColorToken = keyof (typeof palette)['light'];
// Widened to string: the two palettes share keys but not literal values, so a
// literal-typed alias makes one palette unassignable to the other.
export type Colors = Record<ColorToken, string>;

/** 8px rhythm with 4px fine adjustments. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

/**
 * The spec calls for weight 650. React Native accepts only discrete weights and
 * resolves them to a loaded font file, so 650 maps to the 600 SemiBold cut.
 * Recorded as a deviation rather than silently rounded.
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontFamily: fontFamily.semibold },
  pageHeading: { fontSize: 26, lineHeight: 32, fontFamily: fontFamily.semibold },
  sectionHeading: { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold },
  cardHeading: { fontSize: 16, lineHeight: 22, fontFamily: fontFamily.semibold },
  body: { fontSize: 14, lineHeight: 20, fontFamily: fontFamily.regular },
  secondary: { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.regular },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.regular },
  metric: { fontSize: 28, lineHeight: 34, fontFamily: fontFamily.semibold },
} as const;

export type TypographyVariant = keyof typeof typography;

/**
 * Money and metrics must use tabular figures, so columns of numbers align and
 * do not jitter as values change.
 */
export const tabularNumbers = { fontVariant: ['tabular-nums'] } as const;

export const breakpoint = {
  smallMobile: 320,
  mobile: 375,
  tablet: 768,
  desktop: 1024,
  large: 1440,
} as const;

/** Width at or above which the sidebar replaces bottom navigation. */
export const SIDEBAR_BREAKPOINT = breakpoint.desktop;
export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_WIDTH_COLLAPSED = 72;
export const CONTENT_MAX_WIDTH = 1200;

export const duration = {
  hover: 140,
  standard: 200,
  overlay: 220,
  progress: 420,
} as const;

/** Minimum comfortable touch target (WCAG 2.2 AA / spec §5). */
export const MIN_TOUCH_TARGET = 44;

export const elevation = {
  /** Light theme only: dark relies on surface contrast and borders instead. */
  card: {
    shadowColor: '#2A2A20',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  overlay: {
    shadowColor: '#2A2A20',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
} as const;
