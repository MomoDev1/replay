import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Mono, s } from '@/components/ui';
import { diff } from '@/data/mock';
import { C } from '@/theme';

export default function Diff() {
  return (
    <SafeAreaView style={s.screen}>
      <View style={{ paddingHorizontal: 16 }}>
        <Pressable onPress={() => router.back()} style={[s.row, { gap: 2 }]}>
          <ChevronLeft size={16} color={C.accent} />
          <Text style={{ color: C.accent }}>Git</Text>
        </Pressable>
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 6 }]}>
          <Mono style={{ fontWeight: '700', fontSize: 16 }}>src/config/cache.ts</Mono>
          <Mono style={{ fontSize: 12 }}>
            <Text style={{ color: C.green }}>+3</Text> <Text style={{ color: C.red }}>-1</Text>
          </Mono>
        </View>
        <Text style={[s.muted, { fontSize: 11, marginVertical: 6 }]}>1 sur 3 fichiers modifiés · Unifié</Text>
      </View>
      <ScrollView style={{ flex: 1 }}>
        <ScrollView horizontal>
          <View>
            <Mono style={{ fontSize: 11, color: C.accent, backgroundColor: C.accentBg, padding: 8 }}>@@ -12,8 +12,10 @@ export const cache</Mono>
            {diff.map((l, i) => {
              const bg = l.k === '+' ? C.greenBg : l.k === '-' ? C.redBg : 'transparent';
              const col = l.k === '+' ? C.green : l.k === '-' ? C.red : C.text;
              return (
                <View key={i} style={[s.row, { backgroundColor: bg, paddingVertical: 2, paddingRight: 16 }]}>
                  <Mono style={{ width: 30, textAlign: 'right', color: C.dim, fontSize: 11 }}>{l.o ?? ''}</Mono>
                  <Mono style={{ width: 30, textAlign: 'right', color: C.dim, fontSize: 11 }}>{l.n ?? ''}</Mono>
                  <Mono style={{ width: 18, textAlign: 'center', color: col, fontSize: 11 }}>{l.k ?? ''}</Mono>
                  <Mono style={{ color: col, fontSize: 11 }}>{l.t}</Mono>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>
      <View style={[s.row, { gap: 8, padding: 16 }]}>
        <Button title="Annuler les modifs" variant="outlineDanger" style={{ flex: 1 }} onPress={() => router.back()} />
        <Button title="Fichier suivant →" variant="ghost" style={{ flex: 1 }} />
      </View>
    </SafeAreaView>
  );
}
