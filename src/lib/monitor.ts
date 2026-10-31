import { shPath } from '@/lib/git';
import { sq } from '@/lib/ssh';
import { exec } from '@/store/session';

export type CpuTimes = { busy: number; total: number };
export type Proc = { pid: number; cpu: number; mem: number; name: string };

export type Stats = {
  host: string;
  cpus: number;
  /** Cumulated jiffies from /proc/stat, used to compute the usage between two samples. */
  cpuTimes: CpuTimes;
  /** Usage measured inside the sample itself (first sample only, when there is nothing to compare with). */
  cpuPct: number | null;
  mem: { total: number; available: number; swapTotal: number; swapFree: number };
  load: [number, number, number];
  uptimeSec: number;
  /** Bytes */
  disk: { size: number; used: number; avail: number; mount: string } | null;
  procs: Proc[];
};

const section = (out: string, name: string) => {
  const m = out.split(`@@${name}\n`)[1];
  return (m ?? '').split('\n@@')[0].trim();
};

function parseCpu(line: string): CpuTimes | null {
  const n = line.trim().split(/\s+/).slice(1).map(Number);
  if (n.length < 4 || n.some(Number.isNaN)) return null;
  // user nice system idle iowait irq softirq steal (guest is already counted in user)
  const total = n.slice(0, 8).reduce((a, b) => a + b, 0);
  const idle = n[3] + (n[4] ?? 0);
  return { busy: total - idle, total };
}

export const cpuUsage = (a: CpuTimes, b: CpuTimes) => {
  const dt = b.total - a.total;
  return dt > 0 ? Math.min(100, Math.max(0, ((b.busy - a.busy) / dt) * 100)) : 0;
};

/** One round-trip: everything the dashboard needs, read from /proc (Linux). */
export async function sample(first: boolean): Promise<Stats> {
  const script = [
    'export LC_ALL=C',
    'echo @@stat; head -n1 /proc/stat',
    // The very first sample measures over 0.4 s so the CPU card is not empty for a whole interval.
    first ? 'sleep 0.4; echo @@stat2; head -n1 /proc/stat' : '',
    "echo @@mem; grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree):' /proc/meminfo",
    'echo @@load; cat /proc/loadavg',
    'echo @@up; cat /proc/uptime',
    'echo @@cpus; nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo',
    'echo @@host; hostname 2>/dev/null || uname -n',
    'echo @@df; df -kP / 2>/dev/null | tail -n 1',
    'echo @@ps; ps -eo pid=,pcpu=,pmem=,comm= --sort=-pcpu 2>/dev/null | head -n 5',
    'echo @@end',
  ]
    .filter(Boolean)
    .join('; ');
  const r = await exec(script, 15_000);
  const out = r.stdout.replace(/\r/g, '');

  const cpuTimes = parseCpu(section(out, 'stat'));
  if (!cpuTimes) throw new Error('Métriques indisponibles : /proc est absent (le monitoring nécessite un serveur Linux).');
  const cpu2 = first ? parseCpu(section(out, 'stat2')) : null;

  const mem = Object.fromEntries(
    section(out, 'mem')
      .split('\n')
      .map((l) => l.match(/^(\w+):\s+(\d+)/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], Number(m[2]) * 1024]),
  );
  const load = section(out, 'load').split(/\s+/).slice(0, 3).map(Number);
  const df = section(out, 'df').split(/\s+/);
  const procs = section(out, 'ps')
    .split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ pid: Number(m[1]), cpu: Number(m[2]), mem: Number(m[3]), name: m[4] }));

  return {
    host: section(out, 'host') || '?',
    cpus: Number(section(out, 'cpus')) || 1,
    cpuTimes: cpu2 ?? cpuTimes,
    cpuPct: cpu2 ? cpuUsage(cpuTimes, cpu2) : null,
    mem: {
      total: mem.MemTotal ?? 0,
      // Kernels older than 3.14 have no MemAvailable.
      available: mem.MemAvailable ?? 0,
      swapTotal: mem.SwapTotal ?? 0,
      swapFree: mem.SwapFree ?? 0,
    },
    load: [load[0] || 0, load[1] || 0, load[2] || 0],
    uptimeSec: Number(section(out, 'up').split(/\s+/)[0]) || 0,
    disk: df.length >= 6 && !Number.isNaN(Number(df[1])) ? { size: Number(df[1]) * 1024, used: Number(df[2]) * 1024, avail: Number(df[3]) * 1024, mount: df[5] } : null,
    procs,
  };
}

