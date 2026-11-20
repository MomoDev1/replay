import { router, useIsFocused } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';

import { useAppActive, useStats } from '@/hooks/use-monitor';
import { fmtDuration, stepsFor, when } from '@/lib/deploy';
import { duration, sourceLabel } from '@/lib/monitor';
import type { Server } from '@/lib/types';
import { history, useHistoryVersion, type DeployRecord } from '@/store/deploy';
import { repoFor, useGit } from '@/store/git';
import { logSourceFor } from '@/store/monitor';
import { useServers } from '@/store/servers';
import { exec, openServer, useSession } from '@/store/session';
import { alpha, sans, T } from '@/tablet/theme';
import { Btn, card, Dot, Empty, EnvTag, Grid, Label, ListRow, Meter, PlusButton, st, TabletScreen, Tx, vline } from '@/tablet/ui';

function ago(ts: number | null) {
  if (!ts) return 'jamais connecté';
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hier' : `il y a ${d} j`;
}

const hostLine = (sv: Server) => `${sv.user}@${sv.host}${sv.port !== 22 ? `:${sv.port}` : ''}`;

function dotColor(sv: Server, connected: boolean) {
  if (connected || sv.status === 'online') return T.green;
  if (sv.status === 'offline') return T.orange;
  return T.faint;
}

function lastLine(sv: Server, connected: boolean) {
  if (connected) return 'Session ouverte';
  if (sv.status === 'offline') return `Injoignable · ${ago(sv.lastConnectedAt)}`;
  if (!sv.lastConnectedAt) return 'Jamais connecté';
  const a = ago(sv.lastConnectedAt);
  return a.startsWith('il y a') && a.endsWith('min') ? `Connecté ${a}` : a[0].toUpperCase() + a.slice(1);
}

/** OS name per server, read once per session. */
const osCache = new Map<string, string>();

export function TabletServers() {
  const { servers, deleteServer } = useServers();
  const session = useSession();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [picked, setPicked] = useState<string | null>(null);

  const list = useMemo(() => {
    const f = servers.filter((sv) => `${sv.name} ${sv.host} ${sv.user}`.toLowerCase().includes(q.toLowerCase()));
    return sort === 'name' ? f : [...f].sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0));
  }, [servers, q, sort]);

  const selected = servers.find((sv) => sv.id === picked) ?? servers.find((sv) => sv.id === session?.server.id) ?? list[0];

  function actions(sv: Server) {
    Alert.alert(sv.name, `${sv.user}@${sv.host}:${sv.port}`, [
      { text: 'Modifier', onPress: () => router.push({ pathname: '/server/new', params: { id: sv.id } }) },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Supprimer ce serveur ?', `${sv.name} et son mot de passe enregistré seront effacés de cet appareil.`, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Supprimer', style: 'destructive', onPress: () => deleteServer(sv.id) },
          ]),
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  return (
    <TabletScreen>
      <View style={[{ flexGrow: 1, flexShrink: 1, flexBasis: 300, maxWidth: 380, paddingTop: 16, paddingHorizontal: 16, gap: 12 }, vline]}>
        <View style={[st.row, { justifyContent: 'space-between' }]}>
          <Tx w={700} style={st.h1}>
            Serveurs
          </Tx>
          <PlusButton label="Nouveau serveur" onPress={() => router.push('/server/new')} />
        </View>
        <View style={[st.row, { gap: 8 }]}>
          <View style={[st.row, { flex: 1, height: 42, borderRadius: 12, backgroundColor: T.field, gap: 10, paddingHorizontal: 12 }]}>
            <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: T.faint }} />
            <TextInput value={q} onChangeText={setQ} placeholder="Rechercher" placeholderTextColor={T.faint} autoCapitalize="none" autoCorrect={false} style={[{ flex: 1, color: T.text, fontSize: 14, paddingVertical: 0 }, sans(400)]} />
          </View>
          <Pressable onPress={() => setSort((v) => (v === 'recent' ? 'name' : 'recent'))} style={{ height: 42, paddingHorizontal: 12, borderRadius: 12, backgroundColor: T.field, justifyContent: 'center' }}>
            <Tx style={{ fontSize: 13, color: T.text2 }}>{sort === 'recent' ? 'Récents ▾' : 'Nom ▾'}</Tx>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
          {list.map((sv) => {
            const on = sv.id === selected?.id;
            const connected = !!session?.open && session.server.id === sv.id;
            return (
              <Pressable key={sv.id} onPress={() => setPicked(sv.id)} onLongPress={() => actions(sv)} style={{ borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 5, backgroundColor: on ? T.field : T.card, borderWidth: 1, borderColor: on ? T.blue : T.cardLine }}>
                <View style={[st.row, { gap: 10 }]}>
                  <Dot color={dotColor(sv, connected)} />
                  <Tx w={600} style={{ fontSize: 15, flex: 1 }} numberOfLines={1}>
                    {sv.name}
                  </Tx>
                  <EnvTag env={sv.env} />
                </View>
                <Tx mono style={{ fontSize: 12, color: T.muted, paddingLeft: 18 }} numberOfLines={1}>
                  {hostLine(sv)}
                </Tx>
                <Tx style={{ fontSize: 12, color: T.dim, paddingLeft: 18 }} numberOfLines={1}>
                  {lastLine(sv, connected)}
                </Tx>
              </Pressable>
            );
          })}
          {!list.length && <Tx style={{ fontSize: 13, color: T.dim, textAlign: 'center', marginTop: 24 }}>{servers.length ? `Aucun résultat pour « ${q} »` : 'Aucun serveur'}</Tx>}
        </ScrollView>
      </View>
      <View style={{ flexGrow: 1.6, flexShrink: 1, flexBasis: 380, minWidth: 0 }}>
        {selected ? (
          <Detail key={selected.id} server={selected} />
        ) : (
          <Empty title="Aucun serveur" text="Ajoute ton premier serveur pour t’y connecter en SSH." action={<Btn title="Ajouter un serveur" onPress={() => router.push('/server/new')} style={{ marginTop: 8 }} />} />
        )}
      </View>
    </TabletScreen>
  );
}

