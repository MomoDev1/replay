import { Platform } from 'react-native';

export const C = {
  bg: '#0B0B0D',
  surface: '#16161A',
  surface2: '#1F1F24',
  border: '#2A2A30',
  text: '#F4F4F5',
  muted: '#8B8B93',
  dim: '#5C5C64',
  accent: '#4BA8F0',
  green: '#3DD68C',
  orange: '#F5A524',
  red: '#F25555',
  purple: '#A78BFA',
  redBg: 'rgba(242,85,85,0.12)',
  greenBg: 'rgba(61,214,140,0.12)',
  orangeBg: 'rgba(245,165,36,0.12)',
  accentBg: 'rgba(75,168,240,0.15)',
};

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export type Env = 'prod' | 'staging' | 'dev';

export const envColor: Record<Env, string> = { prod: C.red, staging: C.purple, dev: C.accent };
