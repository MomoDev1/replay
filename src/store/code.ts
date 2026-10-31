import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import * as F from '@/lib/files';
import type { Server } from '@/lib/types';
import { repoFor } from '@/store/git';

export type CodeState = {
  serverId: string;
  /** Absolute path of the folder being browsed. */
  cwd: string | null;
  entries: F.Entry[] | null;
  loading: boolean;
  error: string | null;
};

let state: CodeState | null = null;
const listeners = new Set<() => void>();
let seq = 0;

function set(next: CodeState) {
  state = next;
  listeners.forEach((l) => l());
}

const cwdKey = (serverId: string) => `code.cwd.${serverId}`;

/** Points the explorer at a server: its last folder, else its Git repo / default path. */
export async function selectServer(server: Server) {
  if (state?.serverId === server.id && state.cwd) return refresh();
  set({ serverId: server.id, cwd: null, entries: null, loading: true, error: null });
  const saved = Storage.getItemSync(cwdKey(server.id));
  let cwd: string;
  try {
    cwd = await F.resolveDir(saved || repoFor(server));
  } catch {
    try {
      cwd = await F.resolveDir('~');
    } catch (e) {
      set({ serverId: server.id, cwd: null, entries: null, loading: false, error: (e as Error).message });
      return;
    }
  }
  return open(cwd);
}

/** Browses to an absolute folder (or `~`-relative path). */
export async function open(path: string) {
  if (!state) return;
  const id = ++seq;
  const serverId = state.serverId;
  set({ ...state, loading: true });
  try {
    const cwd = path.startsWith('/') ? F.join(path, '.') : await F.resolveDir(path);
    const entries = await F.list(cwd);
    if (id !== seq) return;
    Storage.setItemSync(cwdKey(serverId), cwd);
    set({ serverId, cwd, entries, loading: false, error: null });
  } catch (e) {
    if (id === seq && state) set({ ...state, loading: false, error: (e as Error).message });
  }
}

export const refresh = () => (state?.cwd ? open(state.cwd) : undefined);

export const currentDir = () => state?.cwd ?? null;

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const useCode = () => useSyncExternalStore(subscribe, () => state);
