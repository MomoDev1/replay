import * as LocalAuthentication from 'expo-local-authentication';

/** Face ID / fingerprint prompt. Devices without biometrics are let through. */
export async function confirmBiometric(promptMessage: string) {
  const res = await LocalAuthentication.authenticateAsync({ promptMessage });
  return res.success || res.error === 'not_available' || res.error === 'not_enrolled';
}
