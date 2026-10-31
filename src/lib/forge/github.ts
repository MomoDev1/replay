import { ForgeError, getCreds, request, type Req } from './http';
import type { Check, CheckState, MergeStrategy, Pr, PrComment, PrFile, PrState, Provider, RepoRef, Reviewer, ReviewState } from './types';

const API = 'https://api.github.com';

type User = { login: string };
type GhPr = {
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft?: boolean;
  merged_at: string | null;
  user: User | null;
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string; repo: { full_name: string } };
  updated_at: string;
  html_url: string;
  body: string | null;
  comments?: number;
  review_comments?: number;
  mergeable?: boolean | null;
  mergeable_state?: string;
  requested_reviewers?: User[];
};
type GhReview = { id: number; user: User | null; state: string; body: string; submitted_at?: string };

const t = (s: string | undefined | null) => (s ? Date.parse(s) : 0);

const STRATEGIES: Record<string, MergeStrategy> = {
  merge: { value: 'merge', label: 'Merge commit', hint: 'Garde tous les commits + un commit de merge' },
  squash: { value: 'squash', label: 'Squash', hint: 'Un seul commit sur la branche cible' },
  rebase: { value: 'rebase', label: 'Rebase', hint: 'Rejoue les commits sans commit de merge' },
};

const MERGE_HINT: Record<string, string> = {
  dirty: 'Conflits à résoudre avant le merge',
  blocked: 'Bloquée par les règles de protection (revues ou checks requis)',
  behind: 'La branche source est en retard sur la cible',
  unstable: 'Des checks ne sont pas passés',
  draft: 'Brouillon : passe-la en « Prête pour revue » pour merger',
};

