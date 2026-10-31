import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import type { LogSource } from '@/lib/monitor';

const key = (serverId: string) => `monitor.logs.${serverId}`;
const DEFAULT: LogSource = { kind: 'journal', unit: '' };

const cache = new Map<string, LogSource>();
const listeners = new Set<() => void>();

/** Log source chosen for a server; defaults to the systemd journal. */
export function logSourceFor(serverId: string): LogSource {
  const hit = cache.get(serverId);
  if (hit) return hit;
  let src = DEFAULT;
  try {
    const raw = Storage.getItemSync(key(serverId));
    if (raw) src = JSON.parse(raw) as LogSource;
  } catch {}
  cache.set(serverId, src);
  return src;
}

export function setLogSource(serverId: string, src: LogSource) {
  Storage.setItemSync(key(serverId), JSON.stringify(src));
  cache.set(serverId, src);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const NONE: LogSource | null = null;

export const useLogSource = (serverId: string | undefined) => useSyncExternalStore(subscribe, () => (serverId ? logSourceFor(serverId) : NONE));