// ---------------------------------------------------------------------------
// Logs

export type LogSource = { kind: 'file'; path: string } | { kind: 'journal'; unit: string } | { kind: 'cmd'; cmd: string };
export type Level = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
export type LogLine = { id: number; text: string; lvl: Level };

/** Position reached in the source, so the next poll only reads what was appended. */
export type Cursor = { kind: 'file'; offset: number; carry: string } | { kind: 'journal'; cursor: string | null } | null;

const MAX_CHUNK = 64 * 1024;
const INITIAL_LINES = 200;

export function sourceLabel(src: LogSource) {
  if (src.kind === 'file') return `tail -f ${src.path}`;
  if (src.kind === 'journal') return `journalctl -f${src.unit ? ` -u ${src.unit}` : ''}`;
  return src.cmd;
}

export function levelOf(line: string): Level {
  if (/\b(ERROR|ERR|FATAL|CRIT(ICAL)?|EMERG(ENCY)?|ALERT|PANIC|SEVERE)\b|Traceback|Exception\b|\s(5\d\d)\s/i.test(line)) return 'ERROR';
  if (/\b(WARN(ING)?|NOTICE)\b|\s(4\d\d)\s/i.test(line)) return 'WARN';
  if (/\b(DEBUG|TRACE|VERBOSE)\b/i.test(line)) return 'DEBUG';
  return 'INFO';
}

const firstLine = (s: string) => s.trim().split('\n').find(Boolean) ?? '';

async function readFile(path: string, cur: Extract<Cursor, { kind: 'file' }> | null) {
  const f = shPath(path);
  const off = cur?.offset ?? -1;
  // Size first, then read exactly up to that size: lines appended meanwhile are picked up next time.
  // Truncated / rotated file (size < offset) or too far behind → restart from the end of the file.
  const script = [
    `f=${f}`,
    `[ -r "$f" ] || { [ -e "$f" ] && echo "Permission refusée : $f" >&2 || echo "Fichier introuvable : $f" >&2; exit 3; }`,
    `s=$(wc -c < "$f" | tr -d ' ')`,
    `echo "@@size $s"`,
    `o=${off}`,
    `if [ "$o" -lt 0 ] || [ "$s" -lt "$o" ] || [ $((s - o)) -gt ${MAX_CHUNK} ]; then st=$((s > ${MAX_CHUNK} ? s - ${MAX_CHUNK} + 1 : 1)); echo "@@reset $st"; else st=$((o + 1)); fi`,
    `[ "$s" -ge "$st" ] && tail -c +$st "$f" | head -c $((s - st + 1))`,
    'exit 0',
  ].join('\n');
  const r = await exec(script, 15_000);
  if (r.exitCode !== 0) throw new Error(firstLine(r.stderr) || `Lecture impossible (code ${r.exitCode})`);
  const nl = r.stdout.indexOf('\n');
  const size = Number(r.stdout.slice(0, nl).replace('@@size ', ''));
  let body = r.stdout.slice(nl + 1);
  let reset = !cur;
  if (body.startsWith('@@reset ')) {
    const n2 = body.indexOf('\n');
    const start = Number(body.slice(8, n2));
    body = body.slice(n2 + 1);
    // Starting mid-file: the first line is partial.
    if (start > 1) body = body.slice(body.indexOf('\n') + 1);
    reset = true;
  }
  const text = (reset ? '' : (cur?.carry ?? '')) + body;
  const lines = text.split('\n');
  const carry = lines.pop() ?? '';
  return { lines: reset ? lines.slice(-INITIAL_LINES) : lines, reset, cursor: { kind: 'file', offset: size, carry } as const };
}

