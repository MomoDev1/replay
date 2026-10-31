import { router } from 'expo-router';
import { ChevronRight, CodeXml, File, FilePlus, Folder, FolderGit2, FolderUp, Home, Search } from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Mono, s } from '@/components/ui';
import { dirname, join, resolveDir } from '@/lib/files';
import { open, refresh, selectServer, useCode } from '@/store/code';
import { repoFor, selectServer as selectGitServer, useGit } from '@/store/git';
import { useSession } from '@/store/session';
import { C } from '@/theme';

const letterColor = (l: string) => ({ M: C.orange, A: C.green, '?': C.green, D: C.red, U: C.red, R: C.accent, C: C.accent })[l] ?? C.muted;

/** Git status letter for each changed path of the selected repo, keyed by absolute path. */
function useGitBadges() {
  const g = useGit();
  const [repoAbs, setRepoAbs] = useState<{ repo: string; abs: string } | null>(null);
  const repo = g?.repo;
  const status = g?.status;
  const hasStatus = !!status;

  useEffect(() => {
    if (!repo || !hasStatus || repoAbs?.repo === repo) return;
    resolveDir(repo).then(
      (abs) => setRepoAbs({ repo, abs }),
      () => {},
    );
  }, [repo, hasStatus, repoAbs?.repo]);

  return useMemo(() => {
    const files = new Map<string, string>();
    const dirs = new Set<string>();
    if (!status || !repoAbs || repoAbs.repo !== repo) return { files, dirs };
    for (const f of status.files) {
      const abs = join(repoAbs.abs, f.path);
      files.set(abs, f.conflict ? 'U' : f.untracked ? '?' : f.y !== '.' ? f.y : f.x);
      for (let d = dirname(abs); d.length > repoAbs.abs.length; d = dirname(d)) dirs.add(d);
    }
    return { files, dirs };
  }, [status, repo, repoAbs]);
}

export default function CodeScreen() {
  const session = useSession();
  const server = session?.server;
  const st = useCode();
  const badges = useGitBadges();
  const gitRepo = useGit()?.repo;

  const sessionId = session?.open ? session.id : null;
  useEffect(() => {
    if (!server || !sessionId) return;
    selectServer(server);
    // Loads the repo status too, for the M/A/? badges.
    selectGitServer(server);
  }, [server, sessionId]);

  if (!session?.open || !server) {
    return (
      <SafeAreaView style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <CodeXml size={40} color={C.dim} />
          <Text style={s.h2}>Aucune session</Text>
          <Text style={[s.muted, { textAlign: 'center' }]}>Connecte-toi à un serveur pour parcourir et éditer ses fichiers.</Text>
        </View>
        <Button title={server ? 'Se reconnecter' : 'Choisir un serveur'} style={{ marginTop: 24 }} onPress={() => (server ? router.push(`/connect/${server.id}`) : router.navigate('/'))} />
      </SafeAreaView>
    );
  }

  const cwd = st?.cwd;
  const crumbs = cwd ? cwd.split('/').filter(Boolean) : [];

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={[s.row, { paddingHorizontal: 16, paddingTop: 16, gap: 8 }]}>
        <Text style={[s.h1, { flex: 1 }]}>Code</Text>
        <Pressable onPress={() => router.push('/code/search')} style={{ backgroundColor: C.surface2, borderRadius: 10, padding: 9 }} disabled={!cwd}>
          <Search size={18} color={C.text} />
        </Pressable>
        <Pressable onPress={() => router.push('/code/new')} style={{ backgroundColor: C.surface2, borderRadius: 10, padding: 9 }} disabled={!cwd}>
          <FilePlus size={18} color={C.text} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: 12 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 2, alignItems: 'center' }}>
        <Pressable onPress={() => open('/')} hitSlop={6} style={{ paddingVertical: 4, paddingRight: 2 }}>
          <Mono style={{ color: crumbs.length ? C.accent : C.text, fontSize: 12 }}>/</Mono>
        </Pressable>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <View key={i} style={[s.row, { gap: 2 }]}>
              {i > 0 && <ChevronRight size={12} color={C.dim} />}
              <Pressable disabled={last} onPress={() => open('/' + crumbs.slice(0, i + 1).join('/'))} hitSlop={6} style={{ paddingVertical: 4 }}>
                <Mono style={{ color: last ? C.text : C.accent, fontSize: 12, fontWeight: last ? '700' : '400' }}>{c}</Mono>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      <View style={[s.row, { gap: 8, paddingHorizontal: 16, marginTop: 8 }]}>
        <Shortcut icon={<FolderUp size={14} color={C.text} />} label="Parent" disabled={!cwd || cwd === '/'} onPress={() => cwd && open(dirname(cwd))} />
        <Shortcut icon={<Home size={14} color={C.text} />} label="~" onPress={() => open('~')} />
        <Shortcut icon={<FolderGit2 size={14} color={C.text} />} label="Dépôt Git" onPress={() => open(gitRepo ?? repoFor(server))} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 12 }} refreshControl={<RefreshControl refreshing={!!st?.loading && !!st.entries} onRefresh={refresh} tintColor={C.muted} />}>
        {st?.error && (
          <Card style={{ marginBottom: 12, borderColor: C.red + '66', backgroundColor: C.redBg }}>
            <Text style={{ color: C.text, fontWeight: '600' }}>Dossier inaccessible</Text>
            <Mono style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{st.error}</Mono>
          </Card>
        )}
        {!st?.entries && st?.loading && <ActivityIndicator style={{ marginTop: 40 }} color={C.muted} />}
        {st?.entries && cwd && (
          <Card style={{ padding: 0 }}>
            {st.entries.length === 0 && <Text style={[s.muted, { padding: 14 }]}>Dossier vide.</Text>}
            {st.entries.map((e, i) => {
              const abs = join(cwd, e.name);
              const letter = e.dir ? (badges.dirs.has(abs) ? '•' : null) : (badges.files.get(abs) ?? null);
              const hidden = e.name.startsWith('.');
              return (
                <Pressable
                  key={e.name}
                  onPress={() => (e.dir ? open(abs) : router.push({ pathname: '/code/edit', params: { path: abs } }))}
                  style={({ pressed }) => [s.row, { gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderColor: C.border, backgroundColor: pressed ? C.surface2 : 'transparent' }]}>
                  {e.dir ? <Folder size={16} color={C.accent} fill={C.accent + '33'} /> : <File size={16} color={C.muted} />}
                  <Mono style={{ flex: 1, fontSize: 13, color: letter && letter !== '•' ? letterColor(letter) : hidden ? C.muted : C.text }} numberOfLines={1}>
                    {e.name}
                  </Mono>
                  {letter && <Mono style={{ fontSize: 11, color: letter === '•' ? C.orange : letterColor(letter), fontWeight: '700' }}>{letter}</Mono>}
                  {e.dir && <ChevronRight size={14} color={C.dim} />}
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Shortcut({ icon, label, disabled, onPress }: { icon: ReactNode; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.row, { gap: 6, backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, opacity: disabled ? 0.4 : 1 }]}>
      {icon}
      <Text style={{ color: C.text, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
