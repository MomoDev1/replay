import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';

import * as G from '@/lib/git';
import type { Server } from '@/lib/types';

export type GitState = {
  serverId: string;
  repo: string;
  status: G.GitStatus | null;
  commits: G.Commit[];
  stashes: G.Stash[];
  tags: G.Tag[];
  fetchedAt: number | null;
  loading: boolean;
  error: string | null;
};

let state: GitState | null = null;
const listeners = new Set<() => void>();
let seq = 0;

function set(patch: Partial<GitState>) {
  if (!state) return;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const repoKey = (serverId: string) => `git.repo.${serverId}`;

export const repoFor = (server: Server) => Storage.getItemSync(repoKey(server.id)) || server.path || '~';

function reset(serverId: string, repo: string) {
  seq++;
  state = { serverId, repo, status: null, commits: [], stashes: [], tags: [], fetchedAt: null, loading: false, error: null };
  listeners.forEach((l) => l());
  return refresh();
}

/** Points the store at a server's saved repo and loads it; a no-op if already selected. */
export function selectServer(server: Server) {
  if (state?.serverId === server.id) return;
  return reset(server.id, repoFor(server));
}

export function setRepo(server: Server, repo: string) {
  Storage.setItemSync(repoKey(server.id), repo);
  return reset(server.id, repo);
}

export async function refresh() {
  if (!state) return;
  const { repo } = state;
  const id = ++seq;
  set({ loading: true });
  try {
    const status = await G.status(repo);
    const [commits, stashes, tags, fetchedAt] = await Promise.all([G.log(repo), G.stashes(repo), G.tags(repo), G.fetchedAt(repo)]);
    if (id === seq) set({ status, commits, stashes, tags, fetchedAt, error: null, loading: false });
  } catch (e) {
    if (id === seq) set({ status: null, commits: [], stashes: [], tags: [], error: (e as Error).message, loading: false });
  }
}

/** Runs a git action on the current repo, reports failures in an alert, then reloads the state. */
export async function act<T>(fn: (repo: string) => Promise<T>): Promise<T | undefined> {
  try {
    return await fn(currentRepo());
  } catch (e) {
    Alert.alert('Git', (e as Error).message);
  } finally {
    refresh();
  }
}

/** Current repo path; throws if no server is selected. */
export function currentRepo() {
  if (!state) throw new Error('Aucun dépôt sélectionné');
  return state.repo;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const useGit = () => useSyncExternalStore(subscribe, () => state);
