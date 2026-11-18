import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import * as D from '@/lib/deploy';
import { sq } from '@/lib/ssh';
import type { Server } from '@/lib/types';

export type StepState = 'wait' | 'run' | 'ok' | 'ko' | 'skip';
export type RunStep = D.StepDef & { state: StepState; startedAt: number | null; durMs: number | null; log: string[]; exit: number | null };
export type Phase = 'running' | 'ok' | 'ko' | 'cancelled';

export type Run = {
  id: string;
  serverId: string;
  kind: 'deploy' | 'rollback';
  phase: Phase;
  steps: RunStep[];
  current: number;
  startedAt: number;
  endedAt: number | null;
  from: { version: string; sha: string };
  to: { version: string; sha: string };
  error: { text: string; step: string; exit: number | null } | null;
  /** The service was restarted (or verification ran) before the failure. */
  touchedService: boolean;
};

export type DeployRecord = {
  id: string;
  serverId: string;
  kind: 'deploy' | 'rollback';
  status: 'ok' | 'ko' | 'cancelled';
  version: string;
  sha: string;
  prevVersion: string | null;
  prevSha: string | null;
  failedStep: string | null;
  error: string | null;
  startedAt: number;
  durationMs: number;
};

let run: Run | null = null;
let cancelRequested = false;
let livePid: number | null = null;
const listeners = new Set<() => void>();
let historyVersion = 0;

function emit() {
  listeners.forEach((l) => l());
}

function patch(p: Partial<Run>) {
  if (!run) return;
  run = { ...run, ...p };
  emit();
}

function patchStep(i: number, p: Partial<RunStep>) {
  if (!run) return;
  const steps = run.steps.slice();
  steps[i] = { ...steps[i], ...p };
  run = { ...run, steps };
  emit();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = { id: string; server_id: string; kind: string; status: string; version: string; commit_sha: string; prev_version: string | null; prev_commit: string | null; failed_step: string | null; error: string | null; started_at: number; duration_ms: number };

export async function history(db: SQLiteDatabase, serverId: string, limit = 10): Promise<DeployRecord[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM deploys WHERE server_id = ? ORDER BY started_at DESC LIMIT ?', serverId, limit);
  return rows.map((r) => ({
    id: r.id,
    serverId: r.server_id,
    kind: r.kind as DeployRecord['kind'],
    status: r.status as DeployRecord['status'],
    version: r.version,
    sha: r.commit_sha,
    prevVersion: r.prev_version,
    prevSha: r.prev_commit,
    failedStep: r.failed_step,
    error: r.error,
    startedAt: r.started_at,
    durationMs: r.duration_ms,
  }));
}

async function record(db: SQLiteDatabase, r: Run) {
  const failed = r.phase === 'ok' ? null : (r.steps[r.current]?.name ?? null);
  await db.runAsync(
    'INSERT INTO deploys (id, server_id, kind, status, version, commit_sha, prev_version, prev_commit, failed_step, error, started_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    r.id, r.serverId, r.kind, r.phase === 'running' ? 'ko' : r.phase, r.to.version, r.to.sha, r.from.version, r.from.sha, failed, r.error?.text ?? null, r.startedAt, (r.endedAt ?? Date.now()) - r.startedAt,
  );
  historyVersion++;
  emit();
}

export const isRunning = () => run?.phase === 'running';

/**
 * Runs the pipeline on the server of the open session. A rollback replaces the pull by a hard reset to `to.sha`
 * and skips the migrations (they are not reversible in general).
 */
export async function start(db: SQLiteDatabase, server: Server, repo: string, opts: { kind: 'deploy' | 'rollback'; from: { version: string; sha: string }; to: { version: string; sha: string } }) {
  if (isRunning()) return;
  const defs = D.stepsFor(server.id).map((s, i) => {
    if (opts.kind !== 'rollback') return s;
    if (i === 0) return { name: 'Retour', cmd: `git reset --hard ${sq(opts.to.sha)}` };
    if (i === D.MIGRATIONS_STEP) return { ...s, cmd: '' };
    return s;
  });
  cancelRequested = false;
  run = {
    id: randomUUID(),
    serverId: server.id,
    kind: opts.kind,
    phase: 'running',
    steps: defs.map((d) => ({ ...d, state: 'wait', startedAt: null, durMs: null, log: [], exit: null })),
    current: 0,
    startedAt: Date.now(),
    endedAt: null,
    from: opts.from,
    to: opts.to,
    error: null,
    touchedService: false,
  };
  emit();

  for (let i = 0; i < defs.length; i++) {
    const cur = run!;
    if (!defs[i].cmd.trim()) {
      patchStep(i, { state: 'skip' });
      continue;
    }
    patch({ current: i, touchedService: cur.touchedService || i >= D.RESTART_STEP });
    const started = Date.now();
    patchStep(i, { state: 'run', startedAt: started });
    let exit: number | null = null;
    let log: string[] = [];
    try {
      const sid = `${run!.id.slice(0, 8)}-${i}`;
      const pid = await D.startStep(repo, defs[i].cmd, sid);
      livePid = pid;
      let deadPolls = 0;
      while (exit === null) {
        await sleep(1000);
        const p = await D.pollStep(sid, pid);
        log = p.log;
        exit = p.exit;
        patchStep(i, { log, durMs: Date.now() - started });
        // Process gone without an exit code (killed, server rebooted): give the exit file a moment, then give up.
        if (exit === null && !p.alive && ++deadPolls >= 3) exit = 137;
      }
    } catch (e) {
      log = [...log, (e as Error).message];
      exit = exit ?? -1;
    }
    livePid = null;
    const durMs = Date.now() - started;
    if (exit === 0 && !cancelRequested) {
      patchStep(i, { state: 'ok', durMs, log, exit });
      // The pull moved HEAD: the deployed version is now known exactly.
      if (i === 0 && opts.kind === 'deploy') {
        try {
          patch({ to: await D.head(repo) });
        } catch {}
      }
      continue;
    }
    patchStep(i, { state: 'ko', durMs, log, exit });
    for (let j = i + 1; j < defs.length; j++) patchStep(j, { state: 'skip' });
    const text = cancelRequested ? 'Déploiement annulé' : D.errorLine(log) || `La commande a échoué (code ${exit})`;
    patch({ phase: cancelRequested ? 'cancelled' : 'ko', endedAt: Date.now(), error: { text, step: defs[i].name, exit } });
    await record(db, run!);
    return;
  }
  patch({ phase: 'ok', current: defs.length - 1, endedAt: Date.now() });
  await record(db, run!);
}

export async function cancel() {
  if (!isRunning()) return;
  cancelRequested = true;
  emit();
  if (livePid) await D.killStep(livePid).catch(() => {});
}

/** Clears a finished run so that the screen goes back to "ready". */
export function dismiss() {
  if (run && run.phase !== 'running') {
    run = null;
    emit();
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const useRun = () => useSyncExternalStore(subscribe, () => run);
export const isCancelling = () => cancelRequested;
/** Changes each time a deploy is recorded, to reload histories. */
export const useHistoryVersion = () => useSyncExternalStore(subscribe, () => historyVersion);
