import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DiffView } from '@/components/DiffView';
import { Button, Card, Mono, s } from '@/components/ui';
import { parseDiff } from '@/lib/git';
import { loadPrExtra, usePr } from '@/store/pr';
import { C } from '@/theme';

export default function PrFile() {
  const { path } = useLocalSearchParams<{ path: string }>();
  const st = usePr();
  const files = st?.files ?? null;

  useEffect(() => {
    if (st && !files) loadPrExtra('files');
  }, [st, files]);

  const idx = files?.findIndex((f) => f.path === path) ?? -1;
  const file = files?.[idx];
  const parsed = file?.patch ? parseDiff(file.patch) : null;
  const comments = (st?.comments ?? []).filter((c) => c.path === path && !c.parentId);
  const next = files && files.length > 1 ? files[(idx + 1) % files.length] : null;

  return (
    <SafeAreaView style={s.screen}>
      <View style={{ paddingHorizontal: 16 }}>
        <Pressable onPress={() => router.back()} style={[s.row, { gap: 2 }]}>
          <ChevronLeft size={16} color={C.accent} />
          <Text style={{ color: C.accent }}>{st ? `#${st.id}` : 'Retour'}</Text>
        </Pressable>
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 6, gap: 8 }]}>
          <Mono style={{ fontWeight: '700', fontSize: 16, flex: 1 }} numberOfLines={2}>
            {path}
          </Mono>
          {file && (
            <Mono style={{ fontSize: 12 }}>
              <Text style={{ color: C.green }}>+{file.add}</Text> <Text style={{ color: C.red }}>-{file.del}</Text>
            </Mono>
          )}
        </View>
        <Text style={[s.muted, { fontSize: 11, marginVertical: 6 }]}>
          {file ? `${idx + 1} sur ${files!.length} fichier${files!.length > 1 ? 's' : ''}` : ''}
          {file?.oldPath ? ` · renommé depuis ${file.oldPath}` : ''}
        </Text>
      </View>
      <ScrollView style={{ flex: 1 }}>
        {!files ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={C.muted} />
        ) : !file ? (
          <Text style={[s.muted, { padding: 16 }]}>Fichier absent de la pull request.</Text>
        ) : !parsed ? (
          <Text style={[s.muted, { padding: 16 }]}>Diff indisponible (fichier binaire ou trop volumineux).</Text>
        ) : !parsed.lines.length ? (
          <Text style={[s.muted, { padding: 16 }]}>Aucune différence de contenu.</Text>
        ) : (
          <DiffView lines={parsed.lines} />
        )}
        {comments.length > 0 && (
          <View style={{ padding: 16, gap: 8 }}>
            <Text style={s.section}>COMMENTAIRES SUR CE FICHIER</Text>
            {comments.map((c) => (
              <Card key={c.id}>
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 12 }}>
                  {c.author}
                  {c.line ? <Text style={{ color: C.dim, fontWeight: '400' }}>{`  · ligne ${c.line}`}</Text> : null}
                </Text>
                <Text selectable style={{ color: C.text, marginTop: 4 }}>
                  {c.body}
                </Text>
              </Card>
            ))}
            <Text style={[s.muted, { fontSize: 11 }]}>Réponds depuis l’onglet Discussion de la PR.</Text>
          </View>
        )}
      </ScrollView>
      {next && (
        <View style={{ padding: 16 }}>
          <Button title="Fichier suivant →" variant="ghost" onPress={() => router.setParams({ path: next.path })} />
        </View>
      )}
    </SafeAreaView>
  );
}
