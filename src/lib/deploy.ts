import Storage from 'expo-sqlite/kv-store';

import { shPath } from '@/lib/git';
import { sq } from '@/lib/ssh';
import { exec } from '@/store/session';

/**
 * Deployment pipeline: a fixed list of named steps, each a shell command run in the project folder.
 * Every step is started detached on the server (it survives a dropped connection) and its output is written
 * to a file that the app polls, so logs show up live.
 */

export type StepDef = { name: string; cmd: string };

export const DEFAULT_STEPS: StepDef[] = [
  { name: 'Pull', cmd: 'git pull --ff-only' },
  { name: 'Dépendances', cmd: 'npm ci --omit=dev' },
  { name: 'Build', cmd: 'npm run build' },
  { name: 'Migrations', cmd: 'npm run migrate' },
  { name: 'Redémarrage', cmd: 'pm2 reload all --update-env' },
  { name: 'Vérification', cmd: 'curl -fsS http://localhost/health' },
];

/** Index of the steps after which the running service is affected (restart and verification). */
export const RESTART_STEP = 4;
export const MIGRATIONS_STEP = 3;

const stepsKey = (serverId: string) => `deploy.steps.${serverId}`;

export function stepsFor(serverId: string): StepDef[] {
  try {
    const raw = Storage.getItemSync(stepsKey(serverId));
    const saved = raw ? (JSON.parse(raw) as StepDef[]) : null;
    if (saved?.length === DEFAULT_STEPS.length) return saved;
  } catch {}
  return DEFAULT_STEPS;
}

export function saveSteps(serverId: string, steps: StepDef[]) {
  Storage.setItemSync(stepsKey(serverId), JSON.stringify(steps));
}

const DIR = '"$HOME/.cache/hop"';

const section = (out: string, name: string) => (out.split(`@@${name}\n`)[1] ?? '').split('\n@@')[0].trim();

export type Plan = {
  /** Version currently checked out (closest tag, or short hash). */
  version: string;
  sha: string;
  target: { version: string; sha: string };
  upstream: string | null;
  commits: number;
  files: number;
  /** Migration files added by the update. */
  migrations: number;
};

/** Fetches the remote and describes what a deploy would bring. */
export async function plan(repo: string): Promise<Plan> {
  const g = 'GIT_TERMINAL_PROMPT=0 LC_ALL=C git -c color.ui=never';
  const script = [
    `cd ${shPath(repo)} || exit 3`,
    `${g} rev-parse --git-dir >/dev/null 2>&1 || { echo "Pas un dépôt Git : ${repo.replace(/"/g, '')}" >&2; exit 4; }`,
    `${g} fetch --quiet 2>/dev/null`,
    `echo @@sha; ${g} rev-parse --short HEAD`,
    `echo @@ver; ${g} describe --tags --always HEAD`,
    `echo @@up; ${g} rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null`,
    `echo @@tsha; ${g} rev-parse --short '@{u}' 2>/dev/null`,
    `echo @@tver; ${g} describe --tags --always '@{u}' 2>/dev/null`,
    `echo @@count; ${g} rev-list --count 'HEAD..@{u}' 2>/dev/null`,
    `echo @@files; ${g} diff --name-only HEAD '@{u}' 2>/dev/null | wc -l`,
    `echo @@mig; ${g} diff --name-only --diff-filter=A HEAD '@{u}' 2>/dev/null | grep -ci migrat`,
    'echo @@end; exit 0',
  ].join('\n');
  const r = await exec(script, 60_000);
  if (r.exitCode === 3) throw new Error(`Dossier introuvable : ${repo}`);
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `Préparation impossible (code ${r.exitCode})`);
  const out = r.stdout.replace(/\r/g, '');
  const sha = section(out, 'sha');
  const version = section(out, 'ver') || sha;
  const upstream = section(out, 'up') || null;
  const tsha = section(out, 'tsha') || sha;
  return {
    sha,
    version,
    upstream,
    target: { sha: tsha, version: section(out, 'tver') || version },
    commits: Number(section(out, 'count')) || 0,
    files: Number(section(out, 'files')) || 0,
    migrations: Number(section(out, 'mig')) || 0,
  };
}

