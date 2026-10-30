import { router } from 'expo-router';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SnippetRow } from '@/components/snippet-row';
import { Card, s, Segmented } from '@/components/ui';
import { snippets } from '@/data/mock';
import { C } from '@/theme';

export default function Snippets() {
  const [scope, setScope] = useState<'server' | 'global'>('server');
  const data = scope === 'server' ? snippets : snippets.filter((sn) => sn.vars.length === 0);

  return (
    <SafeAreaView style={s.screen}>
      <View style={{ paddingHorizontal: 16 }}>
        <Pressable onPress={() => router.back()} style={[s.row, { gap: 2 }]}>
          <ChevronLeft size={16} color={C.accent} />
          <Text style={{ color: C.accent }}>Terminal</Text>
        </Pressable>
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 4 }]}>
          <Text style={s.h1}>Snippets</Text>
          <Pressable style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={20} color="#fff" />
          </Pressable>
        </View>
        <View style={{ marginTop: 12 }}>
          <Segmented options={[{ value: 'server', label: `api-prod-01 · ${snippets.length}` }, { value: 'global', label: 'Globaux · 5' }]} value={scope} onChange={setScope} />
        </View>
      </View>
      <FlatList data={data} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 16, gap: 10 }} renderItem={({ item }) => <Card><SnippetRow sn={item} /></Card>} />
    </SafeAreaView>
  );
}
