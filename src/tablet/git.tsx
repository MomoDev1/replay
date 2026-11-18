import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';

import { confirmBiometric } from '@/lib/auth';
import { forgeLabel } from '@/lib/forge';
import { ago, diff, discardAll, discardFile, git, isStaged, isUnstaged, stage, unstage, type DiffLine, type GitFile } from '@/lib/git';
import { act, refresh, selectServer, useGit } from '@/store/git';
import { useSession } from '@/store/session';
import { alpha, T } from '@/tablet/theme';
import { Btn, card, Empty, Grid, Label, st, TabletScreen, Tx, vline } from '@/tablet/ui';

type Entry = { f: GitFile; staged: boolean; key: string; letter: string };
type Loaded = { key: string; lines: DiffLine[]; add: number; del: number; binary: boolean; error?: string };
type Output = { cmd: string; lines: string[]; ok: boolean; ms: number };

const letterTone = (l: string) => ({ M: T.orange, A: T.green, D: T.red, U: T.red, R: T.blue, C: T.blue })[l] ?? T.muted;

function entries(files: GitFile[]): Entry[] {
  const staged = files.filter(isStaged).map((f) => ({ f, staged: true, key: `s:${f.path}`, letter: f.x }));
  const unstaged = files.filter(isUnstaged).map((f) => ({ f, staged: false, key: `u:${f.path}`, letter: f.conflict ? 'U' : f.untracked ? '?' : f.y }));
  return [...staged, ...unstaged];
}

/** `+3 −1` per file, staged and unstaged counted separately. */
async function numstat(repo: string) {
  const out = new Map<string, [number, number]>();
  const [u, c] = await Promise.all([git(repo, 'diff --numstat', { allowFail: true }), git(repo, 'diff --cached --numstat', { allowFail: true })]);
  for (const [prefix, r] of [['u', u], ['s', c]] as const)
    for (const l of r.stdout.split('\n')) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(l);
      if (m) out.set(`${prefix}:${m[3]}`, [Number(m[1]) || 0, Number(m[2]) || 0]);
    }
  return out;
}

