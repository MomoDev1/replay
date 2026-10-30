import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, Mono, Radio, s, SheetHeader } from '@/components/ui';
import { branches } from '@/data/mock';
import { C } from '@/theme';

export default function BranchSheet() {
  const [sel, setSel] = useState('release/2.14');
  const [q, setQ] = useState('');
  const match = (b: { name: string }) => b.name.includes(q);

  const row = (b: { name: string; meta: string }) => (
    <Pressable key={b.name} onPress={() => setSel(b.name)} style={[s.row, { gap: 12, paddingVertical: 8 }]}>
      <Radio on={sel === b.name} />
      <View>
        <Mono style={{ fontSize: 13 }}>{b.name}</Mono>
        <Text style={{ color: C.dim, fontSize: 11 }}>{b.meta}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={s.sheet}>
      <SheetHeader title="Changer de branche" />
      <View style={[s.row, { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8 }]}>
        <Search size={14} color={C.muted} />
        <TextInput value={q} onChangeText={setQ} autoCapitalize="none" placeholder="Rechercher une branche…" placeholderTextColor={C.dim} style={{ flex: 1, color: C.text, paddingVertical: 9 }} />
      </View>
      <ScrollView style={{ flex: 1 }}>
        <Text style={[s.section, { marginTop: 16, marginBottom: 4 }]}>LOCALES</Text>
        {branches.local.filter(match).map(row)}
        <Text style={[s.section, { marginTop: 12, marginBottom: 4 }]}>DISTANTES · ORIGIN</Text>
        {branches.remote.filter(match).map(row)}
      </ScrollView>
      <Text style={{ color: C.orange, fontSize: 12, marginVertical: 10 }}>3 fichiers modifiés seront mis de côté (stash) avant le changement.</Text>
      <Button title={`Basculer sur ${sel}`} onPress={() => router.back()} />
    </View>
  );
}
