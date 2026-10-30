import * as LocalAuthentication from 'expo-local-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import { Play, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button, EnvBadge, Mono, s, SheetHeader } from '@/components/ui';
import { snippets } from '@/data/mock';
import { C } from '@/theme';

const choices: Record<string, string[]> = {
  service: ['api', 'worker', 'nginx', 'redis'],
  lignes: ['50', '200', '1000'],
  db: ['0', '1', '2'],
};

export default function RunSnippet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sn = snippets.find((x) => x.id === id) ?? snippets[0];
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(sn.vars.map((v) => [v, choices[v]?.[0] ?? ''])));

  const resolved = sn.cmd.replace(/\{(\w+)\}/g, (_, v) => vals[v] || v);

  async function exec() {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: `Exécuter sur api-prod-01` });
    if (res.success || res.error === 'not_available' || res.error === 'not_enrolled') router.back();
  }

  return (
    <View style={s.sheet}>
      <SheetHeader
        title={sn.title}
        subtitle={
          <View style={[s.row, { gap: 6, marginTop: 2 }]}>
            <Text style={s.muted}>api-prod-01</Text>
            <EnvBadge env="prod" />
          </View>
        }
      />
      <View style={{ backgroundColor: C.bg, borderRadius: 10, padding: 12 }}>
        <Mono style={{ fontSize: 12 }}>$ {resolved}</Mono>
      </View>
      {sn.vars.map((v) => (
        <View key={v} style={{ marginTop: 14 }}>
          <Text style={[s.section, { marginBottom: 8 }]}>{v}</Text>
          {choices[v] ? (
            <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
              {choices[v].map((c) => {
                const on = vals[v] === c;
                return (
                  <Pressable key={c} onPress={() => setVals((p) => ({ ...p, [v]: c }))} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: on ? C.accent : C.border, backgroundColor: on ? C.accentBg : C.surface2 }}>
                    <Mono style={{ fontSize: 12, color: on ? C.accent : C.text }}>{c}</Mono>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <TextInput value={vals[v]} onChangeText={(t) => setVals((p) => ({ ...p, [v]: t }))} autoCapitalize="none" style={{ backgroundColor: C.surface2, color: C.text, borderRadius: 8, padding: 10 }} />
          )}
        </View>
      ))}
      <View style={[s.row, { gap: 8, backgroundColor: C.orangeBg, borderRadius: 10, padding: 10, marginTop: 16 }]}>
        <TriangleAlert size={14} color={C.orange} />
        <Text style={{ color: C.text, fontSize: 12, flex: 1 }}>Serveur de production : environ 3 s d’indisponibilité. Face ID sera demandé.</Text>
      </View>
      <Button title="Exécuter" icon={<Play size={14} color="#fff" fill="#fff" />} style={{ marginTop: 16 }} onPress={exec} />
    </View>
  );
}
