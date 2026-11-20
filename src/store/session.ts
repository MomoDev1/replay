import { router } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import RelaySsh from 'relay-ssh';
import { useSyncExternalStore } from 'react';

import { LocalShell, utf8Decode } from '@/lib/local-shell';
import { asSshError, SshError, utf8ToB64 } from '@/lib/ssh';
import type { Server } from '@/lib/types';

export type IdleTimeout = '5' | '15' | '60' | 'never';
const IDLE_KEY = 'ssh.idleTimeout';
const MAX_BUFFER = 256 * 1024;

type Base = { id: string; open: boolean; closedReason: string | null };
export type Session = Base & { kind: 'ssh'; server: Server; latencyMs: number };
export type LocalSession = Base & { kind: 'local'; title: string };
/** A terminal tab: an SSH shell or a shell on the device itself. */
export type Terminal = Session | LocalSession;

type State = {
  tabs: Terminal[];
  /** Tab shown by the terminal screen. */
  activeId: string | null;
  /** SSH session used by Code, Git, Monitoring and snippets: the last SSH tab that was shown. */
  sshId: string | null;
};

let state: State = { tabs: [], activeId: null, sshId: null };
const buffers = new Map<string, { chunks: string[]; size: number }>();
const shells = new Map<string, LocalShell>();
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const stateListeners = new Set<() => void>();
const dataListeners = new Map<string, Set<(b64: string) => void>>();

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  stateListeners.forEach((l) => l());
}

const find = (id: string | null | undefined) => state.tabs.find((t) => t.id === id);

function updateTab(id: string, patch: Partial<Base>) {
  setState({ tabs: state.tabs.map((t) => (t.id === id ? ({ ...t, ...patch } as Terminal) : t)) });
}

function push(id: string, b64: string) {
  const buf = buffers.get(id);
  if (!buf) return;
  buf.chunks.push(b64);
  buf.size += b64.length;
  while (buf.size > MAX_BUFFER && buf.chunks.length > 1) buf.size -= buf.chunks.shift()!.length;
  dataListeners.get(id)?.forEach((l) => l(b64));
}

// ---------------------------------------------------------------- idle timeout (SSH only)

export function getIdleTimeout(): IdleTimeout {
  return (Storage.getItemSync(IDLE_KEY) as IdleTimeout | null) ?? '15';
}

export function setIdleTimeout(v: IdleTimeout) {
  Storage.setItemSync(IDLE_KEY, v);
  state.tabs.forEach((t) => touch(t.id));
}

function touch(id: string | null) {
  if (!id) return;
  const timer = idleTimers.get(id);
  if (timer) clearTimeout(timer);
  idleTimers.delete(id);
  const tab = find(id);
  const t = getIdleTimeout();
  if (tab?.kind !== 'ssh' || !tab.open || t === 'never') return;
  idleTimers.set(
    id,
    setTimeout(() => closeSession('Déconnexion automatique après inactivité', id), Number(t) * 60_000),
  );
}

// ---------------------------------------------------------------- native SSH events

// The native reader starts with startShell, before openSession: keep that first output (prompt, motd).
const early = new Map<string, string[]>();

RelaySsh?.addListener('onData', ({ sessionId, data }) => {
  if (!buffers.has(sessionId)) {
    const chunks = early.get(sessionId) ?? [];
    if (chunks.length < 64) chunks.push(data);
    early.set(sessionId, chunks);
    return;
  }
  push(sessionId, data);
  touch(sessionId);
});

RelaySsh?.addListener('onClose', ({ sessionId, reason }) => {
  const tab = find(sessionId);
  if (!tab?.open) return;
  updateTab(sessionId, { open: false, closedReason: reason ?? 'Session terminée' });
  touch(sessionId);
});

// ---------------------------------------------------------------- tabs

/** Called once the shell is started; opens a new terminal tab (or reuses the closed tab of the same server). */
export function openSession(id: string, server: Server, latencyMs: number) {
  const chunks = early.get(id) ?? [];
  early.delete(id);
  buffers.set(id, { chunks, size: chunks.reduce((n, c) => n + c.length, 0) });
  const tab: Session = { kind: 'ssh', id, server, latencyMs, open: true, closedReason: null };
  // "Reconnecter" from a closed tab: the new connection takes its place instead of piling up tabs.
  const stale = state.tabs.find((t) => t.kind === 'ssh' && !t.open && t.server.id === server.id);
  if (stale) dropTab(stale.id);
  const tabs = stale ? state.tabs.map((t) => (t.id === stale.id ? tab : t)) : [...state.tabs, tab];
  setState({ tabs, activeId: id, sshId: id });
  touch(id);
}

let localCount = 0;

/** Opens a terminal running on the device itself. Returns its id. */
export function openLocalSession(replaceId?: string) {
  const id = `local-${Date.now().toString(36)}-${++localCount}`;
  buffers.set(id, { chunks: [], size: 0 });
  const shell = new LocalShell(
    (text) => push(id, utf8ToB64(text)),
    () => updateTab(id, { open: false, closedReason: 'Session locale terminée' }),
  );
  shells.set(id, shell);
  const n = state.tabs.filter((t) => t.kind === 'local').length;
  const tab: LocalSession = { kind: 'local', id, title: n && !replaceId ? `Local ${n + 1}` : 'Local', open: true, closedReason: null };
  if (replaceId) {
    const old = find(replaceId);
    if (old?.kind === 'local') tab.title = old.title;
    dropTab(replaceId);
  }
  const tabs = replaceId && find(replaceId) ? state.tabs.map((t) => (t.id === replaceId ? tab : t)) : [...state.tabs, tab];
  setState({ tabs, activeId: id });
  shell.start();
  return id;
}

