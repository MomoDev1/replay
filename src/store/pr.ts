import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';

import { providerFor, repoKey, type Check, type PrComment, type PrCommit, type PrDetail, type PrFile, type Provider, type RepoRef } from '@/lib/forge';

export type PrStore = {
  key: string;
  ref: RepoRef;
  id: number;
  pr: PrDetail | null;
  comments: PrComment[];
  checks: Check[];
  commits: PrCommit[] | null;
  files: PrFile[] | null;
  loading: boolean;
  error: string | null;
};

let state: PrStore | null = null;
const listeners = new Set<() => void>();
let seq = 0;

function set(patch: Partial<PrStore>) {
  if (!state) return;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Selects a PR and loads it (a no-op reload if it is already selected). */
export function openPr(ref: RepoRef, id: number) {
  const key = `${repoKey(ref)}#${id}`;
  if (state?.key !== key) {
    state = { key, ref, id, pr: null, comments: [], checks: [], commits: null, files: null, loading: false, error: null };
    listeners.forEach((l) => l());
  }
  return reloadPr();
}

export async function reloadPr() {
  if (!state) return;
  const { ref, id, key } = state;
  const p = providerFor(ref);
  const n = ++seq;
  set({ loading: true });
  try {
    const [pr, comments] = await Promise.all([p.get(id), p.comments(id)]);
    if (n !== seq) return;
    set({ pr, comments, files: null, commits: null, error: null, loading: false });
    const checks = await p.checks(pr).catch(() => []);
    if (state?.key === key) set({ checks });
  } catch (e) {
    if (n === seq) set({ error: (e as Error).message, loading: false });
  }
}

/** Lazily loads the files or commits tab. */
const inflight = new Set<string>();

export async function loadPrExtra(what: 'files' | 'commits') {
  if (!state || state[what]) return;
  const { ref, id, key } = state;
  const k = `${key}|${what}`;
  if (inflight.has(k)) return;
  inflight.add(k);
  try {
    const data = what === 'files' ? await providerFor(ref).files(id) : await providerFor(ref).commits(id);
    if (state?.key === key) set({ [what]: data });
  } catch (e) {
    if (state?.key !== key) return;
    // Empty list stops the screen from retrying in a loop; pull-to-refresh reloads it.
    set({ [what]: [] });
    Alert.alert(what === 'files' ? 'Fichiers' : 'Commits', (e as Error).message);
  } finally {
    inflight.delete(k);
  }
}

/** Runs an action on the current PR, alerts on failure, then reloads. Returns true on success. */
export async function prAct(fn: (p: Provider, pr: PrDetail) => Promise<unknown>, title = 'Pull request') {
  const cur = state;
  if (!cur?.pr) return false;
  try {
    await fn(providerFor(cur.ref), cur.pr);
    return true;
  } catch (e) {
    Alert.alert(title, (e as Error).message);
    return false;
  } finally {
    if (state?.key === cur.key) {
      // Files/commits may change after a merge or push; refetch on demand.
      set({ files: null, commits: null });
      reloadPr();
    }
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const usePr = () => useSyncExternalStore(subscribe, () => state);
