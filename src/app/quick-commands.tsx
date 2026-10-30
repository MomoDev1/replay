import { router } from 'expo-router';
import { Search, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { PlayButton, runSnippet } from '@/components/snippet-row';
import { Mono, s, Segmented, SheetHeader } from '@/components/ui';
import { snippets } from '@/data/mock';
import { C } from '@/theme';

const history = ['sudo systemctl status api', 'git log --oneline -3', 'df -h', 'tail -f storage/logs/app.log', 'docker compose ps'];

export default function QuickCommands() {
  const [tab, setTab] = useState<'fav' | 'hist'>('fav');
  const [q, setQ] = useState('');
  const favs = snippets.filter((sn) => sn.fav && (sn.title + sn.cmd).toLowerCase().includes(q.toLowerCase()));

  return (
    <View style={s.sheet}>
      <SheetHeader title="Commandes rapides" />
      <View style={[s.row, { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8, marginBottom: 12 }]}>
        <Search size={14} color={C.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Filtrer…" placeholderTextColor={C.dim} style={{ flex: 1, color: C.text, paddingVertical: 9 }} />
      </View>
      <Segmented options={[{ value: 'fav', label: '★ Favoris' }, { value: 'hist', label: 'Historique' }]} value={tab} onChange={setTab} />
      <ScrollView contentContainerStyle={{ paddingVertical: 12, gap: 14 }}>
        {tab === 'fav'
          ? favs.map((sn) => (
              <View key={sn.id} style={[s.row, { gap: 10 }]}>
                <Star size={14} color={C.orange} fill={C.orange} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>{sn.title}</Text>
                  <Mono style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>
                    {sn.cmd.replace(/\{(\w+)\}/g, '$1')}
                  </Mono>
                </View>
                <PlayButton size={32} onPress={() => runSnippet(sn)} />
              </View>
            ))
          : history.map((h) => (
              <Pressable key={h} onPress={() => router.back()}>
                <Mono style={{ fontSize: 12 }}>$ {h}</Mono>
              </Pressable>
            ))}
        <Pressable onPress={() => router.replace('/snippets')} style={{ alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: C.accent, fontWeight: '600' }}>Gérer les snippets →</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
