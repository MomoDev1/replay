import { router } from 'expo-router';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SnippetRow } from '@/components/snippet-row';
import { Card, s, Segmented } from '@/components/ui';
import type { Snippet } from '@/lib/types';
import { useSession } from '@/store/session';
import { useSnippets } from '@/store/snippets';
import { C } from '@/theme';

export default function Snippets() {
  const session = useSession();
  const server = session?.server;
  const { snippets, toggleFav, remove } = useSnippets();
  const [scope, setScope] = useState<'server' | 'global'>(server ? 'server' : 'global');
  const mine = snippets.filter((sn) => server && sn.serverId === server.id);
  const globals = snippets.filter((sn) => sn.serverId === null);
  const data = scope === 'server' ? mine : globals;

  function actions(sn: Snippet) {
    Alert.alert(sn.title, undefined, [
      { text: 'Modifier', onPress: () => router.push({ pathname: '/snippet/edit', params: { id: sn.id } }) },
      { text: sn.fav ? 'Retirer des favoris' : 'Ajouter aux favoris', onPress: () => toggleFav(sn.id) },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Supprimer ce snippet ?', sn.title, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Supprimer', style: 'destructive', onPress: () => remove(sn.id) },
          ]),
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  const options = [
    ...(server ? [{ value: 'server' as const, label: `${server.name} · ${mine.length}` }] : []),
    { value: 'global' as const, label: `Globaux · ${globals.length}` },
  ];

  return (
    <SafeAreaView style={s.screen}>
      <View style={{ paddingHorizontal: 16 }}>
        <Pressable onPress={() => router.back()} style={[s.row, { gap: 2 }]}>
          <ChevronLeft size={16} color={C.accent} />
          <Text style={{ color: C.accent }}>Terminal</Text>
        </Pressable>
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 4 }]}>
          <Text style={s.h1}>Snippets</Text>
          <Pressable
            onPress={() => router.push({ pathname: '/snippet/edit', params: { scope } })}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={20} color="#fff" />
          </Pressable>
        </View>
        <View style={{ marginTop: 12 }}>
          <Segmented options={options} value={scope} onChange={setScope} />
        </View>
      </View>
      <FlatList
        data={data}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListEmptyComponent={<Text style={[s.muted, { textAlign: 'center', marginTop: 24 }]}>{scope === 'server' ? 'Aucun snippet propre à ce serveur.' : 'Aucun snippet global.'}</Text>}
        ListFooterComponent={data.length ? <Text style={{ color: C.dim, fontSize: 11, textAlign: 'center' }}>Appui long pour modifier ou supprimer</Text> : undefined}
        renderItem={({ item }) => (
          <Pressable onLongPress={() => actions(item)}>
            <Card>
              <SnippetRow sn={item} />
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
