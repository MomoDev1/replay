import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useIsFocused } from 'expo-router';
import { Activity, Check, ChevronRight, Copy, ListChecks, Pause, Play, Share2, Sparkles, TextSelect, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, FlatList, Pressable, Share, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Dot, Mono, s } from '@/components/ui';
import { bytes, cpuUsage, duration, levelOf, logsAsMarkdown, readLogs, sample, sourceLabel, type Cursor, type Level, type LogLine, type LogSource, type Stats } from '@/lib/monitor';
import type { Server } from '@/lib/types';
import { useLogSource } from '@/store/monitor';
import { useSession } from '@/store/session';
import { C } from '@/theme';

const STATS_MS = 3000;
const LOGS_MS = 2500;
const HISTORY = 30;
const MAX_LINES = 1000;

const lvlColor: Record<Level, string> = { INFO: C.muted, WARN: C.orange, ERROR: C.red, DEBUG: C.dim };
type Filter = 'all' | 'WARN' | 'ERROR';

const level = (pct: number) => (pct >= 90 ? C.red : pct >= 75 ? C.orange : C.green);

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setActive(st === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

function Bars({ data }: { data: number[] }) {
  const pad = Array.from({ length: HISTORY - data.length }, () => 0);
  return (
    <View style={[s.row, { alignItems: 'flex-end', gap: 2, height: 24, marginTop: 8 }]}>
      {[...pad, ...data].map((v, i) => (
        <View key={i} style={{ flex: 1, height: `${Math.max(v, 2)}%`, backgroundColor: v ? level(v) : C.surface2, opacity: v ? 0.55 + v / 220 : 1, borderRadius: 1 }} />
      ))}
    </View>
  );
}

function Meter({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={{ height: 4, backgroundColor: C.surface2, borderRadius: 2, marginTop: 8 }}>
      <View style={{ width: `${Math.min(100, pct)}%`, height: 4, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

function Tile({ label, value, warn, children }: { label: string; value: string; warn?: string; children?: ReactNode }) {
  return (
    <Card style={{ flex: 1, padding: 12, borderColor: warn ? warn + '88' : C.border }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.muted}>{label}</Text>
        <Text style={{ color: warn ?? C.text, fontWeight: '700' }}>{value}</Text>
      </View>
      {children}
    </Card>
  );
}

function BarAction({ label, icon, onPress, disabled, primary }: { label: string; icon: ReactNode; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6, borderRadius: 8, backgroundColor: primary ? C.surface2 : 'transparent', opacity: disabled ? 0.4 : 1 }}>
      {icon}
      <Text style={{ color: C.text, fontSize: 10, fontWeight: '600' }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Polls the server's metrics every few seconds while `active`. */
function useStats(active: boolean) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [cpu, setCpu] = useState<number[]>([]);
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
        if (pct != null) setCpu((c) => [...c, pct].slice(-HISTORY));
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

  return { stats, cpu, error };
}

/** Follows the log source: only appended lines are fetched, a new source starts over. */
function useLogs(src: LogSource, active: boolean) {
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

function Dashboard({ server }: { server: Server }) {
  const focused = useIsFocused();
  const foreground = useAppActive();
  const active = focused && foreground;
  const src = useLogSource(server.id)!;
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  // Selection mode: ids of the picked lines (null = not selecting). Following pauses meanwhile so the list stays put.
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const anchor = useRef<number | null>(null);
  const selecting = picked !== null;
  const count = picked?.size ?? 0;

  const { stats, cpu, error } = useStats(active);
  const logs = useLogs(src, active && !paused && !selecting);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return logs.lines.filter((l) => (filter === 'all' || l.lvl === filter) && (!needle || l.text.toLowerCase().includes(needle))).reverse();
  }, [logs.lines, filter, q]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  function startSelect(id?: number) {
    Haptics.selectionAsync().catch(() => {});
    anchor.current = id ?? null;
    setPicked(new Set(id == null ? [] : [id]));
  }

  function endSelect() {
    anchor.current = null;
    setPicked(null);
  }

  function toggle(id: number) {
    anchor.current = id;
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  /** Long-press while selecting: picks every visible line between the last tapped one and this one. */
  function selectRange(id: number) {
    const from = anchor.current;
    if (from == null) return toggle(id);
    Haptics.selectionAsync().catch(() => {});
    const [lo, hi] = from < id ? [from, id] : [id, from];
    setPicked((p) => {
      const n = new Set(p);
      for (const l of shown) if (l.id >= lo && l.id <= hi) n.add(l.id);
      return n;
    });
    anchor.current = id;
  }

  const allPicked = !!picked && shown.length > 0 && shown.every((l) => picked.has(l.id));

  /** Picked lines (or every visible line when nothing is selected), oldest first like in the source. */
  function exported() {
    const list = picked?.size ? logs.lines.filter((l) => picked.has(l.id)) : [...shown].reverse();
    return list.map((l) => l.text);
  }

  function context() {
    const parts = [filter !== 'all' ? (filter === 'ERROR' ? 'erreurs' : 'avertissements') : '', q.trim() ? `« ${q.trim()} »` : ''].filter(Boolean);
    return { server: server.name, host: stats?.host, source: src, filter: picked?.size ? `${parts.length ? parts.join(' · ') + ' · ' : ''}sélection manuelle` : parts.join(' · ') || null };
  }

  async function copy(kind: 'raw' | 'ai') {
    const lines = exported();
    if (!lines.length) return;
    await Clipboard.setStringAsync(kind === 'raw' ? lines.join('\n') : logsAsMarkdown(lines, context(), true));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(kind === 'raw' ? `${lines.length} ligne${lines.length > 1 ? 's' : ''} copiée${lines.length > 1 ? 's' : ''}` : 'Copié pour Claude / Cursor');
  }

  async function share() {
    const lines = exported();
    if (!lines.length) return;
    try {
      await Share.share({ message: logsAsMarkdown(lines, context(), true), title: `Logs ${server.name}` }, { subject: `Logs ${server.name}`, dialogTitle: 'Partager les logs' });
    } catch {}
  }

  const cpuNow = cpu.length ? Math.round(cpu[cpu.length - 1]) : null;
  const memUsed = stats ? stats.mem.total - stats.mem.available : 0;
  const memPct = stats?.mem.total ? (memUsed / stats.mem.total) * 100 : 0;
  const swapPct = stats?.mem.swapTotal ? ((stats.mem.swapTotal - stats.mem.swapFree) / stats.mem.swapTotal) * 100 : 0;
  const disk = stats?.disk;
  const diskPct = disk && disk.size ? (disk.used / (disk.used + disk.avail)) * 100 : 0;
  const loadRatio = stats ? stats.load[0] / stats.cpus : 0;

  const header = (
    <View>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.h1}>Monitoring</Text>
        <View style={[s.row, { gap: 6, backgroundColor: C.surface2, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '50%' }]}>
          <Dot color={error ? C.red : stats ? C.green : C.dim} size={6} />
          <Mono style={{ fontSize: 11 }} numberOfLines={1}>
            {stats?.host ?? server.name}
          </Mono>
        </View>
      </View>

      {error && (
        <Card style={{ marginTop: 12, borderColor: C.red + '66', backgroundColor: C.redBg }}>
          <Text style={{ color: C.text, fontWeight: '600' }}>Métriques indisponibles</Text>
          <Mono style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{error}</Mono>
        </Card>
      )}

      {!stats && !error && <ActivityIndicator style={{ marginVertical: 32 }} color={C.muted} />}

      {stats && (
        <>
          <View style={[s.row, { gap: 8, marginTop: 12 }]}>
            <Tile label="CPU" value={cpuNow == null ? '…' : `${cpuNow} %`} warn={cpuNow != null && cpuNow >= 90 ? C.red : undefined}>
              <Bars data={cpu} />
              <Text style={{ color: C.dim, fontSize: 10, marginTop: 4 }}>{stats.cpus} cœur{stats.cpus > 1 ? 's' : ''}</Text>
            </Tile>
            <Tile label="RAM" value={`${Math.round(memPct)} %`} warn={memPct >= 90 ? C.red : memPct >= 75 ? C.orange : undefined}>
              <Meter pct={memPct} color={level(memPct)} />
              <Text style={{ color: C.dim, fontSize: 10, marginTop: 4 }} numberOfLines={1}>
                {bytes(memUsed)} / {bytes(stats.mem.total)}
                {stats.mem.swapTotal ? ` · swap ${Math.round(swapPct)} %` : ''}
              </Text>
            </Tile>
          </View>
          <View style={[s.row, { gap: 8, marginTop: 8 }]}>
            <Tile label={`Disque ${disk?.mount ?? '/'}`} value={disk ? `${Math.round(diskPct)} %` : '—'} warn={diskPct >= 90 ? C.red : diskPct >= 75 ? C.orange : undefined}>
              <Meter pct={diskPct} color={level(diskPct)} />
              <Text style={{ color: diskPct >= 75 ? level(diskPct) : C.dim, fontSize: 10, marginTop: 4 }} numberOfLines={1}>
                {disk ? `${bytes(disk.avail)} libres sur ${bytes(disk.size)}` : 'df indisponible'}
              </Text>
            </Tile>
            <Tile label="Uptime" value={duration(stats.uptimeSec)}>
              <Mono style={{ color: loadRatio >= 1 ? C.orange : C.dim, fontSize: 10, marginTop: 12 }} numberOfLines={1}>
                load {stats.load.map((l) => l.toFixed(2)).join(' ')}
              </Mono>
            </Tile>
          </View>

          {stats.procs.length > 0 && (
            <Card style={{ marginTop: 8, paddingVertical: 8 }}>
              <View style={[s.row, { paddingBottom: 4 }]}>
                <Text style={[s.section, { flex: 1 }]}>PROCESSUS</Text>
                <Text style={[s.section, { width: 52, textAlign: 'right' }]}>CPU</Text>
                <Text style={[s.section, { width: 52, textAlign: 'right' }]}>MÉM</Text>
              </View>
              {stats.procs.map((p) => (
                <View key={p.pid} style={[s.row, { paddingVertical: 3 }]}>
                  <Mono style={{ flex: 1, fontSize: 11 }} numberOfLines={1}>
                    {p.name} <Text style={{ color: C.dim }}>{p.pid}</Text>
                  </Mono>
                  <Mono style={{ width: 52, textAlign: 'right', fontSize: 11, color: p.cpu >= 50 ? C.orange : C.text }}>{p.cpu.toFixed(1)}</Mono>
                  <Mono style={{ width: 52, textAlign: 'right', fontSize: 11, color: C.muted }}>{p.mem.toFixed(1)}</Mono>
                </View>
              ))}
            </Card>
          )}
        </>
      )}

      <View style={[s.row, { gap: 8, marginTop: 16 }]}>
        <Pressable onPress={() => router.push('/monitoring/logs')} hitSlop={6} style={[s.row, { flex: 1, gap: 4 }]}>
          <Mono style={{ fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
            {sourceLabel(src)}
          </Mono>
          <ChevronRight size={14} color={C.dim} />
        </Pressable>
        <Pressable
          onPress={() => setPaused((p) => !p)}
          hitSlop={6}
          style={[s.row, { gap: 4, backgroundColor: paused ? C.surface2 : C.greenBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }]}>
          {paused ? <Play size={10} color={C.muted} fill={C.muted} /> : <Dot color={C.green} size={5} />}
          <Text style={{ color: paused ? C.muted : C.green, fontSize: 11 }}>{paused ? 'En pause' : 'En direct'}</Text>
          {!paused && <Pause size={10} color={C.green} />}
        </Pressable>
        <Pressable onPress={() => (selecting ? endSelect() : startSelect())} hitSlop={6} accessibilityLabel="Sélectionner des lignes" style={{ padding: 4, borderRadius: 8, backgroundColor: selecting ? C.surface2 : 'transparent' }}>
          <TextSelect size={15} color={selecting ? C.accent : C.muted} />
        </Pressable>
        <Pressable onPress={share} disabled={!shown.length} hitSlop={6} accessibilityLabel="Partager les logs" style={{ padding: 4, opacity: shown.length ? 1 : 0.4 }}>
          <Share2 size={15} color={C.muted} />
        </Pressable>
      </View>
      <View style={[s.row, { gap: 6, marginTop: 8 }]}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="/ Filtrer"
          placeholderTextColor={C.dim}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, color: C.text, fontSize: 12 }}
        />
        {(['all', 'WARN', 'ERROR'] as Filter[]).map((f) => {
          const on = filter === f;
          const col = f === 'WARN' ? C.orange : f === 'ERROR' ? C.red : C.text;
          return (
            <Pressable key={f} onPress={() => setFilter(f)} style={{ paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6, backgroundColor: on ? C.surface2 : 'transparent', borderWidth: 1, borderColor: on ? C.border : 'transparent' }}>
              <Text style={{ color: col, fontSize: 11, fontWeight: '700' }}>{f === 'all' ? 'Tous' : f === 'ERROR' ? 'ERR' : f}</Text>
            </Pressable>
          );
        })}
      </View>

      {logs.error && (
        <Card style={{ marginTop: 8, borderColor: C.red + '66', backgroundColor: C.redBg }}>
          <Mono style={{ fontSize: 12, color: C.text }}>{logs.error}</Mono>
          <Pressable onPress={() => router.push('/monitoring/logs')} hitSlop={6}>
            <Text style={{ color: C.accent, fontSize: 12, fontWeight: '600', marginTop: 8 }}>Changer de source</Text>
          </Pressable>
        </Card>
      )}
      {logs.hint && <Text style={{ color: C.orange, fontSize: 11, marginTop: 8 }}>{logs.hint}</Text>}
      {!selecting && shown.length > 0 && <Text style={{ color: C.dim, fontSize: 10, marginTop: 8 }}>Appui long sur une ligne pour sélectionner, copier ou partager.</Text>}
      {selecting && <Text style={{ color: C.dim, fontSize: 10, marginTop: 8 }}>Touche les lignes à garder · appui long pour sélectionner toute une plage. Le suivi est en pause.</Text>}
      <View style={{ height: 8 }} />
    </View>
  );

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <FlatList
        extraData={picked}
        data={shown}
        keyExtractor={(l) => String(l.id)}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={40}
        contentContainerStyle={{ padding: 16, paddingBottom: selecting ? 96 : 16 }}
        ListEmptyComponent={
          logs.error ? undefined : logs.loading ? (
            <ActivityIndicator style={{ marginTop: 16 }} color={C.muted} />
          ) : (
            <Text style={[s.muted, { fontSize: 12, marginTop: 8 }]}>{logs.lines.length ? 'Aucune ligne ne correspond au filtre.' : 'Aucune ligne pour l’instant.'}</Text>
          )
        }
        renderItem={({ item }) => {
          const on = !!picked?.has(item.id);
          return (
            <Pressable
              onPress={selecting ? () => toggle(item.id) : undefined}
              onLongPress={() => (selecting ? selectRange(item.id) : startSelect(item.id))}
              delayLongPress={350}
              style={[
                s.row,
                { alignItems: 'flex-start', gap: 6, paddingVertical: 2, paddingHorizontal: 4, borderRadius: 3, backgroundColor: on ? C.accentBg : item.lvl === 'ERROR' ? C.redBg : 'transparent' },
              ]}>
              {selecting && (
                <View style={{ width: 14, height: 14, marginTop: 1, borderRadius: 4, borderWidth: 1, borderColor: on ? C.accent : C.dim, backgroundColor: on ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <Check size={10} color={C.bg} strokeWidth={3} />}
                </View>
              )}
              <Mono style={{ flex: 1, fontSize: 10, lineHeight: 14, color: item.lvl === 'INFO' ? C.text : lvlColor[item.lvl] }}>{item.text}</Mono>
            </Pressable>
          );
        }}
      />
      {copied && (
        <View pointerEvents="none" style={{ position: 'absolute', alignSelf: 'center', bottom: selecting ? 92 : 16, backgroundColor: C.surface2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border }}>
          <Text style={{ color: C.text, fontSize: 12 }}>{copied}</Text>
        </View>
      )}
      {selecting && (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 6 }}>
          <View style={[s.row, { justifyContent: 'space-between', paddingHorizontal: 6, paddingBottom: 4 }]}>
            <Text style={{ color: C.muted, fontSize: 11 }}>{count ? `${count} ligne${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''}` : 'Aucune ligne sélectionnée'}</Text>
            <Pressable onPress={endSelect} hitSlop={8} accessibilityLabel="Quitter la sélection">
              <X size={14} color={C.muted} />
            </Pressable>
          </View>
          <View style={[s.row, { gap: 4 }]}>
            <BarAction label={allPicked ? 'Aucune' : 'Tout'} icon={<ListChecks size={16} color={C.text} />} onPress={() => setPicked(allPicked ? new Set() : new Set(shown.map((l) => l.id)))} disabled={!shown.length} />
            <BarAction label="Copier" icon={<Copy size={16} color={C.text} />} onPress={() => copy('raw')} disabled={!count} />
            <BarAction label="Pour l’IA" icon={<Sparkles size={16} color={C.accent} />} onPress={() => copy('ai')} disabled={!count} primary />
            <BarAction label="Partager" icon={<Share2 size={16} color={C.text} />} onPress={share} disabled={!count} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

export default function Monitoring() {
  const session = useSession();
  const server = session?.server;

  if (!session?.open || !server) {
    return (
      <SafeAreaView style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Activity size={40} color={C.dim} />
          <Text style={s.h2}>Aucune session</Text>
          <Text style={[s.muted, { textAlign: 'center' }]}>Connecte-toi à un serveur pour suivre sa charge et ses logs en direct.</Text>
        </View>
        <Button title={server ? 'Se reconnecter' : 'Choisir un serveur'} style={{ marginTop: 24 }} onPress={() => (server ? router.push(`/connect/${server.id}`) : router.navigate('/'))} />
      </SafeAreaView>
    );
  }

  // Keyed by session: a new connection starts with fresh history and log cursor.
  return <Dashboard key={session.id} server={server} />;
}
