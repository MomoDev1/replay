import { sq } from '@/lib/ssh';
import { exec } from '@/store/session';

export type Entry = { name: string; dir: boolean };
export type FileStamp = { mtime: number; size: number };
export type LoadedFile = { b64: string; binary: boolean; stamp: FileStamp };

/** Files above this size open read-only: the whole content crosses the SSH channel and the WebView bridge. */
export const MAX_EDIT_BYTES = 1024 * 1024;
/** Files above this size are not opened at all. */
export const MAX_OPEN_BYTES = 5 * 1024 * 1024;
/** Base64 bytes per exec when saving, kept well under the SSH packet limit. */
const CHUNK = 48 * 1024;

export class FileError extends Error {}

const fail = (r: { stderr: string; stdout: string; exitCode: number }, fallback: string) =>
  new FileError((r.stderr || r.stdout).trim().split('\n').pop()?.split(': ').pop() || `${fallback} (code ${r.exitCode})`);

/** Absolute path joining, collapsing `.` and `..`. */
export function join(dir: string, name: string) {
  const parts = (name.startsWith('/') ? name : `${dir}/${name}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return '/' + out.join('/');
}

export const basename = (p: string) => p.replace(/\/+$/, '').split('/').pop() || '/';
export const dirname = (p: string) => join(p, '..');

/** Resolves a path that may start with `~` into an absolute directory path. */
export async function resolveDir(path: string) {
  const t = path.trim() || '~';
  const target = t === '~' ? '~' : t.startsWith('~/') ? `~/${sq(t.slice(2))}` : sq(t);
  const r = await exec(`cd ${target} && pwd`);
  if (r.exitCode !== 0) throw fail(r, 'Dossier inaccessible');
  return r.stdout.trim();
}

/** Lists a directory: folders first, then files, both alphabetical (dotfiles included). */
export async function list(dir: string): Promise<Entry[]> {
  // -L: a symlink to a folder is shown (and browsed) as a folder.
  const r = await exec(`cd ${sq(dir)} && LC_ALL=C ls -1ApL 2>/dev/null`);
  if (r.exitCode !== 0 && !r.stdout) throw fail(r, 'Dossier inaccessible');
  const entries = r.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => (l.endsWith('/') ? { name: l.slice(0, -1), dir: true } : { name: l, dir: false }));
  return entries.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a.dir ? -1 : 1));
}

/** mtime (s) and size of a file; GNU stat, then BSD stat. */
export async function stamp(path: string): Promise<FileStamp> {
  const r = await exec(`stat -L -c '%Y %s' ${sq(path)} 2>/dev/null || stat -L -f '%m %z' ${sq(path)}`);
  if (r.exitCode !== 0) throw fail(r, 'Fichier introuvable');
  const [mtime, size] = r.stdout.trim().split(/\s+/).map(Number);
  return { mtime, size };
}

/** Reads a file as base64 (decoded in the editor's WebView, which has a real TextDecoder). */
export async function read(path: string): Promise<LoadedFile> {
  const st = await stamp(path);
  if (st.size > MAX_OPEN_BYTES) throw new FileError(`Fichier trop volumineux (${formatSize(st.size)}, max ${formatSize(MAX_OPEN_BYTES)}).`);
  const r = await exec(`base64 < ${sq(path)} | tr -d '\\n'`, 60_000);
  if (r.exitCode !== 0) throw fail(r, 'Lecture impossible');
  const b64 = r.stdout.trim();
  // A NUL byte in the first 8 KB is how git and grep tell binary files apart.
  const head = atob(b64.slice(0, 10920)); // 10920 base64 chars = 8190 bytes, a multiple of 4
  return { b64, binary: head.includes('\0'), stamp: st };
}

/**
 * Writes base64 content to `path`. The data is uploaded and decoded into a temp file first, so a dropped
 * connection never leaves a half-written file; it is then copied over the original with `cat >`,
 * which keeps the file's owner, permissions and symlinks.
 */
export async function write(path: string, b64: string): Promise<FileStamp> {
  const tmp = `\${TMPDIR:-/tmp}/.relay-edit-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  try {
    for (let i = 0; i === 0 || i < b64.length; i += CHUNK) {
      const r = await exec(`printf %s ${sq(b64.slice(i, i + CHUNK))} ${i === 0 ? '>' : '>>'} "${tmp}.b64"`, 30_000);
      if (r.exitCode !== 0) throw fail(r, 'Envoi impossible');
    }
    const r = await exec(`base64 -d < "${tmp}.b64" > "${tmp}" && cat "${tmp}" > ${sq(path)}`, 30_000);
    if (r.exitCode !== 0) throw fail(r, 'Écriture impossible');
  } finally {
    exec(`rm -f "${tmp}" "${tmp}.b64"`).catch(() => {});
  }
  return stamp(path);
}

/** Creates an empty file (fails if it exists) or a folder. */
export async function create(path: string, dir: boolean) {
  const r = await exec(dir ? `mkdir -p ${sq(path)}` : `set -C && : > ${sq(path)}`);
  if (r.exitCode !== 0) throw fail(r, 'Création impossible');
}

/** Every file under `root`, relative: `git ls-files` in a repo, else a bounded `find`. */
export async function allFiles(root: string): Promise<string[]> {
  const r = await exec(
    `cd ${sq(root)} && if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then git ls-files -co --exclude-standard; else find . -type d \\( -name .git -o -name node_modules -o -name vendor -o -name .venv \\) -prune -o -type f -print 2>/dev/null | sed 's|^\\./||'; fi | head -20000`,
    30_000,
  );
  return r.stdout.split('\n').filter(Boolean);
}

export type GrepHit = { path: string; line: number; text: string };

/** Searches file contents under `root` (fixed string, case-insensitive). */
export async function grep(root: string, query: string): Promise<GrepHit[]> {
  const r = await exec(
    `cd ${sq(root)} && if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then git grep --untracked -n -I -i -F -e ${sq(query)}; else grep -rnIiF --exclude-dir=.git --exclude-dir=node_modules -e ${sq(query)} . 2>/dev/null; fi | head -300`,
    30_000,
  );
  return r.stdout
    .split('\n')
    .map((l) => /^(?:\.\/)?(.+?):(\d+):(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ path: m[1], line: Number(m[2]), text: m[3].trim().slice(0, 200) }));
}

export function formatSize(n: number) {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}
