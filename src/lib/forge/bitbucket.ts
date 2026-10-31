import { b64, ForgeError, getCreds, request, type Req } from './http';
import type { Check, MergeStrategy, Pr, PrComment, PrCommit, PrFile, PrState, Provider, RepoRef, Reviewer } from './types';

const API = 'https://api.bitbucket.org/2.0';

type User = { display_name?: string; nickname?: string; account_id?: string; uuid?: string };
type Participant = { user: User; role: 'PARTICIPANT' | 'REVIEWER'; approved: boolean; state: 'approved' | 'changes_requested' | null };
type Branch = { name: string; merge_strategies?: string[]; default_merge_strategy?: string };
type BbPr = {
  id: number;
  title: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
  draft?: boolean;
  author: User;
  source: { branch: Branch; commit: { hash: string } | null; repository: { full_name: string } | null };
  destination: { branch: Branch; repository: { full_name: string } };
  updated_on: string;
  links: { html: { href: string } };
  summary?: { raw: string };
  description?: string;
  comment_count?: number;
  participants?: Participant[];
  reviewers?: User[];
};
type Page<T> = { values: T[]; next?: string };

const t = (s: string | undefined | null) => (s ? Date.parse(s) : 0);
const name = (u: User | null | undefined) => u?.display_name ?? u?.nickname ?? '?';
const same = (a: User, b: User | null) => !!b && ((!!a.uuid && a.uuid === b.uuid) || (!!a.account_id && a.account_id === b.account_id));

const STRATEGIES: Record<string, MergeStrategy> = {
  merge_commit: { value: 'merge_commit', label: 'Merge commit', hint: 'Garde tous les commits + un commit de merge' },
  squash: { value: 'squash', label: 'Squash', hint: 'Un seul commit sur la branche cible' },
  fast_forward: { value: 'fast_forward', label: 'Fast-forward', hint: 'Avance la cible sans commit de merge (si possible)' },
  squash_fast_forward: { value: 'squash_fast_forward', label: 'Squash + fast-forward', hint: 'Un seul commit, sans commit de merge' },
  rebase_fast_forward: { value: 'rebase_fast_forward', label: 'Rebase + fast-forward', hint: 'Rejoue les commits sur la cible' },
  rebase_merge: { value: 'rebase_merge', label: 'Rebase + merge', hint: 'Rejoue les commits puis commit de merge' },
};

/** Splits a multi-file unified diff into per-file hunks, keyed by new path (old path for deletions). */
export function splitDiff(text: string) {
  const out = new Map<string, string>();
  for (const part of text.split(/^(?=diff --git )/m)) {
    if (!part.startsWith('diff --git ')) continue;
    const plus = /^\+\+\+ (?:b\/)?(.+)$/m.exec(part)?.[1];
    const minus = /^--- (?:a\/)?(.+)$/m.exec(part)?.[1];
    const header = /^diff --git a\/(.+) b\/(.+)$/m.exec(part);
    const path = plus && plus !== '/dev/null' ? plus : minus && minus !== '/dev/null' ? minus : header?.[2];
    if (path) out.set(path.trim(), part);
  }
  return out;
}

