import Storage from 'expo-sqlite/kv-store';
import RelaySsh from 'relay-ssh';
import { useSyncExternalStore } from 'react';

import { utf8ToB64 } from '@/lib/ssh';
import type { Server } from '@/lib/types';

export type IdleTimeout = '5' | '15' | '60' | 'never';
const IDLE_KEY = 'ssh.idleTimeout';
const MAX_BUFFER = 256 * 1024;

export type Session = { id: string; server: Server; latencyMs: number; open: boolean; closedReason: string | null };

let current: Session | null = null;
let buffer: string[] = [];
let bufferSize = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const stateListeners = new Set<() => void>();
const dataListeners = new Set<(b64: string) => void>();

function setCurrent(next: Session | null) {
  current = next;
  stateListeners.forEach((l) => l());
}

export function getIdleTimeout(): IdleTimeout {
  return (Storage.getItemSync(IDLE_KEY) as IdleTimeout | null) ?? '15';
}

export function setIdleTimeout(v: IdleTimeout) {
  Storage.setItemSync(IDLE_KEY, v);
  touch();
}

function touch() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const t = getIdleTimeout();
  if (!current?.open || t === 'never') return;
  idleTimer = setTimeout(() => closeSession('Déconnexion automatique après inactivité'), Number(t) * 60_000);
}

RelaySsh?.addListener('onData', ({ sessionId, data }) => {
  if (sessionId !== current?.id) return;
  buffer.push(data);
  bufferSize += data.length;
  while (bufferSize > MAX_BUFFER && buffer.length > 1) bufferSize -= buffer.shift()!.length;
  dataListeners.forEach((l) => l(data));
  touch();
});

RelaySsh?.addListener('onClose', ({ sessionId, reason }) => {
  if (sessionId !== current?.id || !current.open) return;
  setCurrent({ ...current, open: false, closedReason: reason ?? 'Session terminée' });
  touch();
});

/** Called once the shell is started; replaces any previous session. */
export function openSession(id: string, server: Server, latencyMs: number) {
  if (current?.open && current.id !== id) RelaySsh?.disconnect(current.id).catch(() => {});
  buffer = [];
  bufferSize = 0;
  setCurrent({ id, server, latencyMs, open: true, closedReason: null });
  touch();
}

export async function closeSession(reason = 'Déconnecté') {
  if (!current) return;
  const s = current;
  setCurrent({ ...s, open: false, closedReason: reason });
  touch();
  await RelaySsh?.disconnect(s.id).catch(() => {});
}

export function sendB64(b64: string) {
  if (!current?.open) return;
  touch();
  RelaySsh?.write(current.id, b64).catch(() => {});
}

export const sendText = (text: string) => sendB64(utf8ToB64(text));

export function resizeSession(cols: number, rows: number) {
  if (current?.open) RelaySsh?.resize(current.id, cols, rows).catch(() => {});
}

/** Replays buffered output, then streams new chunks. Returns an unsubscribe function. */
export function subscribeData(listener: (b64: string) => void) {
  buffer.forEach(listener);
  dataListeners.add(listener);
  return () => {
    dataListeners.delete(listener);
  };
}

function subscribeState(l: () => void) {
  stateListeners.add(l);
  return () => {
    stateListeners.delete(l);
  };
}

export const useSession = () => useSyncExternalStore(subscribeState, () => current);
