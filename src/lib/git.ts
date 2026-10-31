import { sq } from '@/lib/ssh';
import { exec } from '@/store/session';

export class GitError extends Error {
  constructor(
    message: string,
    public output: string,
  ) {
    super(message);
  }
}

export type GitFile = {
  path: string;
  /** Previous path for renames/copies */
  orig?: string;
  /** Index status (`.` = unchanged), porcelain v2 letters */
  x: string;
  /** Worktree status */
  y: string;
  untracked?: boolean;
  conflict?: boolean;
};

export type GitStatus = {
  oid: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
};

export type Commit = { sha: string; full: string; msg: string; author: string; time: number };
export type Branch = { name: string; remote: boolean; sha: string; time: number; author: string; current: boolean };
/** `commit` is the tagged commit (peeled for annotated tags). */
export type Tag = { name: string; commit: string; sha: string; time: number; msg: string; annotated: boolean };
export type Stash = { ref: string; msg: string; time: number };
export type DiffLine = { o?: number; n?: number; t: string; k?: '+' | '-' | '@' };

/** Path for a POSIX shell, keeping a leading `~` expandable. */
export function shPath(p: string) {
  const t = p.trim();
  if (!t || t === '~') return '~';
  if (t.startsWith('~/')) return `~/${sq(t.slice(2))}`;
  return sq(t);
}

const output = (r: { stdout: string; stderr: string }) => [r.stdout, r.stderr].filter((x) => x.trim()).join('\n').trimEnd();

/** Runs `git <args>` inside `repo`. `args` is inserted as-is: quote user input with `sq`. */
export async function git(repo: string, args: string, opts: { allowFail?: boolean; timeoutMs?: number } = {}) {
  const r = await exec(`cd ${shPath(repo)} && GIT_TERMINAL_PROMPT=0 GIT_EDITOR=true LC_ALL=C git -c color.ui=never -c core.quotepath=off ${args}`, opts.timeoutMs);
  if (r.exitCode !== 0 && !opts.allowFail) {
    const out = output(r);
    const line = out.split('\n').find((l) => /^(fatal|error|hint|CONFLICT)/.test(l)) ?? out.split('\n').pop() ?? '';
    throw new GitError(line.replace(/^(fatal|error): /, '') || `git a échoué (code ${r.exitCode})`, out);
  }
  return { ...r, output: output(r) };
}

function splitN(s: string, n: number) {
  const parts: string[] = [];
  let rest = s;
  for (let i = 0; i < n; i++) {
    const at = rest.indexOf(' ');
    if (at < 0) break;
    parts.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
  parts.push(rest);
  return parts;
}

export async function status(repo: string): Promise<GitStatus> {
  const { stdout } = await git(repo, 'status --porcelain=v2 --branch -z --untracked-files=all');
  const st: GitStatus = { oid: null, branch: null, upstream: null, ahead: 0, behind: 0, files: [] };
  const recs = stdout.split('\0');
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (!r) continue;
    if (r.startsWith('# ')) {
      const [, key, ...v] = r.split(' ');
      const val = v.join(' ');
      if (key === 'branch.oid') st.oid = val === '(initial)' ? null : val;
      else if (key === 'branch.head') st.branch = val === '(detached)' ? null : val;
      else if (key === 'branch.upstream') st.upstream = val;
      else if (key === 'branch.ab') {
        const m = /\+(\d+) -(\d+)/.exec(val);
        if (m) [st.ahead, st.behind] = [Number(m[1]), Number(m[2])];
      }
    } else if (r[0] === '1') {
      const f = splitN(r, 8);
      st.files.push({ x: f[1][0], y: f[1][1], path: f[8] });
    } else if (r[0] === '2') {
      const f = splitN(r, 9);
      st.files.push({ x: f[1][0], y: f[1][1], path: f[9], orig: recs[++i] });
    } else if (r[0] === 'u') {
      const f = splitN(r, 10);
      st.files.push({ x: f[1][0], y: f[1][1], path: f[10], conflict: true });
    } else if (r[0] === '?') {
      st.files.push({ x: '?', y: '?', path: r.slice(2), untracked: true });
    }
  }
  return st;
}

export const isStaged = (f: GitFile) => !f.untracked && !f.conflict && f.x !== '.';
export const isUnstaged = (f: GitFile) => !!f.untracked || !!f.conflict || f.y !== '.';

export async function log(repo: string, n = 30): Promise<Commit[]> {
  const r = await git(repo, `log -n ${n} --format=%h%x1f%H%x1f%s%x1f%an%x1f%ct%x1e`, { allowFail: true });
  if (r.exitCode !== 0) return []; // empty repo: no HEAD yet
  return r.stdout
    .split('\x1e')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [sha, full, msg, author, ct] = l.split('\x1f');
      return { sha, full, msg, author, time: Number(ct) * 1000 };
    });
}

