import RelaySsh, { type AuthOptions, type SshErrorCode } from 'relay-ssh';

import { getPassword, getPrivateKey } from '@/lib/secrets';
import type { Server } from '@/lib/types';

export class SshError extends Error {
  constructor(
    public code: SshErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function ssh() {
  if (!RelaySsh) throw new SshError('UNSUPPORTED', 'Le client SSH natif n’est pas disponible dans ce build (dev build Android requis).');
  return RelaySsh;
}

export function asSshError(e: unknown): SshError {
  if (e instanceof SshError) return e;
  const err = e as { code?: string; message?: string };
  return new SshError((err.code as SshErrorCode) ?? 'SSH', err.message ?? String(e));
}

export function utf8ToB64(text: string) {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Single-quotes a string for a POSIX shell. */
export const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Credentials for a saved server, read from SecureStore. Overrides are used by the "test" button before saving. */
export async function credentialsFor(server: Pick<Server, 'id' | 'user' | 'auth' | 'keyId'>, overridePassword?: string): Promise<AuthOptions> {
  if (server.auth === 'password') {
    const password = overridePassword ?? (await getPassword(server.id));
    if (!password) throw new SshError('AUTH_FAILED', 'Aucun mot de passe enregistré pour ce serveur.');
    return { user: server.user, password };
  }
  if (!server.keyId) throw new SshError('AUTH_FAILED', 'Aucune clé SSH sélectionnée.');
  const { privateKey, passphrase } = await getPrivateKey(server.keyId);
  if (!privateKey) throw new SshError('AUTH_FAILED', 'Clé privée introuvable sur cet appareil.');
  return { user: server.user, privateKey, passphrase: passphrase ?? undefined };
}
