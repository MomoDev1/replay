import * as LocalAuthentication from 'expo-local-authentication';

/** Face ID / fingerprint prompt. Devices without biometrics (or without a passcode) are let through. */
export async function confirmBiometric(promptMessage: string) {
  const res = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Annuler', fallbackLabel: 'Utiliser le code' });
  return res.success || res.error === 'not_available' || res.error === 'not_enrolled' || res.error === 'passcode_not_set';
}
