import type { TextStyle } from 'react-native';

import type { Env } from '@/theme';

/**
 * Tablet palette, taken from the Claude Design handoff (Relay Tablet *.dc.html).
 * The design's oklch() status colours are converted to sRGB hex.
 */
export const T = {
  bg: '#0D0F11',
  rail: '#0B0D0F',
  line: '#1F2329',
  card: '#15181C',
  cardLine: '#20242B',
  field: '#1C2026',
  segOn: '#2C313A',
  chip: '#252A31',
  term: '#08090B',
  panel: '#111317',
  rowLine: '#1A1D22',
  ring: '#30353D',
  btnLine: '#2F343C',
  dashed: '#3A3F47',
  text: '#E8EAED',
  text2: '#C9CDD3',
  soft: '#A9AFB8',
  muted: '#8B929C',
  dim: '#6B727C',
  faint: '#5C636D',
  lineNo: '#4A5059',
  ink: '#0A0C0E',
  green: '#4AD186',
  orange: '#F7A73B',
  red: '#FC5855',
  blue: '#52B5F4',
  violet: '#B897F0',
};

/** `#RRGGBB` + alpha (0–1) → `#RRGGBBAA`. */
export const alpha = (hex: string, a: number) =>
  hex +
  Math.round(a * 255)
    .toString(16)
    .padStart(2, '0');

export const envTone: Record<Env, string> = { prod: T.red, staging: T.violet, dev: T.blue };

type Weight = 400 | 500 | 600 | 700;
const SANS: Record<Weight, string> = { 400: 'Geist_400Regular', 500: 'Geist_500Medium', 600: 'Geist_600SemiBold', 700: 'Geist_700Bold' };
const MONO: Record<Weight, string> = { 400: 'GeistMono_400Regular', 500: 'GeistMono_500Medium', 600: 'GeistMono_600SemiBold', 700: 'GeistMono_600SemiBold' };

/** Geist at a given weight (custom fonts carry their weight in the family name). */
export const sans = (w: Weight = 400): TextStyle => ({ fontFamily: SANS[w] });
/** Geist Mono at a given weight. */
export const monoF = (w: Weight = 400): TextStyle => ({ fontFamily: MONO[w] });