async function readJournal(unit: string, cur: Extract<Cursor, { kind: 'journal' }> | null) {
  const args = ['--no-pager', '-q', '-o', 'short-iso', '--show-cursor'];
  if (unit) args.push('-u', sq(unit));
  args.push(cur?.cursor ? `--after-cursor=${sq(cur.cursor)}` : `-n ${INITIAL_LINES}`);
  const r = await exec(`command -v journalctl >/dev/null || { echo "journalctl introuvable sur ce serveur" >&2; exit 3; }; journalctl ${args.join(' ')} | tail -n 1000`, 15_000);
  if (r.exitCode !== 0) throw new Error(firstLine(r.stderr) || `journalctl a échoué (code ${r.exitCode})`);
  const lines = r.stdout.replace(/\r/g, '').split('\n').filter(Boolean);
  let cursor = cur?.cursor ?? null;
  if (lines.length && lines[lines.length - 1].startsWith('-- cursor: ')) cursor = lines.pop()!.slice(11);
  const limited = /not seeing messages/i.test(r.stderr);
  // The exit code is tail's: a journalctl failure only shows as an empty output plus stderr.
  if (!cur && !lines.length && !limited && r.stderr.trim()) throw new Error(firstLine(r.stderr));
  return { lines, reset: !cur, cursor: { kind: 'journal', cursor } as const, hint: !cur && limited ? 'Seuls tes propres logs sont visibles : ajoute ton utilisateur au groupe systemd-journal (ou adm) pour voir ceux du système.' : null };
}

async function readCmd(cmd: string) {
  const r = await exec(`{ ${cmd}\n} 2>&1 | tail -n ${INITIAL_LINES}`, 20_000);
  const lines = r.stdout.replace(/\r/g, '').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  if (!lines.length && r.exitCode !== 0) throw new Error(`La commande a échoué (code ${r.exitCode})`);
  return { lines, reset: true, cursor: null };
}

/** Reads the lines added since `cursor` (or the last ones on the first call). `reset` = replace what is shown. */
export async function readLogs(src: LogSource, cursor: Cursor): Promise<{ lines: string[]; reset: boolean; cursor: Cursor; hint?: string | null }> {
  if (src.kind === 'file') return readFile(src.path, cursor?.kind === 'file' ? cursor : null);
  if (src.kind === 'journal') return readJournal(src.unit, cursor?.kind === 'journal' ? cursor : null);
  return readCmd(src.cmd);
}

/** Readable log files among the usual locations (and under the server's project folder). */
export async function detectLogFiles(projectPath: string) {
  const base = projectPath && projectPath !== '~' ? shPath(projectPath.replace(/\/+$/, '')) : '';
  const candidates = [
    base && `${base}/storage/logs/laravel.log`,
    base && `${base}/var/log/prod.log`,
    base && `${base}/log/production.log`,
    base && `${base}/logs/app.log`,
    '/var/log/syslog',
    '/var/log/messages',
    '/var/log/nginx/error.log',
    '/var/log/nginx/access.log',
    '/var/log/apache2/error.log',
    '/var/log/httpd/error_log',
    '/var/log/auth.log',
  ].filter(Boolean);
  const pm2 = '$HOME/.pm2/logs/*.log';
  const r = await exec(`for f in ${candidates.join(' ')} ${pm2}; do [ -f "$f" ] && [ -r "$f" ] && echo "$f"; done; exit 0`, 10_000);
  return r.stdout.split('\n').filter(Boolean);
}

/** Running systemd services, to pick a unit for the journal. */
export async function detectServices() {
  const r = await exec('systemctl list-units --type=service --state=running --no-legend --plain --no-pager 2>/dev/null | head -n 60; exit 0', 10_000);
  return r.stdout
    .split('\n')
    .map((l) => l.trim().split(/\s+/)[0])
    .filter((u) => u?.endsWith('.service'))
    .map((u) => u.replace(/\.service$/, ''));
}

// ---------------------------------------------------------------------------
// Formatting

export function bytes(n: number) {
  const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: n < 10 && i > 0 ? 1 : 0 })} ${u[i]}`;
}

export function duration(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d} j ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}
