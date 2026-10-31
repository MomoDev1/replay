import { router } from 'expo-router';
import { Search, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { PlayButton, plainCmd, runSnippet } from '@/components/snippet-row';
import { Mono, s, Segmented, SheetHeader } from '@/components/ui';
import { pasteText, useSession } from '@/store/session';
import { getHistory, pushHistory, useServerSnippets } from '@/store/snippets';
import { C } from '@/theme';

export default function QuickCommands() {
  const session = useSession();
  const [tab, setTab] = useState<'fav' | 'hist'>('fav');
  const [q, setQ] = useState('');
  const [history] = useState(getHistory);
  const match = (text: string) => text.toLowerCase().includes(q.toLowerCase());
  const favs = useServerSnippets(session?.server.id).filter((sn) => sn.fav && match(sn.title + sn.cmd));
  const hist = history.filter(match);

  /** Pastes the command at the prompt; it only runs when the user presses Enter in the terminal. */
  function paste(cmd: string) {
    if (!pasteText(cmd)) return;
    pushHistory(cmd);
    router.back();
  }

  return (
    <View style={s.sheet}>
      <SheetHeader title="Commandes rapides" />
      <View style={[s.row, { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8, marginBottom: 12 }]}>
        <Search size={14} color={C.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Filtrer…" placeholderTextColor={C.dim} style={{ flex: 1, color: C.text, paddingVertical: 9 }} />
      </View>
      <Segmented options={[{ value: 'fav', label: '★ Favoris' }, { value: 'hist', label: 'Historique' }]} value={tab} onChange={setTab} />
      <ScrollView contentContainerStyle={{ paddingVertical: 12, gap: 14 }}>
        {tab === 'fav' &&
          favs.map((sn) => (
            <View key={sn.id} style={[s.row, { gap: 10 }]}>
              <Star size={14} color={C.orange} fill={C.orange} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>{sn.title}</Text>
                <Mono style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>
                  {plainCmd(sn.cmd)}
                </Mono>
              </View>
              <PlayButton size={32} onPress={() => runSnippet(sn)} />
            </View>
          ))}
        {tab === 'hist' &&
          hist.map((h) => (
            <Pressable key={h} onPress={() => paste(h)} disabled={!session?.open}>
              <Mono style={{ fontSize: 12, color: session?.open ? C.text : C.dim }} numberOfLines={1}>
                $ {h}
              </Mono>
            </Pressable>
          ))}
        {((tab === 'fav' && !favs.length) || (tab === 'hist' && !hist.length)) && (
          <Text style={[s.muted, { textAlign: 'center' }]}>
            {q ? 'Aucun résultat.' : tab === 'fav' ? 'Aucun favori. Ajoute une étoile à un snippet.' : 'Aucune commande collée depuis un snippet.'}
          </Text>
        )}
        <Pressable onPress={() => router.replace('/snippets')} style={{ alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: C.accent, fontWeight: '600' }}>Gérer les snippets →</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