export function TabletGit() {
  const session = useSession();
  const server = session?.server;
  const g = useGit();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [counts, setCounts] = useState<Map<string, [number, number]>>(new Map());

  const sessionId = session?.open ? session.id : null;
  useEffect(() => {
    if (server && sessionId) (selectServer(server) ?? refresh());
  }, [server, sessionId]);

  const st_ = g?.status;
  const list = st_ ? entries(st_.files) : [];
  const statusKey = list.map((e) => e.key + e.letter).join('|');
  const repo = g?.repo ?? '';

  useEffect(() => {
    if (!repo || !statusKey || !sessionId) return;
    let live = true;
    numstat(repo)
      .then((m) => live && setCounts(m))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [repo, statusKey, sessionId]);

  if (!session?.open || !server) {
    return (
      <TabletScreen>
        <Empty
          title="Aucune session"
          text="Connecte-toi à un serveur pour gérer ses dépôts Git."
          action={<Btn title={server ? 'Se reconnecter' : 'Choisir un serveur'} style={{ marginTop: 8 }} onPress={() => (server ? router.push(`/connect/${server.id}`) : router.navigate('/'))} />}
        />
      </TabletScreen>
    );
  }

  const selected = list.find((e) => e.key === picked) ?? list[0];
  const repoName = repo.replace(/\/+$/, '').split('/').pop() || repo;
  const staged = list.filter((e) => e.staged);

  async function run(label: string, args: string, timeoutMs = 120_000) {
    setBusy(label);
    const t0 = Date.now();
    try {
      const r = await git(repo, args, { timeoutMs, allowFail: true });
      setOutput({ cmd: `git ${args.split(' ')[0]}`, lines: r.output ? r.output.split('\n').slice(-6) : [], ok: r.exitCode === 0, ms: Date.now() - t0 });
    } catch (e) {
      setOutput({ cmd: `git ${args.split(' ')[0]}`, lines: [(e as Error).message], ok: false, ms: Date.now() - t0 });
    }
    setBusy(null);
    refresh();
  }

  function discardEverything() {
    Alert.alert('Tout annuler ?', 'Toutes les modifications non commitées et les fichiers non suivis seront supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Tout supprimer',
        style: 'destructive',
        onPress: async () => {
          if (server!.env === 'prod' && !(await confirmBiometric(`Annuler les modifications sur ${server!.name}`))) return;
          act(discardAll);
        },
      },
    ]);
  }

  const behind = st_?.behind ?? 0;
  const ahead = st_?.ahead ?? 0;
  const pushFirst = ahead > 0 && !behind;
  const actions = [
    pushFirst ? { g: '↑', t: 'Push', primary: true, go: () => router.push({ pathname: '/git/pull', params: { op: 'push' } }) } : { g: '↓', t: 'Pull', primary: true, go: () => router.push({ pathname: '/git/pull', params: { op: 'pull' } }) },
    { g: '⟳', t: 'Fetch', busy: busy === 'fetch', go: () => run('fetch', 'fetch --all --prune') },
    { g: '⑂', t: 'Branche', go: () => router.push('/git/branch') },
    pushFirst
      ? { g: '↓', t: 'Pull', go: () => router.push({ pathname: '/git/pull', params: { op: 'pull' } }) }
      : { g: '↺', t: 'Revenir', go: () => (g?.commits[1] ? router.push({ pathname: '/git/revert', params: { sha: g.commits[1].full } }) : Alert.alert('Git', 'Aucun commit précédent.')) },
  ];

  const upstreamLine = !st_
    ? null
    : behind > 0
      ? { c: T.orange, t: `↓ ${behind} commit${behind > 1 ? 's' : ''} en retard sur ${st_.upstream}` }
      : ahead > 0
        ? { c: T.blue, t: `↑ ${ahead} commit${ahead > 1 ? 's' : ''} en avance sur ${st_.upstream}` }
        : st_.upstream
          ? { c: T.green, t: `À jour avec ${st_.upstream}` }
          : { c: T.muted, t: st_.branch ? 'Pas de branche distante' : 'HEAD détachée' };

  return (
    <TabletScreen>
      <ScrollView style={[{ flexGrow: 0, flexShrink: 1, flexBasis: 360, minWidth: 300 }, vline]} contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Pressable onPress={() => router.push('/git/repo')} style={[card, st.row, { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 12 }]}>
          <View style={{ flex: 1, gap: 3 }}>
            <Tx w={600} style={{ fontSize: 15 }} numberOfLines={1}>
              {repoName}
            </Tx>
            <Tx mono style={{ fontSize: 11.5, color: T.muted }} numberOfLines={1}>
              {repo} · {server.name}
            </Tx>
          </View>
          <Tx w={600} style={{ fontSize: 13, color: T.blue }}>
            Changer
          </Tx>
        </Pressable>

        {!st_ && g?.loading && <ActivityIndicator style={{ marginTop: 40 }} color={T.muted} />}
        {!st_ && g?.error && !g.loading && (
          <View style={{ borderRadius: 14, borderWidth: 1.5, borderColor: T.red, backgroundColor: alpha(T.red, 0.1), padding: 14, gap: 10 }}>
            <Tx w={600}>Dépôt inaccessible</Tx>
            <Tx mono style={{ fontSize: 12, color: T.soft }}>
              {g.error}
            </Tx>
            <View style={[st.row, { gap: 8 }]}>
              <Btn title="Choisir un dépôt" style={{ flex: 1 }} onPress={() => router.push('/git/repo')} />
              <Btn title="Réessayer" kind="ghost" style={{ flex: 1 }} onPress={refresh} />
            </View>
          </View>
        )}

        {st_ && (
          <>
            <View style={{ gap: 4, paddingHorizontal: 2 }}>
              <Pressable onPress={() => router.push('/git/branch')} style={[st.row, { gap: 8 }]}>
                <Tx mono w={600} style={{ fontSize: 22 }} numberOfLines={1}>
                  {st_.branch ?? `HEAD ${st_.oid?.slice(0, 7) ?? ''}`}
                </Tx>
                <Tx style={{ color: T.faint, fontSize: 11 }}>▼</Tx>
              </Pressable>
              <Tx style={{ fontSize: 13, color: upstreamLine!.c }}>
                {upstreamLine!.t}
                <Tx style={{ fontSize: 13, color: T.dim }}> · fetch {ago(g.fetchedAt)}</Tx>
              </Tx>
            </View>

            <Grid columns={4} gap={6}>
              {actions.map((a) => (
                <Pressable key={a.t} onPress={a.go} disabled={!!a.busy} style={({ pressed }) => ({ height: 66, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: a.primary ? T.blue : T.field, opacity: pressed ? 0.8 : 1 })}>
                  {a.busy ? (
                    <ActivityIndicator size="small" color={T.text} />
                  ) : (
                    <Tx style={{ fontSize: 18, lineHeight: 20, color: a.primary ? T.ink : T.text }}>{a.g}</Tx>
                  )}
                  <Tx w={600} style={{ fontSize: 12.5, color: a.primary ? T.ink : T.text }}>
                    {a.t}
                  </Tx>
                </Pressable>
              ))}
            </Grid>

            <View style={[st.row, { justifyContent: 'space-between', paddingTop: 4, paddingHorizontal: 2 }]}>
              <Label>MODIFICATIONS · {list.length}</Label>
              <View style={[st.row, { gap: 14 }]}>
                {staged.length > 0 && (
                  <Pressable onPress={() => router.push('/git/commit')} hitSlop={8}>
                    <Tx w={600} style={{ fontSize: 12, color: T.blue }}>
                      Commit ({staged.length})
                    </Tx>
                  </Pressable>
                )}
                {list.some((e) => !e.staged) && (
                  <>
                    <Pressable onPress={() => act((r) => git(r, 'add -A'))} hitSlop={8}>
                      <Tx style={{ fontSize: 12, color: T.blue }}>Tout indexer</Tx>
                    </Pressable>
                    <Pressable onPress={discardEverything} hitSlop={8}>
                      <Tx style={{ fontSize: 12, color: T.red }}>Tout annuler</Tx>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
            <View style={card}>
              {list.map((e, i) => {
                const tone = letterTone(e.letter);
                const n = counts.get(e.key);
                return (
                  <Pressable key={e.key} onPress={() => setPicked(e.key)} style={[st.row, { height: 46, gap: 10, paddingHorizontal: 12, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderColor: T.cardLine, backgroundColor: e.key === selected?.key ? T.field : 'transparent' }]}>
                    <Pressable hitSlop={10} accessibilityLabel={e.staged ? 'Retirer de l’index' : 'Indexer'} onPress={() => act((r) => (e.staged ? unstage(r, e.f) : stage(r, e.f)))} style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: e.staged ? T.blue : T.faint, backgroundColor: e.staged ? T.blue : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {e.staged && <Tx style={{ fontSize: 11, lineHeight: 13, color: T.ink }}>✓</Tx>}
                    </Pressable>
                    <View style={{ width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: e.letter === '?' ? T.chip : alpha(tone, 0.16) }}>
                      <Tx mono w={600} style={{ fontSize: 11, color: tone }}>
                        {e.letter}
                      </Tx>
                    </View>
                    <Tx mono style={{ flex: 1, fontSize: 12.5 }} numberOfLines={1} ellipsizeMode="head">
                      {e.f.orig ? `${e.f.orig} → ` : ''}
                      {e.f.path}
                    </Tx>
                    {n && (
                      <>
                        <Tx mono style={{ fontSize: 11.5, color: T.green }}>
                          +{n[0]}
                        </Tx>
                        <Tx mono style={{ fontSize: 11.5, color: T.red }}>
                          −{n[1]}
                        </Tx>
                      </>
                    )}
                  </Pressable>
                );
              })}
              {!list.length && (
                <View style={{ height: 46, justifyContent: 'center', paddingHorizontal: 12 }}>
                  <Tx style={{ fontSize: 13, color: T.dim }}>Copie de travail propre.</Tx>
                </View>
              )}
            </View>

            <Label style={{ paddingTop: 4, paddingHorizontal: 2 }}>DERNIERS COMMITS</Label>
            <View>
              {g.commits.map((c, i) => (
                <View key={c.full} style={[st.row, { minHeight: 52, gap: 10, paddingVertical: 6, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: T.rowLine }]}>
                  <Tx mono style={{ fontSize: 12, color: T.orange }}>
                    {c.sha}
                  </Tx>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Tx style={{ fontSize: 13.5 }} numberOfLines={1}>
                      {c.msg}
                    </Tx>
                    <Tx style={{ fontSize: 11.5, color: T.dim }} numberOfLines={1}>
                      {c.author} · {ago(c.time)}
                      {i === 0 ? ' · HEAD' : ''}
                      {g.tags
                        .filter((t) => t.commit === c.full)
                        .map((t) => ` · ${t.name}`)
                        .join('')}
                    </Tx>
                  </View>
                  <Pressable onPress={() => router.push({ pathname: '/git/revert', params: { sha: c.full } })} accessibilityLabel={`Revenir à ${c.sha}`} style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: T.field, alignItems: 'center', justifyContent: 'center' }}>
                    <Tx style={{ color: T.muted }}>↺</Tx>
                  </Pressable>
                </View>
              ))}
              {!g.commits.length && <Tx style={{ fontSize: 13, color: T.dim, paddingVertical: 12 }}>Aucun commit.</Tx>}
            </View>

            <View style={card}>
              {[
                ...(g.remote ? [{ t: 'Pull requests', v: forgeLabel[g.remote.forge], go: () => router.push('/git/prs') }] : []),
                { t: 'Remises (stash)', v: String(g.stashes.length), go: () => router.push('/git/stash') },
                { t: 'Tags', v: g.tags[0] ? `${g.tags[0].name} · ${g.tags.length}` : '0', go: () => router.push('/git/tags') },
              ].map((r, i, all) => (
                <Pressable key={r.t} onPress={r.go} style={[st.row, { height: 46, paddingHorizontal: 12, gap: 10, borderBottomWidth: i === all.length - 1 ? 0 : 1, borderColor: T.cardLine }]}>
                  <Tx style={{ flex: 1, fontSize: 14 }}>{r.t}</Tx>
                  <Tx mono style={{ fontSize: 12, color: T.muted }}>
                    {r.v} ›
                  </Tx>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 360, minWidth: 0 }}>
        {selected ? <DiffPane key={selected.key + selected.letter} entry={selected} prod={server.env === 'prod'} serverName={server.name} /> : <Empty title={st_ ? 'Aucune modification' : ' '} text={st_ ? 'Le diff du fichier sélectionné s’affiche ici.' : undefined} />}
        {output && (
          <View style={{ borderTopWidth: 1, borderColor: T.line, backgroundColor: T.panel, paddingVertical: 12, paddingHorizontal: 18, gap: 6 }}>
            <Tx style={{ fontSize: 11, letterSpacing: 1.1, color: T.dim }}>DERNIÈRE SORTIE · {output.cmd}</Tx>
            {output.lines.map((l, i) => (
              <Tx key={i} mono style={{ fontSize: 12, color: T.muted }} numberOfLines={1}>
                {l}
              </Tx>
            ))}
            <Tx mono style={{ fontSize: 12, color: output.ok ? T.green : T.red }}>
              {output.ok ? '✓' : '✕'} {output.ok ? 'Terminé' : 'Échec'} en {(output.ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s
            </Tx>
          </View>
        )}
      </View>
    </TabletScreen>
  );
}

function DiffPane({ entry, prod, serverName }: { entry: Entry; prod: boolean; serverName: string }) {
  const [d, setD] = useState<Loaded | null>(null);
  const g = useGit();
  const repo = g?.repo ?? '';

  useEffect(() => {
    let live = true;
    diff(repo, entry.f, entry.staged).then(
      (r) => live && setD({ key: entry.key, ...r }),
      (e) => live && setD({ key: entry.key, lines: [], add: 0, del: 0, binary: false, error: (e as Error).message }),
    );
    return () => {
      live = false;
    };
    // The pane is keyed by file and status letter; a new status object (after any action) reloads the diff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, g?.status]);

  function discard() {
    const f = entry.f;
    Alert.alert('Annuler les modifications ?', f.untracked ? `${f.path} sera supprimé.` : `${f.path} reviendra à sa version du dernier commit.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Annuler les modifs',
        style: 'destructive',
        onPress: async () => {
          if (prod && !(await confirmBiometric(`Annuler les modifications de ${f.path} sur ${serverName}`))) return;
          act((r) => discardFile(r, f));
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[st.row, { minHeight: 60, gap: 12, paddingHorizontal: 18, borderBottomWidth: 1, borderColor: T.line, flexWrap: 'wrap' }]}>
        <Tx mono w={600} style={{ fontSize: 15, flex: 1 }} numberOfLines={1} ellipsizeMode="head">
          {entry.f.path}
        </Tx>
        {d && (
          <>
            <Tx mono style={{ fontSize: 13, color: T.green }}>
              +{d.add}
            </Tx>
            <Tx mono style={{ fontSize: 13, color: T.red }}>
              −{d.del}
            </Tx>
          </>
        )}
        {!entry.staged && <Btn kind="danger" title="Annuler les modifs" height={38} radius={10} textStyle={{ fontSize: 13 }} style={{ paddingHorizontal: 14 }} onPress={discard} />}
      </View>
      <ScrollView style={{ flex: 1, backgroundColor: T.term }}>
        {!d && <ActivityIndicator style={{ marginTop: 40 }} color={T.muted} />}
        {d?.error && (
          <Tx mono style={{ fontSize: 13, color: T.red, padding: 16 }}>
            {d.error}
          </Tx>
        )}
        {d?.binary && <Tx style={{ fontSize: 13, color: T.muted, padding: 16 }}>Fichier binaire : pas de diff texte.</Tx>}
        {d && !d.error && !d.binary && !d.lines.length && <Tx style={{ fontSize: 13, color: T.muted, padding: 16 }}>Aucune différence de contenu (droits ou renommage).</Tx>}
        <ScrollView horizontal>
          <View style={{ minWidth: '100%' }}>
            {d?.lines.map((l, i) =>
              l.k === '@' ? (
                <Tx key={i} mono style={{ fontSize: 13, lineHeight: 22.75, color: T.blue, backgroundColor: alpha(T.blue, 0.08), paddingVertical: 6, paddingHorizontal: 16 }}>
                  {l.t}
                </Tx>
              ) : (
                <View key={i} style={{ flexDirection: 'row', backgroundColor: l.k === '-' ? alpha(T.red, 0.13) : l.k === '+' ? alpha(T.green, 0.12) : 'transparent', paddingRight: 16 }}>
                  <Tx mono style={{ width: 40, textAlign: 'right', paddingRight: 10, fontSize: 13, lineHeight: 22.75, color: T.lineNo }}>
                    {l.o ?? ''}
                  </Tx>
                  <Tx mono style={{ width: 40, textAlign: 'right', paddingRight: 10, fontSize: 13, lineHeight: 22.75, color: T.lineNo }}>
                    {l.n ?? ''}
                  </Tx>
                  <Tx mono style={{ width: 18, fontSize: 13, lineHeight: 22.75, color: l.k === '-' ? T.red : l.k === '+' ? T.green : T.faint }}>
                    {l.k ?? ''}
                  </Tx>
                  <Tx mono style={{ fontSize: 13, lineHeight: 22.75, color: l.k === '-' ? '#F0D4D0' : l.k === '+' ? '#D3F0DF' : T.text2 }}>
                    {l.t}
                  </Tx>
                </View>
              ),
            )}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}
