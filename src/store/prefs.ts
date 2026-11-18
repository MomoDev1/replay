import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

/** App preferences kept on the device (key-value store). */
export type Prefs = {
  /** Ask for Face ID / fingerprint when the app opens or comes back from the background. */
  biometricLock: boolean;
  /** Terminal font size in points; null = default for the device (12 on phones, 14 on tablets). */
  termFontSize: number | null;
};

const KEY = 'prefs';
const DEFAULTS: Prefs = { biometricLock: false, termFontSize: null };
export const FONT_MIN = 9;
export const FONT_MAX = 22;

let prefs: Prefs | null = null;
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  if (prefs) return prefs;
  try {
    prefs = { ...DEFAULTS, ...JSON.parse(Storage.getItemSync(KEY) ?? '{}') };
  } catch {
    prefs = DEFAULTS;
  }
  return prefs!;
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...getPrefs(), ...patch };
  Storage.setItemSync(KEY, JSON.stringify(prefs));
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const usePrefs = () => useSyncExternalStore(subscribe, getPrefs);

export const termFont = (p: Prefs, tablet: boolean) => p.termFontSize ?? (tablet ? 14 : 12);