function Detail({ server }: { server: Server }) {
  const db = useSQLiteContext();
  const session = useSession();
  const g = useGit();
  const focused = useIsFocused();
  const foreground = useAppActive();
  const connected = !!session?.open && session.server.id === server.id;
  const { stats, cpu } = useStats(connected && focused && foreground);
  const [os, setOs] = useState(() => osCache.get(server.id) ?? null);
  const [deploys, setDeploys] = useState<DeployRecord[]>([]);
  const hv = useHistoryVersion();

  useEffect(() => {
    let live = true;
    history(db, server.id, 4).then((h) => live && setDeploys(h));
    return () => {
      live = false;
    };
  }, [db, server.id, hv]);

  useEffect(() => {
    if (!connected || osCache.has(server.id)) return;
    exec('. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -sr', 10_000)
      .then((r) => {
        const name = r.stdout.trim().split('\n')[0];
        if (name) {
          osCache.set(server.id, name);
          setOs(name);
        }
      })
      .catch(() => {});
  }, [connected, server.id]);

  const go = (tab: '/terminal' | '/git' | '/deploy' | '/monitoring') => (connected ? router.navigate(tab) : openServer(server.id, tab));

  const memPct = stats?.mem.total ? ((stats.mem.total - stats.mem.available) / stats.mem.total) * 100 : null;
  const diskPct = stats?.disk?.size ? (stats.disk.used / stats.disk.size) * 100 : null;
  const cpuPct = cpu.length ? cpu[cpu.length - 1] : null;
  const loadPct = stats ? Math.min(100, (stats.load[0] / stats.cpus) * 100) : null;
  const tone = (p: number | null, base: string) => (p == null ? base : p >= 90 ? T.red : p >= 75 ? T.orange : base);
  const pct = (p: number | null) => (p == null ? '—' : `${Math.round(p)}%`);
  const metrics = [
    { k: 'CPU', v: pct(cpuPct), p: cpuPct ?? 0, c: tone(cpuPct, T.blue) },
    { k: 'RAM', v: pct(memPct), p: memPct ?? 0, c: tone(memPct, T.green) },
    { k: 'Disque', v: pct(diskPct), p: diskPct ?? 0, c: tone(diskPct, T.green) },
    { k: 'Load', v: stats ? stats.load[0].toFixed(2) : '—', p: loadPct ?? 0, c: tone(loadPct, T.blue) },
  ];

  const repo = repoFor(server);
  const gitSub = g?.serverId === server.id && g.status ? `${g.status.branch ?? 'HEAD'}${g.status.behind ? ` · ↓${g.status.behind}` : ''}${g.status.ahead ? ` · ↑${g.status.ahead}` : ''}` : repo;
  const lastDeploy = deploys.find((d) => d.status === 'ok');
  const pipeline = stepsFor(server.id).filter((s) => s.cmd.trim()).length;
  const actions = [
    { t: 'Terminal', s: connected ? 'ssh · session ouverte' : 'ssh · se connecter', go: () => go('/terminal') },
    { t: 'Git', s: gitSub, go: () => go('/git') },
    { t: 'Déployer', s: lastDeploy ? `en service : ${lastDeploy.version}` : `${pipeline} étapes`, go: () => go('/deploy') },
    { t: 'Logs', s: sourceLabel(logSourceFor(server.id)), go: () => go('/monitoring') },
  ];

  const activity = [
    ...deploys.map((d) => ({
      at: d.startedAt,
      c: d.status === 'ok' ? (d.kind === 'rollback' ? T.orange : T.green) : T.red,
      t:
        d.kind === 'rollback'
          ? `Rollback vers ${d.version} ${d.status === 'ok' ? 'réussi' : 'échoué'}`
          : d.status === 'ok'
            ? `Déploiement ${d.version} réussi · ${fmtDuration(d.durationMs)}`
            : d.status === 'cancelled'
              ? `Déploiement ${d.version} annulé`
              : `Déploiement échoué · ${d.failedStep ?? ''}`,
    })),
    ...(server.lastConnectedAt ? [{ at: server.lastConnectedAt, c: T.blue, t: `Connexion SSH · ${server.user}` }] : []),
    ...(server.status === 'offline' && server.lastError ? [{ at: Number.MAX_SAFE_INTEGER, c: T.orange, t: server.lastError }] : []),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 4);

  const statusLine = connected
    ? { c: T.green, t: `● En ligne · ${session!.latencyMs} ms${stats ? ` · uptime ${duration(stats.uptimeSec)}` : ''}` }
    : server.status === 'offline'
      ? { c: T.orange, t: `● Injoignable${server.lastError ? ` · ${server.lastError}` : ''}` }
      : { c: T.muted, t: `○ Déconnecté · ${server.lastConnectedAt ? `dernière connexion ${ago(server.lastConnectedAt)}` : 'jamais connecté'}` };

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 24, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 220, gap: 6 }}>
          <View style={[st.row, { gap: 10 }]}>
            <Tx w={700} style={{ fontSize: 28, flexShrink: 1 }} numberOfLines={1}>
              {server.name}
            </Tx>
            <EnvTag env={server.env} size="lg" />
          </View>
          <Tx mono style={{ fontSize: 13, color: T.muted }}>
            {[`${server.user}@${server.host}:${server.port}`, os, server.path].filter(Boolean).join(' · ')}
          </Tx>
          <Tx style={{ fontSize: 13, color: statusLine.c }} numberOfLines={2}>
            {statusLine.t}
          </Tx>
        </View>
        <View style={[st.row, { gap: 8 }]}>
          <Btn kind="ghost" title="Modifier" onPress={() => router.push({ pathname: '/server/new', params: { id: server.id } })} />
          <Btn title={connected ? '>_ Terminal' : '>_ Connecter'} style={{ paddingHorizontal: 18 }} onPress={() => go('/terminal')} />
        </View>
      </View>

      <Grid min={150}>
        {metrics.map((m) => (
          <View key={m.k} style={[card, { paddingVertical: 12, paddingHorizontal: 14, gap: 8 }]}>
            <View style={[st.row, { justifyContent: 'space-between', alignItems: 'baseline' }]}>
              <Tx style={{ fontSize: 12, color: T.muted }}>{m.k}</Tx>
              <Tx mono w={600} style={{ fontSize: 18, color: connected ? m.c : T.faint }}>
                {m.v}
              </Tx>
            </View>
            <Meter pct={m.p} color={m.c} />
          </View>
        ))}
      </Grid>

      <Grid min={150}>
        {actions.map((a) => (
          <Pressable key={a.t} onPress={a.go} style={({ pressed }) => [card, { height: 72, justifyContent: 'center', gap: 4, paddingHorizontal: 16, backgroundColor: pressed ? T.field : T.card }]}>
            <Tx w={600} style={{ fontSize: 15 }}>
              {a.t}
            </Tx>
            <Tx mono style={{ fontSize: 12, color: T.muted }} numberOfLines={1}>
              {a.s}
            </Tx>
          </Pressable>
        ))}
      </Grid>

      <View style={{ gap: 8 }}>
        <Label>ACTIVITÉ RÉCENTE</Label>
        <View style={card}>
          {activity.map((a, i) => (
            <ListRow key={i} last={i === activity.length - 1} style={{ minHeight: 48 }}>
              <Dot color={a.c} />
              <Tx style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                {a.t}
              </Tx>
              <Tx style={{ fontSize: 12, color: T.dim }}>{a.at === Number.MAX_SAFE_INTEGER ? 'dernier essai' : when(a.at)}</Tx>
            </ListRow>
          ))}
          {!activity.length && (
            <ListRow last style={{ minHeight: 48 }}>
              <Tx style={{ fontSize: 14, color: T.dim }}>Aucune activité pour l’instant.</Tx>
            </ListRow>
          )}
        </View>
      </View>
      {!connected && <Tx style={{ fontSize: 12, color: alpha(T.muted, 0.9) }}>Les métriques s’affichent une fois connecté à ce serveur.</Tx>}
    </ScrollView>
  );
}
