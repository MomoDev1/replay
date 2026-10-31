import { router } from 'expo-router';
import { Archive, ArrowDown, ArrowUp, Check, ChevronRight, FolderGit2, GitBranch, GitCommitHorizontal, GitPullRequest, RefreshCw, RotateCcw, Tag } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Mono, s, SectionLabel } from '@/components/ui';
import { confirmBiometric } from '@/lib/auth';
import { forgeLabel } from '@/lib/forge';
import { ago, discardAll, git, isStaged, isUnstaged, stage, unstage, type GitFile } from '@/lib/git';
import { act, refresh, selectServer, useGit } from '@/store/git';
import { useSession } from '@/store/session';
import { C } from '@/theme';

function Action({ icon, label, primary, busy, onPress }: { icon: ReactNode; label: string; primary?: boolean; busy?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 12, backgroundColor: primary ? C.accent : C.surface2 }}>
      {busy ? <ActivityIndicator size="small" color={primary ? '#fff' : C.text} /> : icon}
      <Text style={{ color: primary ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const letterColor = (l: string) => ({ M: C.orange, A: C.green, '?': C.green, D: C.red, U: C.red, R: C.accent, C: C.accent })[l] ?? C.muted;

function FileRow({ f, staged, first }: { f: GitFile; staged: boolean; first: boolean }) {
  const letter = f.conflict ? 'U' : staged ? f.x : f.y;
  const col = letterColor(letter);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/git/diff', params: { path: f.path, staged: staged ? '1' : '' } })}
      style={[s.row, { gap: 10, padding: 12, borderTopWidth: first ? 0 : 1, borderColor: C.border }]}>
      <Pressable hitSlop={10} onPress={() => act((repo) => (staged ? unstage(repo, f) : stage(repo, f)))}>
        <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: staged ? C.accent : C.dim, backgroundColor: staged ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {staged && <Check size={13} color="#fff" strokeWidth={3} />}
        </View>
      </Pressable>
      <View style={{ width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: col + '22' }}>
        <Mono style={{ fontSize: 11, color: col }}>{letter}</Mono>
      </View>
      <Mono style={{ flex: 1, fontSize: 12 }} numberOfLines={2}>
        {f.orig ? `${f.orig} → ` : ''}
        {f.path}
      </Mono>
      <ChevronRight size={14} color={C.dim} />
    </Pressable>
  );
}

export default function GitScreen() {
  const session = useSession();
  const server = session?.server;
  const g = useGit();
  const [fetching, setFetching] = useState(false);

  const sessionId = session?.open ? session.id : null;
  useEffect(() => {
    // New server → load its repo; same server after a reconnect → reload.
    if (server && sessionId) (selectServer(server) ?? refresh());
  }, [server, sessionId]);

  if (!session?.open || !server) {
    return (
      <SafeAreaView style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <GitBranch size={40} color={C.dim} />
          <Text style={s.h2}>Aucune session</Text>
          <Text style={[s.muted, { textAlign: 'center' }]}>Connecte-toi à un serveur pour gérer ses dépôts Git.</Text>
        </View>
        <Button title={server ? 'Se reconnecter' : 'Choisir un serveur'} style={{ marginTop: 24 }} onPress={() => (server ? router.push(`/connect/${server.id}`) : router.navigate('/'))} />
      </SafeAreaView>
    );
  }

  const st = g?.status;
  const staged = st?.files.filter(isStaged) ?? [];
  const unstaged = st?.files.filter(isUnstaged) ?? [];
  const repo = g?.repo ?? '';
  const repoName = repo.replace(/\/+$/, '').split('/').pop() || repo;

  async function fetch() {
    setFetching(true);
    await act((r) => git(r, 'fetch --all --prune', { timeoutMs: 120_000 }));
    setFetching(false);
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

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={!!g?.loading && !!st} onRefresh={refresh} tintColor={C.muted} />}>
        <Text style={s.h1}>Git</Text>
        <Pressable onPress={() => router.push('/git/repo')}>
          <Card style={[s.row, { gap: 10, marginTop: 12, padding: 12 }]}>
            <View style={{ backgroundColor: C.surface2, borderRadius: 6, padding: 6 }}>
              <FolderGit2 size={16} color={C.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Mono style={{ fontWeight: '700' }} numberOfLines={1}>
                {repoName}
              </Mono>
              <Mono style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>
                {repo} · {server.name}
              </Mono>
            </View>
            <Text style={{ color: C.accent, fontWeight: '600' }}>Changer</Text>
          </Card>
        </Pressable>

        {!st && g?.loading && <ActivityIndicator style={{ marginTop: 40 }} color={C.muted} />}

        {!st && g?.error && !g.loading && (
          <Card style={{ marginTop: 16, borderColor: C.red + '66', backgroundColor: C.redBg }}>
            <Text style={{ color: C.text, fontWeight: '600' }}>Dépôt inaccessible</Text>
            <Mono style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{g.error}</Mono>
            <View style={[s.row, { gap: 8, marginTop: 12 }]}>
              <Button title="Choisir un dépôt" style={{ flex: 1 }} onPress={() => router.push('/git/repo')} />
              <Button title="Réessayer" variant="ghost" style={{ flex: 1 }} onPress={refresh} />
            </View>
          </Card>
        )}

        {st && (
          <>
            <View style={[s.row, { gap: 8, marginTop: 16, flexWrap: 'wrap' }]}>
              <Mono style={{ fontSize: 22, fontWeight: '700' }}>{st.branch ?? `HEAD ${st.oid?.slice(0, 7) ?? ''}`}</Mono>
              <Mono style={{ color: C.muted, fontSize: 12 }}>{st.upstream ? `→ ${st.upstream}` : st.branch ? 'pas de branche distante' : 'détachée'}</Mono>
            </View>
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              {st.behind > 0 && <Text style={{ color: C.orange }}>↓ {st.behind} en retard · </Text>}
              {st.ahead > 0 && <Text style={{ color: C.accent }}>↑ {st.ahead} en avance · </Text>}
              {st.upstream && !st.ahead && !st.behind && <Text style={{ color: C.green }}>À jour · </Text>}
              fetch {ago(g.fetchedAt)}
            </Text>

            <View style={[s.row, { gap: 8, marginTop: 14 }]}>
              <Action primary={st.behind > 0 || !st.ahead} icon={<ArrowDown size={18} color={st.behind > 0 || !st.ahead ? '#fff' : C.text} />} label="Pull" onPress={() => router.push({ pathname: '/git/pull', params: { op: 'pull' } })} />
              <Action primary={st.ahead > 0 && !st.behind} icon={<ArrowUp size={18} color={st.ahead > 0 && !st.behind ? '#fff' : C.text} />} label="Push" onPress={() => router.push({ pathname: '/git/pull', params: { op: 'push' } })} />
              <Action icon={<RefreshCw size={18} color={C.text} />} label="Fetch" busy={fetching} onPress={fetch} />
              <Action icon={<GitBranch size={18} color={C.text} />} label="Branche" onPress={() => router.push('/git/branch')} />
            </View>

            {staged.length > 0 && (
              <>
                <SectionLabel
                  right={
                    <Pressable onPress={() => router.push('/git/commit')} hitSlop={8} style={[s.row, { gap: 4 }]}>
                      <GitCommitHorizontal size={14} color={C.accent} />
                      <Text style={{ color: C.accent, fontSize: 12, fontWeight: '600' }}>Commit</Text>
                    </Pressable>
                  }>{`Indexés · ${staged.length}`}</SectionLabel>
                <Card style={{ padding: 0 }}>
                  {staged.map((f, i) => (
                    <FileRow key={'s' + f.path} f={f} staged first={!i} />
                  ))}
                </Card>
              </>
            )}

            <SectionLabel
              right={
                unstaged.length > 0 ? (
                  <View style={[s.row, { gap: 14 }]}>
                    <Pressable onPress={() => act((r) => git(r, 'add -A'))} hitSlop={8}>
                      <Text style={{ color: C.accent, fontSize: 12 }}>Tout indexer</Text>
                    </Pressable>
                    <Pressable onPress={discardEverything} hitSlop={8}>
                      <Text style={{ color: C.red, fontSize: 12 }}>Tout annuler</Text>
                    </Pressable>
                  </View>
                ) : undefined
              }>{`Modifications · ${unstaged.length}`}</SectionLabel>
            <Card style={{ padding: unstaged.length ? 0 : 14 }}>
              {unstaged.length ? unstaged.map((f, i) => <FileRow key={'u' + f.path} f={f} staged={false} first={!i} />) : <Text style={s.muted}>Copie de travail propre.</Text>}
            </Card>
            {staged.length === 0 && unstaged.length > 0 && <Text style={{ color: C.dim, fontSize: 11, marginTop: 6, paddingHorizontal: 4 }}>Coche des fichiers pour les indexer, puis commit.</Text>}

            {g.remote && (
              <Pressable onPress={() => router.push('/git/prs')}>
                <Card style={[s.row, { gap: 10, marginTop: 16, padding: 12 }]}>
                  <GitPullRequest size={16} color={C.accent} />
                  <Text style={{ color: C.text, flex: 1 }}>Pull requests</Text>
                  <Mono style={{ color: C.muted, fontSize: 12 }}>{forgeLabel[g.remote.forge]}</Mono>
                  <ChevronRight size={14} color={C.dim} />
                </Card>
              </Pressable>
            )}

            <Pressable onPress={() => router.push('/git/stash')}>
              <Card style={[s.row, { gap: 10, marginTop: g.remote ? 8 : 16, padding: 12 }]}>
                <Archive size={16} color={C.muted} />
                <Text style={{ color: C.text, flex: 1 }}>Remises (stash)</Text>
                <Mono style={{ color: C.muted, fontSize: 12 }}>{g.stashes.length}</Mono>
                <ChevronRight size={14} color={C.dim} />
              </Card>
            </Pressable>

            <Pressable onPress={() => router.push('/git/tags')}>
              <Card style={[s.row, { gap: 10, marginTop: 8, padding: 12 }]}>
                <Tag size={16} color={C.muted} />
                <Text style={{ color: C.text }}>Tags</Text>
                <Mono style={{ color: C.green, fontSize: 12, flex: 1, textAlign: 'right' }} numberOfLines={1}>
                  {g.tags[0]?.name ?? ''}
                </Mono>
                <Mono style={{ color: C.muted, fontSize: 12 }}>{g.tags.length}</Mono>
                <ChevronRight size={14} color={C.dim} />
              </Card>
            </Pressable>

            <SectionLabel>Derniers commits</SectionLabel>
            <Card style={{ padding: g.commits.length ? 0 : 14 }}>
              {!g.commits.length && <Text style={s.muted}>Aucun commit.</Text>}
              {g.commits.map((c, i) => (
                <View key={c.full} style={[s.row, { padding: 12, gap: 10, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                      <Mono style={{ color: C.orange, fontSize: 12 }}>{c.sha}</Mono>
                      {i === 0 && (
                        <View style={{ backgroundColor: C.accentBg, borderRadius: 4, paddingHorizontal: 4 }}>
                          <Text style={{ color: C.accent, fontSize: 9, fontWeight: '700' }}>HEAD</Text>
                        </View>
                      )}
                      {g.tags
                        .filter((t) => t.commit === c.full)
                        .map((t) => (
                          <View key={t.name} style={[s.row, { gap: 3, backgroundColor: C.green + '22', borderRadius: 4, paddingHorizontal: 4 }]}>
                            <Tag size={9} color={C.green} />
                            <Text style={{ color: C.green, fontSize: 9, fontWeight: '700' }}>{t.name}</Text>
                          </View>
                        ))}
                    </View>
                    <Text style={{ color: C.text, fontSize: 13 }}>{c.msg}</Text>
                    <Text style={{ color: C.dim, fontSize: 11 }}>
                      {c.author} · {ago(c.time)}
                    </Text>
                  </View>
                  <Pressable onPress={() => router.push({ pathname: '/git/revert', params: { sha: c.full } })} style={{ backgroundColor: C.surface2, borderRadius: 8, padding: 8 }}>
                    <RotateCcw size={14} color={C.muted} />
                  </Pressable>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
