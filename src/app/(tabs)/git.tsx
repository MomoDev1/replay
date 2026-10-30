import { router } from 'expo-router';
import { ArrowDown, GitBranch, RefreshCw, RotateCcw, Undo2 } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Mono, s, SectionLabel } from '@/components/ui';
import { commits, gitChanges } from '@/data/mock';
import { C } from '@/theme';

function Action({ icon, label, primary, onPress }: { icon: ReactNode; label: string; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 12, backgroundColor: primary ? C.accent : C.surface2 }}>
      {icon}
      <Text style={{ color: primary ? '#fff' : C.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export default function GitScreen() {
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.h1}>Git</Text>
        <Card style={[s.row, { gap: 10, marginTop: 12, padding: 12 }]}>
          <View style={{ backgroundColor: C.surface2, borderRadius: 6, padding: 6 }}>
            <Mono style={{ fontSize: 11 }}>api</Mono>
          </View>
          <View style={{ flex: 1 }}>
            <Mono style={{ fontWeight: '700' }}>relay/api</Mono>
            <Mono style={{ fontSize: 11, color: C.muted }}>/var/www/api · api-prod-01</Mono>
          </View>
          <Text style={{ color: C.accent, fontWeight: '600' }}>Changer</Text>
        </Card>

        <View style={[s.row, { gap: 8, marginTop: 16 }]}>
          <Mono style={{ fontSize: 22, fontWeight: '700' }}>main</Mono>
          <Mono style={{ color: C.muted, fontSize: 12 }}>→ origin/main</Mono>
        </View>
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          <Text style={{ color: C.orange }}>↓ 2 commits en retard</Text> · fetch il y a 4 min
        </Text>

        <View style={[s.row, { gap: 8, marginTop: 14 }]}>
          <Action primary icon={<ArrowDown size={18} color="#fff" />} label="Pull" onPress={() => router.push('/git/pull')} />
          <Action icon={<RefreshCw size={18} color={C.text} />} label="Fetch" onPress={() => {}} />
          <Action icon={<GitBranch size={18} color={C.text} />} label="Branche" onPress={() => router.push('/git/branch')} />
          <Action icon={<Undo2 size={18} color={C.text} />} label="Revenir" onPress={() => router.push('/git/revert')} />
        </View>

        <SectionLabel right={<Text style={{ color: C.muted, fontSize: 12 }}>Tout annuler</Text>}>{`Modifications · ${gitChanges.length}`}</SectionLabel>
        <Card style={{ padding: 0 }}>
          {gitChanges.map((f, i) => (
            <Pressable key={f.path} onPress={() => f.add !== undefined && router.push('/git/diff')} style={[s.row, { gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
              <View style={{ width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: f.s === 'M' ? C.orangeBg : C.surface2 }}>
                <Mono style={{ fontSize: 11, color: f.s === 'M' ? C.orange : C.muted }}>{f.s}</Mono>
              </View>
              <Mono style={{ flex: 1, fontSize: 12 }}>{f.path}</Mono>
              {f.add !== undefined && (
                <Mono style={{ fontSize: 11 }}>
                  <Text style={{ color: C.green }}>+{f.add}</Text> <Text style={{ color: C.red }}>-{f.del}</Text>
                </Mono>
              )}
            </Pressable>
          ))}
        </Card>

        <SectionLabel>Derniers commits</SectionLabel>
        <Card style={{ padding: 0 }}>
          {commits.map((c, i) => (
            <View key={c.sha} style={[s.row, { padding: 12, gap: 10, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={[s.row, { gap: 6 }]}>
                  <Mono style={{ color: C.orange, fontSize: 12 }}>{c.sha}</Mono>
                  {c.head && (
                    <View style={{ backgroundColor: C.accentBg, borderRadius: 4, paddingHorizontal: 4 }}>
                      <Text style={{ color: C.accent, fontSize: 9, fontWeight: '700' }}>HEAD</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: C.text, fontSize: 13 }}>{c.msg}</Text>
                <Text style={{ color: C.dim, fontSize: 11 }}>{c.author}</Text>
              </View>
              <Pressable onPress={() => router.push('/git/revert')} style={{ backgroundColor: C.surface2, borderRadius: 8, padding: 8 }}>
                <RotateCcw size={14} color={C.muted} />
              </Pressable>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