export function bitbucket(repo: RepoRef): Provider {
  const base = `${API}/repositories/${repo.owner}/${repo.name}`;
  let me: Promise<User | null> | null = null;

  async function call<T>(path: string, opts: Req = {}) {
    const c = await getCreds('bitbucket');
    if (!c) throw new ForgeError('Aucun compte Bitbucket configuré.', 401);
    return request<T>(path.startsWith('http') ? path : base + path, `Basic ${b64(`${c.email}:${c.token}`)}`, { ...opts, headers: { Accept: 'application/json', ...opts.headers } });
  }

  async function all<T>(path: string, max = 5): Promise<T[]> {
    const out: T[] = [];
    let url: string | undefined = path + (path.includes('?') ? '&' : '?') + 'pagelen=100';
    for (let i = 0; url && i < max; i++) {
      const r: { data: Page<T> } = await call<Page<T>>(url);
      out.push(...r.data.values);
      url = r.data.next;
    }
    return out;
  }

  const whoami = () => (me ??= call<User>(`${API}/user`).then((r) => r.data, () => null));

  const toPr = (p: BbPr): Pr => ({
    id: p.id,
    title: p.title,
    state: p.state === 'OPEN' ? 'open' : p.state === 'MERGED' ? 'merged' : 'closed',
    draft: !!p.draft,
    author: name(p.author),
    source: p.source.branch.name,
    target: p.destination.branch.name,
    updatedAt: t(p.updated_on),
    url: p.links.html.href,
    approvals: p.participants?.filter((x) => x.approved).length,
    comments: p.comment_count,
  });

  return {
    async list(state: PrState) {
      const q = state === 'open' ? 'state=OPEN' : state === 'merged' ? 'state=MERGED' : 'state=DECLINED&state=SUPERSEDED';
      const r = await call<Page<BbPr>>(`/pullrequests?${q}&sort=-updated_on&pagelen=50&fields=%2Bvalues.participants,%2Bvalues.draft`);
      return r.data.values.map(toPr);
    },

    async get(id) {
      const [{ data: p }, user] = await Promise.all([call<BbPr>(`/pullrequests/${id}`), whoami()]);
      const by = new Map<string, Reviewer>();
      for (const u of p.reviewers ?? []) by.set(u.uuid ?? name(u), { name: name(u), state: 'pending', me: same(u, user) });
      for (const x of p.participants ?? []) {
        const st = x.approved || x.state === 'approved' ? 'approved' : x.state === 'changes_requested' ? 'changes' : x.role === 'REVIEWER' ? 'pending' : null;
        if (st) by.set(x.user.uuid ?? name(x.user), { name: name(x.user), state: st, me: same(x.user, user) });
      }
      const reviewers = [...by.values()];
      const allowed = p.destination.branch.merge_strategies?.filter((s) => STRATEGIES[s]) ?? ['merge_commit', 'squash', 'fast_forward'];
      const def = p.destination.branch.default_merge_strategy;
      return {
        ...toPr(p),
        body: p.summary?.raw ?? p.description ?? '',
        headSha: p.source.commit?.hash ?? '',
        reviewers: reviewers.filter((x) => !x.me || x.state !== 'pending'),
        myReview: reviewers.find((x) => x.me)?.state ?? null,
        mergeable: p.state === 'OPEN' ? null : false,
        sameRepo: !p.source.repository || p.source.repository.full_name === p.destination.repository.full_name,
        strategies: allowed.map((s) => STRATEGIES[s]),
        defaultStrategy: def && allowed.includes(def) ? def : allowed[0],
      };
    },

    async comments(id) {
      type C = {
        id: number;
        user: User;
        content: { raw: string };
        created_on: string;
        parent?: { id: number };
        inline?: { path: string; to?: number | null; from?: number | null };
        deleted?: boolean;
      };
      const cs = await all<C>(`/pullrequests/${id}/comments`, 10);
      return cs
        .map(
          (c): PrComment => ({
            id: c.id,
            author: name(c.user),
            body: c.content.raw,
            createdAt: t(c.created_on),
            parentId: c.parent?.id,
            path: c.inline?.path,
            line: c.inline?.to ?? c.inline?.from ?? undefined,
            kind: c.inline ? 'inline' : 'issue',
            deleted: c.deleted,
          }),
        )
        .sort((a, b) => a.createdAt - b.createdAt);
    },

    async checks(pr) {
      type S = { key: string; name?: string; state: 'SUCCESSFUL' | 'FAILED' | 'INPROGRESS' | 'STOPPED'; url?: string };
      const ss = await all<S>(`/pullrequests/${pr.id}/statuses`, 2).catch(() => [] as S[]);
      return ss.map((s): Check => ({ name: s.name || s.key, state: s.state === 'SUCCESSFUL' ? 'success' : s.state === 'INPROGRESS' ? 'pending' : s.state === 'FAILED' ? 'failure' : 'neutral', url: s.url }));
    },

    async commits(id) {
      type C = { hash: string; message: string; date: string; author: { raw: string; user?: User } };
      const cs = await all<C>(`/pullrequests/${id}/commits`, 3);
      return cs.map((c): PrCommit => ({ sha: c.hash, msg: c.message.split('\n')[0], author: c.author.user ? name(c.author.user) : c.author.raw.replace(/\s*<.*>$/, ''), time: t(c.date) }));
    },

    async files(id) {
      type D = { status: 'added' | 'removed' | 'modified' | 'renamed' | 'merge conflict' | 'remote deleted' | 'local deleted'; lines_added: number; lines_removed: number; old?: { path: string } | null; new?: { path: string } | null };
      const [stat, diff] = await Promise.all([all<D>(`/pullrequests/${id}/diffstat`, 30), call<string>(`/pullrequests/${id}/diff`, { raw: true, headers: { Accept: 'text/plain' }, timeoutMs: 60_000 }).then((r) => r.data, () => '')]);
      const patches = splitDiff(diff);
      return stat.map((d): PrFile => {
        const path = d.new?.path ?? d.old?.path ?? '?';
        return {
          path,
          oldPath: d.status === 'renamed' ? d.old?.path : undefined,
          status: d.status === 'added' ? 'added' : d.status === 'removed' ? 'removed' : d.status === 'renamed' ? 'renamed' : 'modified',
          add: d.lines_added,
          del: d.lines_removed,
          patch: patches.get(path),
        };
      });
    },

    async comment(id, body, parent) {
      await call(`/pullrequests/${id}/comments`, { method: 'POST', body: { content: { raw: body }, ...(parent ? { parent: { id: parent.id } } : {}) } });
    },

    async approve(id) {
      await call(`/pullrequests/${id}/approve`, { method: 'POST' });
    },

    async unapprove(pr) {
      if (pr.myReview === 'changes') await call(`/pullrequests/${pr.id}/request-changes`, { method: 'DELETE' });
      else await call(`/pullrequests/${pr.id}/approve`, { method: 'DELETE' });
    },

    async requestChanges(id, body) {
      await call(`/pullrequests/${id}/request-changes`, { method: 'POST' });
      if (body.trim()) await call(`/pullrequests/${id}/comments`, { method: 'POST', body: { content: { raw: body } } });
    },

    async merge(pr, { strategy, message, deleteSource }) {
      const r = await call<{ task_status?: string } | null>(`/pullrequests/${pr.id}/merge`, {
        method: 'POST',
        body: { type: 'pullrequest', merge_strategy: strategy, close_source_branch: deleteSource && pr.sameRepo, ...(message?.trim() ? { message: message.trim() } : {}) },
        timeoutMs: 60_000,
      });
      // Long merges run asynchronously: 202 + Location of a task to poll.
      const loc = r.status === 202 ? r.headers.get('location') : null;
      if (!loc) return;
      for (let i = 0; i < 30; i++) {
        await new Promise((ok) => setTimeout(ok, 2000));
        const s = await call<{ task_status: string }>(loc);
        if (s.data.task_status === 'SUCCESS') return;
      }
      throw new ForgeError('Le merge est toujours en cours côté Bitbucket. Rafraîchis dans un instant.', 202);
    },

    async close(id) {
      await call(`/pullrequests/${id}/decline`, { method: 'POST' });
    },
  };
}

export async function bitbucketWhoAmI(email: string, token: string) {
  const r = await request<User>(`${API}/user`, `Basic ${b64(`${email}:${token}`)}`, { headers: { Accept: 'application/json' } });
  return name(r.data);
}
