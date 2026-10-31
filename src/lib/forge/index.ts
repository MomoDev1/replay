import { git } from '@/lib/git';

import { bitbucket } from './bitbucket';
import { github } from './github';
import { onCredsChange } from './http';
import type { ForgeKind, Provider, RepoRef } from './types';

export * from './types';
export { ForgeError, getCreds, onCredsChange, setBitbucketCreds, setGithubCreds } from './http';
export { bitbucketWhoAmI } from './bitbucket';
export { githubWhoAmI } from './github';

export const forgeLabel: Record<ForgeKind, string> = { github: 'GitHub', bitbucket: 'Bitbucket' };

/**
 * Recognizes GitHub / Bitbucket Cloud remotes:
 * `https://[user@]github.com/o/r(.git)`, `git@github.com:o/r.git`, `ssh://git@bitbucket.org/ws/r.git`,
 * including SSH host aliases such as `github.com-work`.
 */
export function parseRemote(url: string): RepoRef | null {
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/i.exec(url.trim());
  if (!m) return null;
  const host = m[1].toLowerCase();
  const forge: ForgeKind | null = /(^|\.)github\.com($|-)/.test(host) ? 'github' : /(^|\.)bitbucket\.org($|-)/.test(host) ? 'bitbucket' : null;
  const parts = m[2].replace(/^\/+/, '').split('/');
  if (!forge || parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { forge, owner: parts[0], name: parts[1] };
}

/** Hosted repo for the given local repo: the upstream's remote first, then `origin`, then any. */
export async function detectRemote(repo: string, upstream?: string | null): Promise<RepoRef | null> {
  const r = await git(repo, 'remote -v', { allowFail: true });
  if (r.exitCode !== 0) return null;
  const remotes = new Map<string, string>();
  for (const l of r.stdout.split('\n')) {
    const [n, url] = l.split(/\s+/);
    if (n && url && !remotes.has(n)) remotes.set(n, url);
  }
  const prefer = [upstream?.split('/')[0], 'origin', ...remotes.keys()].filter(Boolean) as string[];
  for (const n of prefer) {
    const ref = remotes.get(n) && parseRemote(remotes.get(n)!);
    if (ref) return ref;
  }
  return null;
}

const providers = new Map<string, Provider>();

export function providerFor(ref: RepoRef): Provider {
  const k = `${ref.forge}:${ref.owner}/${ref.name}`;
  let p = providers.get(k);
  if (!p) providers.set(k, (p = ref.forge === 'github' ? github(ref) : bitbucket(ref)));
  return p;
}

/** Drops cached providers (and their cached "who am I") after an account change. */
export function resetProviders() {
  providers.clear();
}
onCredsChange(resetProviders);

export const repoKey = (ref: RepoRef) => `${ref.forge}:${ref.owner}/${ref.name}`;