export async function branches(repo: string): Promise<Branch[]> {
  const { stdout } = await git(repo, `for-each-ref --sort=-committerdate --format='%(refname)%09%(objectname:short)%09%(committerdate:unix)%09%(HEAD)%09%(authorname)' refs/heads refs/remotes`);
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [ref, sha, ct, head, author] = l.split('\t');
      const remote = ref.startsWith('refs/remotes/');
      return { name: ref.replace(/^refs\/(heads|remotes)\//, ''), remote, sha, time: Number(ct) * 1000, author, current: head === '*' };
    })
    .filter((b) => !(b.remote && b.name.endsWith('/HEAD')));
}

export async function tags(repo: string): Promise<Tag[]> {
  const r = await git(repo, `for-each-ref --sort=-creatordate --format='%(refname:lstrip=2)%09%(objecttype)%09%(objectname)%09%(*objectname)%09%(creatordate:unix)%09%(contents:subject)' refs/tags`, { allowFail: true });
  if (r.exitCode !== 0) return [];
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [name, type, oid, peeled, ct, ...msg] = l.split('\t');
      const commit = peeled || oid;
      return { name, commit, sha: commit.slice(0, 7), time: Number(ct) * 1000, msg: type === 'tag' ? msg.join('\t') : '', annotated: type === 'tag' };
    });
}

export async function stashes(repo: string): Promise<Stash[]> {
  const r = await git(repo, 'stash list --format=%gd%x1f%s%x1f%ct', { allowFail: true });
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [ref, msg, ct] = l.split('\x1f');
      return { ref, msg, time: Number(ct) * 1000 };
    });
}

/** Last fetch time (mtime of FETCH_HEAD), or null if never fetched. */
export async function fetchedAt(repo: string) {
  const r = await exec(`cd ${shPath(repo)} && stat -c %Y "$(git rev-parse --git-dir)/FETCH_HEAD" 2>/dev/null`);
  const t = Number(r.stdout.trim());
  return r.exitCode === 0 && t ? t * 1000 : null;
}

export function parseDiff(text: string): { lines: DiffLine[]; add: number; del: number; binary: boolean } {
  const lines: DiffLine[] = [];
  let o = 0;
  let n = 0;
  let add = 0;
  let del = 0;
  let inHunk = false;
  for (const l of text.split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) {
      o = Number(h[1]);
      n = Number(h[2]);
      inHunk = true;
      lines.push({ k: '@', t: l });
    } else if (!inHunk || l.startsWith('\\')) {
      continue;
    } else if (l[0] === '+') {
      add++;
      lines.push({ n: n++, t: l.slice(1), k: '+' });
    } else if (l[0] === '-') {
      del++;
      lines.push({ o: o++, t: l.slice(1), k: '-' });
    } else if (l[0] === ' ') {
      lines.push({ o: o++, n: n++, t: l.slice(1) });
    } else if (l.startsWith('diff --git')) {
      inHunk = false;
    }
  }
  return { lines, add, del, binary: /^Binary files /m.test(text) };
}

export async function diff(repo: string, f: GitFile, staged: boolean) {
  const p = sq(f.path);
  const r = f.untracked ? await git(repo, `diff --no-color --no-index -- /dev/null ${p}`, { allowFail: true }) : await git(repo, `diff --no-color ${staged ? '--cached ' : ''}-- ${p}`);
  return parseDiff(r.stdout);
}

export async function discardFile(repo: string, f: GitFile) {
  const p = sq(f.path);
  if (f.untracked) return git(repo, `clean -f -- ${p}`);
  if (f.x === 'A') return git(repo, `rm -f -- ${p}`);
  if (f.orig) {
    await git(repo, `rm -f -- ${p}`);
    return git(repo, `checkout HEAD -- ${sq(f.orig)}`);
  }
  return git(repo, `checkout HEAD -- ${p}`);
}

export async function discardAll(repo: string) {
  await git(repo, 'reset --hard HEAD');
  await git(repo, 'clean -fd');
}

export const stage = (repo: string, f: GitFile) => git(repo, `add -A -- ${sq(f.path)}${f.orig ? ` ${sq(f.orig)}` : ''}`);
export const unstage = (repo: string, f: GitFile) => git(repo, `reset -q HEAD -- ${sq(f.path)}${f.orig ? ` ${sq(f.orig)}` : ''}`);

export function ago(ts: number | null) {
  if (!ts) return 'jamais';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86_400);
  return d === 1 ? 'hier' : `il y a ${d} j`;
}
