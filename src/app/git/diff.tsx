import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Mono, s } from '@/components/ui';
import { confirmBiometric } from '@/lib/auth';
import { diff, discardFile, isStaged, isUnstaged, type DiffLine } from '@/lib/git';
import { act, currentRepo, useGit } from '@/store/git';
import { useSession } from '@/store/session';
import { C } from '@/theme';

type Loaded = { key: string; lines: DiffLine[]; add: number; del: number; binary: boolean; error?: string };

export default function Diff() {
  const { path, staged: stagedParam } = useLocalSearchParams<{ path: string; staged?: string }>();
  const staged = !!stagedParam;
  const g = useGit();
  const server = useSession()?.server;
  const list = g?.status?.files.filter(staged ? isStaged : isUnstaged) ?? [];
  const idx = list.findIndex((f) => f.path === path);
  const file = list[idx];
  const key = `${path}|${staged}|${file?.x}${file?.y}`;
  const [d, setD] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!file) return;
    let live = true;
    diff(currentRepo(), file, staged).then(
      (r) => live && setD({ key, ...r }),
      (e) => live && setD({ key, lines: [], add: 0, del: 0, binary: false, error: (e as Error).message }),
    );
    return () => {
      live = false;
    };
    // `key` captures every input that changes the diff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loaded = d?.key === key ? d : null;

  function discard() {
    if (!file) return;
    Alert.alert('Annuler les modifications ?', file.untracked ? `${file.path} sera supprimé.` : `${file.path} reviendra à sa version du dernier commit.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Annuler les modifs',
        style: 'destructive',
        onPress: async () => {
          if (server?.env === 'prod' && !(await confirmBiometric(`Annuler les modifications de ${file.path}`))) return;
          await act((repo) => discardFile(repo, file));
          router.back();
        },
      },
    ]);
  }

  const next = list.length > 1 ? list[(idx + 1) % list.length] : null;

  return (
    <SafeAreaView style={s.screen}>
      <View style={{ paddingHorizontal: 16 }}>
        <Pressable onPress={() => router.back()} style={[s.row, { gap: 2 }]}>
          <ChevronLeft size={16} color={C.accent} />
          <Text style={{ color: C.accent }}>Git</Text>
        </Pressable>
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 6, gap: 8 }]}>
          <Mono style={{ fontWeight: '700', fontSize: 16, flex: 1 }} numberOfLines={2}>
            {path}
          </Mono>
          {loaded && (
            <Mono style={{ fontSize: 12 }}>
              <Text style={{ color: C.green }}>+{loaded.add}</Text> <Text style={{ color: C.red }}>-{loaded.del}</Text>
            </Mono>
          )}
        </View>
        <Text style={[s.muted, { fontSize: 11, marginVertical: 6 }]}>
          {file ? `${idx + 1} sur ${list.length} fichier${list.length > 1 ? 's' : ''} ${staged ? 'indexé' : 'modifié'}${list.length > 1 ? 's' : ''}` : 'Fichier plus modifié'}
          {file?.untracked ? ' · non suivi' : ''} · Unifié
        </Text>
      </View>
      <ScrollView style={{ flex: 1 }}>
        {!file ? null : !loaded ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={C.muted} />
        ) : loaded.error ? (
          <Mono style={{ color: C.red, padding: 16, fontSize: 12 }}>{loaded.error}</Mono>
        ) : loaded.binary ? (
          <Text style={[s.muted, { padding: 16 }]}>Fichier binaire.</Text>
        ) : !loaded.lines.length ? (
          <Text style={[s.muted, { padding: 16 }]}>Aucune différence de contenu (changement de mode ou fichier vide).</Text>
        ) : (
          <ScrollView horizontal>
            <View>
              {loaded.lines.map((l, i) => {
                if (l.k === '@')
                  return (
                    <Mono key={i} style={{ fontSize: 11, color: C.accent, backgroundColor: C.accentBg, padding: 8 }}>
                      {l.t}
                    </Mono>
                  );
                const bg = l.k === '+' ? C.greenBg : l.k === '-' ? C.redBg : 'transparent';
                const col = l.k === '+' ? C.green : l.k === '-' ? C.red : C.text;
                return (
                  <View key={i} style={[s.row, { backgroundColor: bg, paddingVertical: 2, paddingRight: 16 }]}>
                    <Mono style={{ width: 36, textAlign: 'right', color: C.dim, fontSize: 11 }}>{l.o ?? ''}</Mono>
                    <Mono style={{ width: 36, textAlign: 'right', color: C.dim, fontSize: 11 }}>{l.n ?? ''}</Mono>
                    <Mono style={{ width: 18, textAlign: 'center', color: col, fontSize: 11 }}>{l.k ?? ''}</Mono>
                    <Mono style={{ color: col, fontSize: 11 }}>{l.t}</Mono>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </ScrollView>
      <View style={[s.row, { gap: 8, padding: 16 }]}>
        {file && <Button title="Annuler les modifs" variant="outlineDanger" style={{ flex: 1 }} onPress={discard} />}
        {next && <Button title="Fichier suivant →" variant="ghost" style={{ flex: 1 }} onPress={() => router.setParams({ path: next.path })} />}
      </View>
    </SafeAreaView>
  );
}