export function github(repo: RepoRef): Provider {
  const base = `${API}/repos/${repo.owner}/${repo.name}`;
  let me: Promise<string | null> | null = null;

  async function call<T>(path: string, opts: Req = {}) {
    const c = await getCreds('github');
    if (!c) throw new ForgeError('Aucun jeton GitHub configuré.', 401);
    return request<T>(path.startsWith('http') ? path : base + path, `Bearer ${c.token}`, {
      ...opts,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...opts.headers },
    });
  }

  /** Follows `Link: rel="next"` up to `max` pages. */
  async function all<T>(path: string, max = 5): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = path + (path.includes('?') ? '&' : '?') + 'per_page=100';
    for (let i = 0; url && i < max; i++) {
      const r: { data: T[]; headers: Headers } = await call<T[]>(url);
      out.push(...r.data);
      url = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get('link') ?? '')?.[1] ?? null;
    }
    return out;
  }

  const login = () => (me ??= call<User>(`${API}/user`).then((r) => r.data.login, () => null));

  const toPr = (p: GhPr): Pr => ({
    id: p.number,
    title: p.title,
    state: p.merged_at ? 'merged' : p.state === 'open' ? 'open' : 'closed',
    draft: !!p.draft,
    author: p.user?.login ?? '?',
    source: p.head.ref,
    target: p.base.ref,
    updatedAt: t(p.updated_at),
    url: p.html_url,
    comments: p.comments !== undefined ? p.comments + (p.review_comments ?? 0) : undefined,
  });

  /** Latest meaningful review per user. */
  function reviewers(reviews: GhReview[], requested: User[], myLogin: string | null): Reviewer[] {
    const by = new Map<string, ReviewState>();
    for (const r of reviews) {
      const name = r.user?.login;
      if (!name) continue;
      const st: ReviewState | null = r.state === 'APPROVED' ? 'approved' : r.state === 'CHANGES_REQUESTED' ? 'changes' : r.state === 'DISMISSED' ? 'pending' : r.state === 'COMMENTED' ? 'commented' : null;
      if (!st) continue;
      // A plain comment does not override an earlier approval / change request.
      if (st === 'commented' && by.has(name) && by.get(name) !== 'pending') continue;
      by.set(name, st);
    }
    for (const u of requested) by.set(u.login, 'pending');
    return [...by].map(([name, state]) => ({ name, state, me: name === myLogin }));
  }

  return {
    async list(state: PrState) {
      const prs = await call<GhPr[]>(`/pulls?state=${state === 'open' ? 'open' : 'closed'}&sort=updated&direction=desc&per_page=50`);
      return prs.data.map(toPr).filter((p) => p.state === state);
    },

    async get(id) {
      const [{ data: p }, reviews, { data: r }, myLogin] = await Promise.all([
        call<GhPr>(`/pulls/${id}`),
        all<GhReview>(`/pulls/${id}/reviews`),
        call<{ allow_merge_commit?: boolean; allow_squash_merge?: boolean; allow_rebase_merge?: boolean; delete_branch_on_merge?: boolean }>(''),
        login(),
      ]);
      const revs = reviewers(reviews, p.requested_reviewers ?? [], myLogin);
      const strategies = [r.allow_merge_commit !== false && STRATEGIES.merge, r.allow_squash_merge !== false && STRATEGIES.squash, r.allow_rebase_merge !== false && STRATEGIES.rebase].filter(Boolean) as MergeStrategy[];
      const ms = p.draft ? 'draft' : (p.mergeable_state ?? '');
      return {
        ...toPr(p),
        body: p.body ?? '',
        headSha: p.head.sha,
        reviewers: revs.filter((x) => !x.me || x.state !== 'pending'),
        myReview: revs.find((x) => x.me)?.state ?? null,
        // Only conflicts and drafts are hard blocks; protection rules may be bypassable, so GitHub decides on merge.
        mergeable: p.draft ? false : (p.mergeable ?? null),
        mergeHint: MERGE_HINT[ms],
        sameRepo: p.head.repo?.full_name === p.base.repo.full_name,
        strategies: strategies.length ? strategies : [STRATEGIES.merge],
        defaultStrategy: (strategies[0] ?? STRATEGIES.merge).value,
        autoDeleteSource: !!r.delete_branch_on_merge,
      };
    },

    async comments(id) {
      type C = { id: number; user: User | null; body: string; created_at: string };
      const [issue, inline, reviews] = await Promise.all([
        all<C>(`/issues/${id}/comments`),
        all<C & { in_reply_to_id?: number; path: string; line?: number | null; original_line?: number | null }>(`/pulls/${id}/comments`),
        all<GhReview>(`/pulls/${id}/reviews`),
      ]);
      const out: PrComment[] = [
        ...issue.map((c): PrComment => ({ id: c.id, author: c.user?.login ?? '?', body: c.body, createdAt: t(c.created_at), kind: 'issue' })),
        ...inline.map(
          (c): PrComment => ({ id: c.id, author: c.user?.login ?? '?', body: c.body, createdAt: t(c.created_at), parentId: c.in_reply_to_id, path: c.path, line: c.line ?? c.original_line ?? undefined, kind: 'inline' }),
        ),
        ...reviews
          .filter((r) => r.body?.trim() || r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED')
          .map(
            (r): PrComment => ({
              id: r.id,
              author: r.user?.login ?? '?',
              body: r.body ?? '',
              createdAt: t(r.submitted_at),
              kind: 'review',
              review: r.state === 'APPROVED' ? 'approved' : r.state === 'CHANGES_REQUESTED' ? 'changes' : 'commented',
            }),
          ),
      ];
      return out.sort((a, b) => a.createdAt - b.createdAt);
    },

    async checks(pr) {
      type Run = { name: string; status: string; conclusion: string | null; html_url?: string; details_url?: string };
      type Status = { context: string; state: string; target_url?: string };
      const [runs, statuses] = await Promise.all([
        call<{ check_runs: Run[] }>(`/commits/${pr.headSha}/check-runs?per_page=100`).then((r) => r.data.check_runs, () => [] as Run[]),
        call<{ statuses: Status[] }>(`/commits/${pr.headSha}/status`).then((r) => r.data.statuses, () => [] as Status[]),
      ]);
      const runState = (r: Run): CheckState =>
        r.status !== 'completed' ? 'pending' : r.conclusion === 'success' ? 'success' : ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(r.conclusion ?? '') ? 'failure' : 'neutral';
      const stState = (s: string): CheckState => (s === 'success' ? 'success' : s === 'pending' ? 'pending' : 'failure');
      return [...runs.map((r): Check => ({ name: r.name, state: runState(r), url: r.html_url ?? r.details_url })), ...statuses.map((s): Check => ({ name: s.context, state: stState(s.state), url: s.target_url }))];
    },

    async commits(id) {
      type C = { sha: string; commit: { message: string; author: { name: string; date: string } | null }; author: User | null };
      const cs = await all<C>(`/pulls/${id}/commits`, 3);
      return cs.map((c) => ({ sha: c.sha, msg: c.commit.message.split('\n')[0], author: c.author?.login ?? c.commit.author?.name ?? '?', time: t(c.commit.author?.date) })).reverse();
    },

    async files(id) {
      type F = { filename: string; previous_filename?: string; status: string; additions: number; deletions: number; patch?: string };
      const fs = await all<F>(`/pulls/${id}/files`, 30);
      return fs.map(
        (f): PrFile => ({
          path: f.filename,
          oldPath: f.previous_filename,
          status: f.status === 'added' ? 'added' : f.status === 'removed' ? 'removed' : f.status === 'renamed' ? 'renamed' : 'modified',
          add: f.additions,
          del: f.deletions,
          patch: f.patch,
        }),
      );
    },

    async comment(id, body, parent) {
      if (parent?.kind === 'inline') {
        // Replies attach to the thread's root comment.
        await call(`/pulls/${id}/comments/${parent.parentId ?? parent.id}/replies`, { method: 'POST', body: { body } });
        return;
      }
      // Conversation comments have no threads on GitHub: quote the parent instead.
      const quote = parent ? `> @${parent.author} :\n${parent.body.split('\n').map((l) => `> ${l}`).join('\n')}\n\n` : '';
      await call(`/issues/${id}/comments`, { method: 'POST', body: { body: quote + body } });
    },

    async approve(id) {
      await call(`/pulls/${id}/reviews`, { method: 'POST', body: { event: 'APPROVE' } });
    },

    async unapprove(pr) {
      const myLogin = await login();
      const reviews = await all<GhReview>(`/pulls/${pr.id}/reviews`);
      const mine = reviews.filter((r) => r.user?.login === myLogin && (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED'));
      if (!mine.length) return;
      for (const r of mine) await call(`/pulls/${pr.id}/reviews/${r.id}/dismissals`, { method: 'PUT', body: { message: 'Revue retirée', event: 'DISMISS' } });
    },

    async requestChanges(id, body) {
      await call(`/pulls/${id}/reviews`, { method: 'POST', body: { event: 'REQUEST_CHANGES', body } });
    },

    async merge(pr, { strategy, message, deleteSource }) {
      const [title, ...rest] = (message ?? '').trim().split('\n');
      await call(`/pulls/${pr.id}/merge`, {
        method: 'PUT',
        body: { merge_method: strategy, sha: pr.headSha, ...(title ? { commit_title: title, commit_message: rest.join('\n').trim() } : {}) },
      });
      if (deleteSource && pr.sameRepo && !pr.autoDeleteSource) {
        await call(`/git/refs/heads/${pr.source.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' }).catch(() => {
          // Branch protected or already gone: the merge itself succeeded.
        });
      }
    },

    async close(id) {
      await call(`/pulls/${id}`, { method: 'PATCH', body: { state: 'closed' } });
    },
  };
}

export async function githubWhoAmI(token: string) {
  const r = await request<User>(`${API}/user`, `Bearer ${token}`, { headers: { Accept: 'application/vnd.github+json' } });
  return r.data.login;
}
