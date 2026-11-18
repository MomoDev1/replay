import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { getPrefs } from '@/store/prefs';
import { C } from '@/theme';

/**
 * Covers the app until Face ID / fingerprint succeeds, when the lock is enabled in the settings:
 * at launch and each time the app comes back from the background. The biometric prompt itself only makes
 * the app "inactive", so it never re-locks.
 */
export function LockGate() {
  const [locked, setLocked] = useState(() => getPrefs().biometricLock);
  const prompting = useRef(false);

  async function unlock() {
    if (prompting.current) return;
    prompting.current = true;
    try {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Déverrouiller Hop', cancelLabel: 'Annuler', fallbackLabel: 'Utiliser le code' });
      // Devices without biometrics or passcode cannot be locked.
      if (res.success || res.error === 'not_available' || res.error === 'not_enrolled' || res.error === 'passcode_not_set') setLocked(false);
    } finally {
      prompting.current = false;
    }
  }

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && getPrefs().biometricLock) setLocked(true);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!locked) return;
    if (AppState.currentState === 'active') unlock();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && unlock());
    return () => sub.remove();
  }, [locked]);

  if (!locked) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 16 }]}>
      <Text style={{ color: C.text, fontSize: 22, fontWeight: '700' }}>Hop est verrouillé</Text>
      <Pressable onPress={unlock} style={({ pressed }) => ({ backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 13, opacity: pressed ? 0.8 : 1 })}>
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Déverrouiller</Text>
      </Pressable>
    </View>
  );
}