/** Id of the tab shown by the terminal screen (read at call time by xterm's callbacks). */
export const getActiveId = () => state.activeId;

/** Shows a tab in the terminal screen. SSH tabs also become the session used by Code, Git… */
export function setActiveTab(id: string) {
  const tab = find(id);
  if (!tab) return;
  setState({ activeId: id, ...(tab.kind === 'ssh' ? { sshId: id } : null) });
}

/**
 * Makes a server's open SSH tab the current session and shows `screen`; without one, connects to the
 * server in a new tab (the connect screen then lands on the terminal).
 */
export function openServer(serverId: string, screen: '/terminal' | '/git' | '/deploy' | '/monitoring' = '/terminal') {
  const tab = state.tabs.find((t) => t.kind === 'ssh' && t.open && t.server.id === serverId);
  if (!tab) return router.push(`/connect/${serverId}`);
  setActiveTab(tab.id);
  router.navigate(screen);
}

/** Ends a tab's shell but keeps the tab (with its output) until it is closed. */
export async function closeSession(reason = 'Déconnecté', id = state.sshId) {
  const tab = find(id);
  if (!tab?.open) return;
  updateTab(tab.id, { open: false, closedReason: reason });
  touch(tab.id);
  if (tab.kind === 'local') {
    shells.get(tab.id)?.dispose();
    return;
  }
  await RelaySsh?.disconnect(tab.id).catch(() => {});
}

function dropTab(id: string) {
  const tab = find(id);
  if (tab?.kind === 'ssh' && tab.open) RelaySsh?.disconnect(id).catch(() => {});
  shells.get(id)?.dispose();
  shells.delete(id);
  buffers.delete(id);
  dataListeners.delete(id);
  const timer = idleTimers.get(id);
  if (timer) clearTimeout(timer);
  idleTimers.delete(id);
}

/** Closes a tab: disconnects it if needed and forgets its output. */
export function removeTab(id: string) {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index < 0) return;
  dropTab(id);
  const tabs = state.tabs.filter((t) => t.id !== id);
  const activeId = state.activeId === id ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null) : state.activeId;
  const lastSsh = [...tabs].reverse().find((t) => t.kind === 'ssh')?.id ?? null;
  const active = tabs.find((t) => t.id === activeId);
  const sshId = state.sshId === id ? (active?.kind === 'ssh' ? active.id : lastSsh) : state.sshId;
  setState({ tabs, activeId, sshId });
}

// ---------------------------------------------------------------- I/O

/** Sends base64 keystrokes to a tab (the SSH session by default). */
export function sendB64(b64: string, id = state.sshId) {
  const tab = find(id);
  if (!tab?.open) return;
  if (tab.kind === 'local') {
    shells.get(tab.id)?.input(utf8Decode(atob(b64)));
    return;
  }
  touch(tab.id);
  RelaySsh?.write(tab.id, b64).catch(() => {});
}

export const sendText = (text: string, id = state.sshId) => sendB64(utf8ToB64(text), id);

let pasteHandler: ((text: string) => void) | null = null;

/** The terminal view registers how to paste, so xterm can honour the shell's bracketed-paste mode. */
export function setPasteHandler(handler: (text: string) => void) {
  pasteHandler = handler;
  return () => {
    if (pasteHandler === handler) pasteHandler = null;
  };
}

/**
 * Types `text` at the prompt of the SSH session WITHOUT pressing Enter: the user reviews it and runs it from the terminal.
 * Multi-line text is pasted so that the shell does not run each line on its own.
 */
export function pasteText(text: string) {
  const tab = find(state.sshId);
  if (!tab?.open) return false;
  const t = text.replace(/[\r\n]+$/, '');
  if (!t) return false;
  // The terminal shows another tab: switch to the SSH one; xterm still shows the old tab until it re-renders.
  const shown = state.activeId === tab.id;
  if (!shown) setActiveTab(tab.id);
  if (pasteHandler && shown) pasteHandler(t);
  // No terminal showing this session: ^V before each newline keeps it literal (see XTerm.paste).
  else sendText(t.replace(/\r\n|\r|\n/g, '\x16\n'), tab.id);
  touch(tab.id);
  return true;
}

/** Runs a command on its own channel of the open SSH connection (the terminal is untouched). */
export async function exec(command: string, timeoutMs?: number) {
  const tab = find(state.sshId);
  if (tab?.kind !== 'ssh' || !tab.open || !RelaySsh) throw new SshError('NO_SESSION', 'Aucune session SSH ouverte.');
  touch(tab.id);
  try {
    return await RelaySsh.exec(tab.id, command, timeoutMs ?? null);
  } catch (e) {
    throw asSshError(e);
  }
}

export function resizeSession(cols: number, rows: number, id = state.activeId) {
  const tab = find(id);
  if (!tab?.open) return;
  if (tab.kind === 'local') shells.get(tab.id)?.resize(cols);
  else RelaySsh?.resize(tab.id, cols, rows).catch(() => {});
}

/** Replays a tab's buffered output, then streams new chunks. Returns an unsubscribe function. */
export function subscribeData(id: string, listener: (b64: string) => void) {
  buffers.get(id)?.chunks.forEach(listener);
  let set = dataListeners.get(id);
  if (!set) dataListeners.set(id, (set = new Set()));
  set.add(listener);
  return () => {
    dataListeners.get(id)?.delete(listener);
  };
}

function subscribeState(l: () => void) {
  stateListeners.add(l);
  return () => {
    stateListeners.delete(l);
  };
}

/** The SSH session used by Code, Git, Monitoring and snippets. */
export const useSession = () => useSyncExternalStore(subscribeState, () => (find(state.sshId) as Session | undefined) ?? null);

/** All terminal tabs and the one shown. */
export const useTerminals = () => useSyncExternalStore(subscribeState, () => state);
