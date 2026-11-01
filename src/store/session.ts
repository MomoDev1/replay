import Storage from 'expo-sqlite/kv-store';
import RelaySsh from 'relay-ssh';
import { useSyncExternalStore } from 'react';

import { asSshError, SshError, utf8ToB64 } from '@/lib/ssh';
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

// The native reader starts with startShell, before openSession: keep that first output (prompt, motd).
const early = new Map<string, string[]>();

RelaySsh?.addListener('onData', ({ sessionId, data }) => {
  if (sessionId !== current?.id) {
    const chunks = early.get(sessionId) ?? [];
    if (chunks.length < 64) chunks.push(data);
    early.set(sessionId, chunks);
    return;
  }
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
  buffer = early.get(id) ?? [];
  bufferSize = buffer.reduce((n, c) => n + c.length, 0);
  early.clear();
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

let pasteHandler: ((text: string) => void) | null = null;

/** The terminal view registers how to paste, so xterm can honour the shell's bracketed-paste mode. */
export function setPasteHandler(handler: (text: string) => void) {
  pasteHandler = handler;
  return () => {
    if (pasteHandler === handler) pasteHandler = null;
  };
}

/**
 * Types `text` at the prompt WITHOUT pressing Enter: the user reviews it and runs it from the terminal.
 * Multi-line text is pasted so that the shell does not run each line on its own.
 */
export function pasteText(text: string) {
  if (!current?.open) return false;
  const t = text.replace(/[\r\n]+$/, '');
  if (!t) return false;
  if (pasteHandler) pasteHandler(t);
  // No terminal mounted: ^V before each newline keeps it literal (see XTerm.paste).
  else sendText(t.replace(/\r\n|\r|\n/g, '\x16\n'));
  touch();
  return true;
}

/** Runs a command on its own channel of the open connection (the terminal is untouched). */
export async function exec(command: string, timeoutMs?: number) {
  if (!current?.open || !RelaySsh) throw new SshError('NO_SESSION', 'Aucune session SSH ouverte.');
  touch();
  try {
    return await RelaySsh.exec(current.id, command, timeoutMs ?? null);
  } catch (e) {
    throw asSshError(e);
  }
}

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
