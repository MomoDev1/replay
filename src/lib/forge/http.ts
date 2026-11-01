import * as SecureStore from 'expo-secure-store';

import type { ForgeKind } from './types';

export class ForgeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// ---- Credentials (SecureStore keys only allow [A-Za-z0-9._-]) ----

export type GithubCreds = { token: string };
export type BitbucketCreds = { email: string; token: string };

const K = { gh: 'forge.github.token', bbEmail: 'forge.bitbucket.email', bbToken: 'forge.bitbucket.token' };

let cache: { github?: GithubCreds | null; bitbucket?: BitbucketCreds | null } = {};
const listeners = new Set<() => void>();

export async function getCreds(forge: 'github'): Promise<GithubCreds | null>;
export async function getCreds(forge: 'bitbucket'): Promise<BitbucketCreds | null>;
export async function getCreds(forge: ForgeKind): Promise<GithubCreds | BitbucketCreds | null>;
export async function getCreds(forge: ForgeKind) {
  if (forge === 'github') {
    if (cache.github === undefined) {
      const token = await SecureStore.getItemAsync(K.gh);
      cache.github = token ? { token } : null;
    }
    return cache.github;
  }
  if (cache.bitbucket === undefined) {
    const [email, token] = await Promise.all([SecureStore.getItemAsync(K.bbEmail), SecureStore.getItemAsync(K.bbToken)]);
    cache.bitbucket = email && token ? { email, token } : null;
  }
  return cache.bitbucket;
}

export async function setGithubCreds(c: GithubCreds | null) {
  if (c) await SecureStore.setItemAsync(K.gh, c.token);
  else await SecureStore.deleteItemAsync(K.gh);
  cache = { ...cache, github: c };
  listeners.forEach((l) => l());
}

export async function setBitbucketCreds(c: BitbucketCreds | null) {
  if (c) {
    await SecureStore.setItemAsync(K.bbEmail, c.email);
    await SecureStore.setItemAsync(K.bbToken, c.token);
  } else {
    await SecureStore.deleteItemAsync(K.bbEmail);
    await SecureStore.deleteItemAsync(K.bbToken);
  }
  cache = { ...cache, bitbucket: c };
  listeners.forEach((l) => l());
}

export function onCredsChange(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Base64 without relying on `btoa` (not guaranteed on every RN runtime). */
export function b64(s: string) {
  const bytes = Array.from(new TextEncoder().encode(s));
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + (i + 1 < bytes.length ? abc[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? abc[n & 63] : '=');
  }
  return out;
}

// ---- HTTP ----

export type Req = { method?: string; body?: unknown; headers?: Record<string, string>; raw?: boolean; timeoutMs?: number };

/** Pulls a readable message out of a GitHub or Bitbucket error body. */
function errorMessage(status: number, text: string) {
  let msg = '';
  try {
    const j = JSON.parse(text);
    // GitHub: { message, errors: [{ message }] } — Bitbucket: { error: { message, detail } }
    msg = j?.error?.message ?? j?.message ?? '';
    const detail = j?.error?.detail ?? j?.errors?.map?.((e: { message?: string; code?: string }) => e.message ?? e.code).filter(Boolean).join(', ');
    if (detail && typeof detail === 'string') msg = msg ? `${msg} — ${detail}` : detail;
  } catch {
    msg = text.slice(0, 200);
  }
  if (status === 401) return 'Jeton invalide ou expiré. Vérifie le compte dans Réglages → Comptes Git.';
  if (status === 403) return msg ? `Accès refusé : ${msg}` : 'Accès refusé : le jeton n’a pas les permissions nécessaires.';
  if (status === 404) return msg && msg !== 'Not Found' ? msg : 'Introuvable (ou le jeton n’a pas accès à ce dépôt).';
  return msg || `Erreur HTTP ${status}`;
}

export type Res<T> = { data: T; headers: Headers; status: number };

export async function request<T>(url: string, auth: string, opts: Req = {}): Promise<Res<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      // GitHub/Bitbucket send `Cache-Control: max-age=60`; the native HTTP cache (NSURLCache on iOS)
      // would then serve stale lists, e.g. a just-merged PR still shown as open. Always hit the API.
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        Authorization: auth,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ForgeError(ctrl.signal.aborted ? 'Délai dépassé — vérifie la connexion.' : `Réseau indisponible : ${(e as Error).message}`, 0);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) throw new ForgeError(errorMessage(res.status, text), res.status);
  const data = (opts.raw ? text : text ? JSON.parse(text) : null) as T;
  return { data, headers: res.headers, status: res.status };
}