/** Short hash and version of HEAD, read after the pull step. */
export async function head(repo: string) {
  const r = await exec(`cd ${shPath(repo)} && LC_ALL=C git rev-parse --short HEAD && LC_ALL=C git describe --tags --always HEAD`, 20_000);
  const [sha, version] = r.stdout.trim().split('\n');
  return { sha: sha ?? '', version: version || sha || '' };
}

/** Starts a step detached on the server; returns its process id (also its process group with setsid). */
export async function startStep(repo: string, cmd: string, id: string) {
  // Login shell so that nvm, rbenv… set up in the profile are on the PATH, as when the user logs in.
  const body = `(${cmd}\n); echo $? > "$0"`;
  const script = [
    `d=${DIR}; mkdir -p "$d" || exit 5`,
    'find "$d" -type f -mtime +7 -delete 2>/dev/null',
    `cd ${shPath(repo)} || exit 3`,
    'if command -v bash >/dev/null 2>&1; then sh_="bash -l"; else sh_=sh; fi',
    'if command -v setsid >/dev/null 2>&1; then ss_=setsid; else ss_=; fi',
    `rm -f "$d/${id}.exit"`,
    `TERM=dumb CI=1 nohup $ss_ $sh_ -c ${sq(body)} "$d/${id}.exit" > "$d/${id}.log" 2>&1 < /dev/null &`,
    'echo $!',
  ].join('\n');
  const r = await exec(script, 20_000);
  if (r.exitCode === 3) throw new Error(`Dossier introuvable : ${repo}`);
  const pid = Number(r.stdout.trim().split('\n').pop());
  if (r.exitCode !== 0 || !pid) throw new Error(r.stderr.trim() || 'Impossible de lancer l’étape');
  return pid;
}

export type Poll = { log: string[]; exit: number | null; alive: boolean };

export async function pollStep(id: string, pid: number): Promise<Poll> {
  const r = await exec(`d=${DIR}; tail -n 300 "$d/${id}.log" 2>/dev/null; echo; echo @@exit; cat "$d/${id}.exit" 2>/dev/null; echo @@alive; kill -0 ${pid} 2>/dev/null && echo 1 || echo 0; exit 0`, 20_000);
  const out = r.stdout.replace(/\r/g, '');
  const at = out.lastIndexOf('\n@@exit\n');
  const log = out
    .slice(0, at < 0 ? out.length : at)
    .split('\n')
    // Progress bars redraw a line with \r: keep what the line ends with.
    .map((l) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''));
  while (log.length && !log[log.length - 1].trim()) log.pop();
  const exitRaw = section(out, 'exit');
  return { log, exit: exitRaw === '' ? null : Number(exitRaw), alive: section(out, 'alive') === '1' };
}

export async function killStep(pid: number) {
  await exec(`kill -TERM -- -${pid} 2>/dev/null || { pkill -TERM -P ${pid} 2>/dev/null; kill -TERM ${pid} 2>/dev/null; }; exit 0`, 10_000);
}

/** The line that best explains a failure: the last one that looks like an error, else the last line. */
export function errorLine(log: string[]) {
  const lines = log.filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) if (/error|erreur|fatal|failed|exception|denied|not found|introuvable|SQLSTATE/i.test(lines[i])) return lines[i].trim();
  return lines[lines.length - 1]?.trim() ?? '';
}

/** `2,1 s`, `1 min 38` */
export function fmtDuration(ms: number) {
  const s = ms / 1000;
  if (s < 60) return `${s.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** `01:05` */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** `hier 17:58`, `lun. 10:12`, `24 oct.` */
export function when(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `auj. ${hm}`;
  if (diff === 1) return `hier ${hm}`;
  if (diff < 7) return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${hm}`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
