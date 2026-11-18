import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { cpuUsage, levelOf, readLogs, sample, type Cursor, type LogLine, type LogSource, type Stats } from '@/lib/monitor';

export const STATS_MS = 3000;
const LOGS_MS = 2500;
export const HISTORY = 30;
const MAX_LINES = 1000;

export function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setActive(st === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

const push = (arr: number[], v: number) => [...arr, v].slice(-HISTORY);

/** Polls the server's metrics every few seconds while `active`; keeps a short history of each gauge (in %). */
export function useStats(active: boolean) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [cpu, setCpu] = useState<number[]>([]);
  const [mem, setMem] = useState<number[]>([]);
  const [disk, setDisk] = useState<number[]>([]);
  const [load, setLoad] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const prev = useRef<Stats | null>(null);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const st = await sample(!prev.current);
        if (stop) return;
        const pct = st.cpuPct ?? (prev.current ? cpuUsage(prev.current.cpuTimes, st.cpuTimes) : null);
        prev.current = st;
        setStats(st);
        setError(null);
        if (pct != null) setCpu((c) => push(c, pct));
        if (st.mem.total) setMem((m) => push(m, ((st.mem.total - st.mem.available) / st.mem.total) * 100));
        if (st.disk?.size) setDisk((d) => push(d, (st.disk!.used / st.disk!.size) * 100));
        setLoad((l) => push(l, Math.min(100, (st.load[0] / st.cpus) * 100)));
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      if (!stop) timer = setTimeout(tick, STATS_MS);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [active]);

  return { stats, cpu, mem, disk, load, error };
}

/** Follows the log source: only appended lines are fetched, a new source starts over. */
export function useLogs(src: LogSource, active: boolean) {
  const srcKey = JSON.stringify(src);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const cursor = useRef<Cursor>(null);
  const loadedKey = useRef<string | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    if (loadedKey.current !== srcKey) {
      loadedKey.current = srcKey;
      cursor.current = null;
      setLines([]);
      setError(null);
      setHint(null);
      setLoading(true);
    }
    if (!active) return;
    const source = JSON.parse(srcKey) as LogSource;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const r = await readLogs(source, cursor.current);
        if (stop) return;
        cursor.current = r.cursor;
        const fresh = r.lines.map((text) => ({ id: nextId.current++, text, lvl: levelOf(text) }));
        if (r.reset) setLines(fresh.slice(-MAX_LINES));
        else if (fresh.length) setLines((l) => [...l, ...fresh].slice(-MAX_LINES));
        if (r.hint !== undefined && r.reset) setHint(r.hint ?? null);
        setError(null);
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      if (stop) return;
      setLoading(false);
      timer = setTimeout(tick, LOGS_MS);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [srcKey, active]);

  return { lines, error, hint, loading };
}
