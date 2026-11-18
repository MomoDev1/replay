import * as Clipboard from 'expo-clipboard';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';

import { STATS_MS, useAppActive, useLogs, useStats } from '@/hooks/use-monitor';
import { bytes, duration, logsAsMarkdown, serviceStates, sourceLabel, type Level, type Service } from '@/lib/monitor';
import type { Server } from '@/lib/types';
import { useLogSource } from '@/store/monitor';
import { useSession } from '@/store/session';
import { alpha, monoF, T } from '@/tablet/theme';
import { Btn, card, Dot, Empty, Grid, Label, ListRow, st, TabletScreen, Tx } from '@/tablet/ui';

type Filter = 'all' | 'INFO' | 'WARN' | 'ERROR';
const lvlTone: Record<Level, string> = { INFO: T.blue, WARN: T.orange, ERROR: T.red, DEBUG: T.dim };

function Bars({ data, color }: { data: number[]; color: string }) {
  const pad = Array.from({ length: Math.max(0, 20 - data.length) }, () => 0);
  const vals = [...pad, ...data.slice(-20)];
  return (
    <View style={{ height: 40, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
      {vals.map((v, i) => (
        <View key={i} style={{ flex: 1, borderRadius: 1, height: `${Math.max(v, 2)}%`, backgroundColor: v ? color : T.chip, opacity: v ? (i === vals.length - 1 ? 1 : 0.5) : 1 }} />
      ))}
    </View>
  );
}

/** Leading clock time of a log line (`14:32:11`), if it has one. */
function timeOf(line: string) {
  const m = /^(?:\S*?[T ])?(\d{2}:\d{2}:\d{2})/.exec(line.slice(0, 40)) ?? /\b(\d{2}:\d{2}:\d{2})\b/.exec(line.slice(0, 40));
  return m?.[1] ?? null;
}

export function TabletMonitor() {
  const session = useSession();
  if (!session?.open) {
    const server = session?.server;
    return (
      <TabletScreen>
        <Empty
          title="Aucune session"
          text="Connecte-toi à un serveur pour suivre ses métriques et ses logs."
          action={<Btn title={server ? 'Se reconnecter' : 'Choisir un serveur'} style={{ marginTop: 8 }} onPress={() => (server ? router.push(`/connect/${server.id}`) : router.navigate('/'))} />}
        />
      </TabletScreen>
    );
  }
  return <Dashboard key={session.id} server={session.server} />;
}

function Dashboard({ server }: { server: Server }) {
  const focused = useIsFocused();
  const foreground = useAppActive();
  const active = focused && foreground;
  const src = useLogSource(server.id)!;
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState(false);
  const { stats, cpu, mem, disk, load, error } = useStats(active);
  const logs = useLogs(src, active && !paused);
  const [services, setServices] = useState<Service[] | null>(null);
  const scroller = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const s = await serviceStates();
        if (!stop) setServices(s);
      } catch {}
      if (!stop) timer = setTimeout(tick, 15_000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [active]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return logs.lines.filter((l) => (filter === 'all' || l.lvl === filter) && (!needle || l.text.toLowerCase().includes(needle)));
  }, [logs.lines, filter, q]);

  const last = (a: number[]) => (a.length ? a[a.length - 1] : null);
  const peak = cpu.length ? Math.max(...cpu) : null;
  const diskPct = last(disk);
  const memUsed = stats ? stats.mem.total - stats.mem.available : 0;
  const metrics = [
    { k: 'CPU', v: last(cpu) == null ? '—' : `${Math.round(last(cpu)!)}%`, c: T.blue, warn: (last(cpu) ?? 0) >= 90, bars: cpu, s: stats ? `${stats.cpus} vCPU${peak != null ? ` · pic ${Math.round(peak)} %` : ''}` : '…' },
    { k: 'RAM', v: stats ? bytes(memUsed) : '—', c: T.green, warn: (last(mem) ?? 0) >= 90, bars: mem, s: stats ? `${Math.round(last(mem) ?? 0)} % de ${bytes(stats.mem.total)} · swap ${bytes(stats.mem.swapTotal - stats.mem.swapFree)}` : '…' },
    { k: `Disque ${stats?.disk?.mount ?? '/'}`, v: diskPct == null ? '—' : `${Math.round(diskPct)}%`, c: T.orange, warn: (diskPct ?? 0) >= 75, bars: disk, s: stats?.disk ? `${bytes(stats.disk.avail)} libres` : '…' },
    { k: 'Uptime', v: stats ? duration(stats.uptimeSec) : '—', c: T.blue, warn: false, bars: load, s: stats ? `load ${stats.load.map((n) => n.toFixed(2)).join(' ')}` : '…' },
  ];

  async function copy() {
    const md = logsAsMarkdown(
      shown.map((l) => l.text),
      { server: server.name, host: stats?.host, source: src, filter: [filter !== 'all' ? filter : null, q.trim() ? `« ${q.trim()} »` : null].filter(Boolean).join(' · ') || null },
    );
    await Clipboard.setStringAsync(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <TabletScreen>
      <View style={{ flex: 1, minWidth: 0, paddingTop: 16, paddingHorizontal: 20, paddingBottom: 20, gap: 14 }}>
        <View style={[st.row, { gap: 12, flexWrap: 'wrap' }]}>
          <Tx w={700} style={[st.h1, { flex: 1 }]}>
            Monitoring
          </Tx>
          <Pressable onPress={() => router.navigate('/')} style={[st.row, { height: 40, paddingHorizontal: 14, borderRadius: 11, backgroundColor: T.field, gap: 8 }]}>
            <Dot color={error ? T.orange : T.green} size={7} />
            <Tx mono style={{ fontSize: 13 }}>
              {server.name} ▾
            </Tx>
          </Pressable>
          <View style={{ height: 40, paddingHorizontal: 14, borderRadius: 11, backgroundColor: T.field, justifyContent: 'center' }}>
            <Tx style={{ fontSize: 13, color: T.text2 }}>{`Dernière minute · toutes les ${STATS_MS / 1000} s`}</Tx>
          </View>
        </View>
        {error && (
          <Tx mono style={{ fontSize: 12, color: T.orange }}>
            {error}
          </Tx>
        )}

        <Grid min={180}>
          {metrics.map((m) => (
            <View key={m.k} style={{ backgroundColor: T.card, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: m.warn ? alpha(T.orange, 0.4) : T.cardLine }}>
              <View style={[st.row, { justifyContent: 'space-between', alignItems: 'baseline' }]}>
                <Tx style={{ fontSize: 12.5, color: T.muted }}>{m.k}</Tx>
                <Tx mono w={600} style={{ fontSize: 22, color: m.warn ? T.orange : T.text }}>
                  {m.v}
                </Tx>
              </View>
              <Bars data={m.bars} color={m.c} />
              <Tx style={{ fontSize: 11.5, color: T.dim }} numberOfLines={1}>
                {m.s}
              </Tx>
            </View>
          ))}
        </Grid>

        <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap: 14 }}>
          <View style={{ flexGrow: 3, flexShrink: 1, flexBasis: 420, minWidth: 0, gap: 10 }}>
            <View style={[st.row, { gap: 8 }]}>
              <Pressable onPress={() => router.push('/monitoring/logs')} style={{ flex: 1 }} hitSlop={6}>
                <Tx mono style={{ fontSize: 13 }} numberOfLines={1}>
                  {sourceLabel(src)} ▾
                </Tx>
              </Pressable>
              <View style={[st.row, { height: 32, paddingHorizontal: 10, borderRadius: 9, gap: 6, backgroundColor: paused ? T.field : alpha(T.green, 0.15) }]}>
                {!paused && <Dot color={T.green} size={6} />}
                <Tx w={600} style={{ fontSize: 12, color: paused ? T.muted : T.green }}>
                  {paused ? 'En pause' : 'En direct'}
                </Tx>
              </View>
              <Pressable onPress={() => setPaused((p) => !p)} style={{ height: 32, paddingHorizontal: 12, borderRadius: 9, backgroundColor: T.field, justifyContent: 'center' }}>
                <Tx w={600} style={{ fontSize: 12 }}>
                  {paused ? '▶ Reprendre' : '❚❚ Pause'}
                </Tx>
              </Pressable>
              <Pressable onPress={copy} style={{ height: 32, paddingHorizontal: 12, borderRadius: 9, backgroundColor: T.field, justifyContent: 'center' }}>
                <Tx w={600} style={{ fontSize: 12, color: copied ? T.green : T.text }}>
                  {copied ? '✓ Copié' : 'Copier'}
                </Tx>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <View style={[st.row, { flex: 1, minWidth: 180, height: 40, borderRadius: 11, backgroundColor: T.field, gap: 8, paddingHorizontal: 12 }]}>
                <Tx mono style={{ fontSize: 13, color: T.faint }}>
                  /
                </Tx>
                <TextInput value={q} onChangeText={setQ} placeholder="filtrer" placeholderTextColor={T.faint} autoCapitalize="none" autoCorrect={false} style={[{ flex: 1, fontSize: 13, color: T.text, paddingVertical: 0 }, monoF(400)]} />
              </View>
              {(['all', 'INFO', 'WARN', 'ERROR'] as Filter[]).map((f) => {
                const on = filter === f;
                return (
                  <Pressable key={f} onPress={() => setFilter(f)} style={{ height: 40, paddingHorizontal: 12, borderRadius: 11, justifyContent: 'center', backgroundColor: on ? T.text : T.field }}>
                    <Tx mono w={600} style={{ fontSize: 12, color: on ? T.bg : f === 'all' ? T.text2 : lvlTone[f as Level] }}>
                      {f === 'all' ? 'Tous' : f}
                    </Tx>
                  </Pressable>
                );
              })}
            </View>
            <ScrollView ref={scroller} style={{ flex: 1, backgroundColor: T.term, borderRadius: 14 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingVertical: 10, paddingHorizontal: 14 }} onContentSizeChange={() => !paused && scroller.current?.scrollToEnd({ animated: false })}>
              {logs.error && (
                <Tx mono style={{ fontSize: 12.5, color: T.red }}>
                  {logs.error}
                </Tx>
              )}
              {logs.hint && (
                <Tx style={{ fontSize: 12, color: T.orange, marginBottom: 6 }}>{logs.hint}</Tx>
              )}
              {!logs.loading && !shown.length && !logs.error && <Tx style={{ fontSize: 12.5, color: T.dim }}>{logs.lines.length ? 'Aucune ligne ne correspond au filtre.' : 'Aucune ligne pour l’instant.'}</Tx>}
              {shown.map((l) => {
                const t = timeOf(l.text);
                const err = l.lvl === 'ERROR';
                return (
                  <View key={l.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 2, paddingHorizontal: 4, borderRadius: 4, backgroundColor: err ? alpha(T.red, 0.1) : 'transparent' }}>
                    {t && (
                      <Tx mono style={{ fontSize: 12.5, lineHeight: 20, color: T.lineNo }}>
                        {t}
                      </Tx>
                    )}
                    <Tx mono w={600} style={{ width: 44, fontSize: 12.5, lineHeight: 20, color: lvlTone[l.lvl] }}>
                      {l.lvl}
                    </Tx>
                    <Tx mono selectable style={{ flex: 1, fontSize: 12.5, lineHeight: 20, color: err ? '#F2DCD8' : T.text2 }}>
                      {l.text}
                    </Tx>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView style={{ flexGrow: 1, flexShrink: 1, flexBasis: 240, minWidth: 0 }} contentContainerStyle={{ gap: 10 }}>
            <Label style={{ paddingTop: 10 }}>PROCESSUS · CPU · MÉMOIRE</Label>
            <View style={card}>
              {(stats?.procs ?? []).map((p, i, all) => (
                <ListRow key={p.pid} last={i === all.length - 1} style={{ height: 46, gap: 10 }}>
                  <Tx mono style={{ flex: 1, fontSize: 12.5 }} numberOfLines={1}>
                    {p.name}
                  </Tx>
                  <Tx mono style={{ fontSize: 12.5, color: T.muted }}>
                    {Math.round(p.cpu)}%
                  </Tx>
                  <Tx mono style={{ width: 56, textAlign: 'right', fontSize: 12.5 }}>
                    {stats ? bytes((p.mem / 100) * stats.mem.total).replace(/ (\w)o$/, ' $1') : ''}
                  </Tx>
                </ListRow>
              ))}
              {!stats?.procs.length && (
                <ListRow last style={{ height: 46 }}>
                  <Tx style={{ fontSize: 13, color: T.dim }}>…</Tx>
                </ListRow>
              )}
            </View>
            <Label style={{ paddingTop: 6 }}>SERVICES</Label>
            <View style={card}>
              {(services ?? []).map((s, i, all) => {
                const c = s.active === 'failed' ? T.red : s.active === 'active' && s.sub === 'running' ? T.green : s.active === 'active' ? T.blue : T.orange;
                const label = s.active === 'failed' ? 'en échec' : s.sub === 'running' ? 'actif' : s.sub === 'auto-restart' || s.active === 'activating' ? 'redémarre' : s.sub === 'exited' ? 'terminé' : s.sub;
                return (
                  <ListRow key={s.name} last={i === all.length - 1} style={{ height: 46, gap: 10 }}>
                    <Dot color={c} size={7} />
                    <Tx mono style={{ flex: 1, fontSize: 13.5 }} numberOfLines={1}>
                      {s.name}
                    </Tx>
                    <Tx style={{ fontSize: 12, color: c }}>{label}</Tx>
                  </ListRow>
                );
              })}
              {services && !services.length && (
                <ListRow last style={{ height: 46 }}>
                  <Tx style={{ fontSize: 13, color: T.dim }}>systemd indisponible</Tx>
                </ListRow>
              )}
              {!services && (
                <ListRow last style={{ height: 46 }}>
                  <Tx style={{ fontSize: 13, color: T.dim }}>…</Tx>
                </ListRow>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </TabletScreen>
  );
}
