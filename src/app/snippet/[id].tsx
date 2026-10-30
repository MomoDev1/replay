import { router, useLocalSearchParams } from 'expo-router';
import { Play, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { parseVars, resolveCmd } from '@/components/snippet-row';
import { Button, EnvBadge, Mono, s, SheetHeader } from '@/components/ui';
import { confirmBiometric } from '@/lib/auth';
import { sendText, useSession } from '@/store/session';
import { pushHistory, useSnippets } from '@/store/snippets';
import { C } from '@/theme';

export default function RunSnippet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snippets, markUsed } = useSnippets();
  const session = useSession();
  const sn = snippets.find((x) => x.id === id);
  const vars = sn ? parseVars(sn.cmd) : [];
  // A remembered value is dropped if the snippet's choices were edited since.
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      vars.map((v) => {
        const last = sn?.lastVars[v.name];
        return [v.name, last !== undefined && (!v.choices.length || v.choices.includes(last)) ? last : (v.choices[0] ?? '')];
      }),
    ),
  );

  if (!sn) {
    return (
      <View style={s.sheet}>
        <SheetHeader title="Snippet introuvable" />
      </View>
    );
  }

  const server = session?.server;
  const open = !!session?.open;
  const prod = server?.env === 'prod';
  const resolved = resolveCmd(sn.cmd, vals);
  const missing = vars.some((v) => !vals[v.name]);

  async function exec() {
    if (!sn || !server || !open || missing) return;
    if (prod && !(await confirmBiometric(`Exécuter sur ${server.name}`))) return;
    sendText(resolved + '\r');
    pushHistory(resolved);
    await markUsed(sn.id, vals);
    router.dismissTo('/terminal');
  }

  return (
    <View style={s.sheet}>
      <SheetHeader
        title={sn.title}
        subtitle={
          server && (
            <View style={[s.row, { gap: 6, marginTop: 2 }]}>
              <Text style={s.muted}>{server.name}</Text>
              <EnvBadge env={server.env} />
            </View>
          )
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: C.bg, borderRadius: 10, padding: 12 }}>
          <Mono style={{ fontSize: 12 }} selectable>
            $ {resolved}
          </Mono>
        </View>
        {vars.map((v) => (
          <View key={v.name} style={{ marginTop: 14 }}>
            <Text style={[s.section, { marginBottom: 8 }]}>{v.name}</Text>
            {v.choices.length ? (
              <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
                {v.choices.map((c) => {
                  const on = vals[v.name] === c;
                  return (
                    <Pressable key={c} onPress={() => setVals((p) => ({ ...p, [v.name]: c }))} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: on ? C.accent : C.border, backgroundColor: on ? C.accentBg : C.surface2 }}>
                      <Mono style={{ fontSize: 12, color: on ? C.accent : C.text }}>{c}</Mono>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <TextInput value={vals[v.name]} onChangeText={(t) => setVals((p) => ({ ...p, [v.name]: t }))} autoCapitalize="none" autoCorrect={false} style={{ backgroundColor: C.surface2, color: C.text, borderRadius: 8, padding: 10 }} />
            )}
          </View>
        ))}
      </ScrollView>
      {!open ? (
        <View style={[s.row, { gap: 8, backgroundColor: C.surface2, borderRadius: 10, padding: 10, marginTop: 16 }]}>
          <Text style={{ color: C.muted, fontSize: 12, flex: 1 }}>Aucune session ouverte : connecte-toi à un serveur pour exécuter ce snippet.</Text>
        </View>
      ) : (
        prod && (
          <View style={[s.row, { gap: 8, backgroundColor: C.orangeBg, borderRadius: 10, padding: 10, marginTop: 16 }]}>
            <TriangleAlert size={14} color={C.orange} />
            <Text style={{ color: C.text, fontSize: 12, flex: 1 }}>Serveur de production : Face ID sera demandé avant l’exécution.</Text>
          </View>
        )
      )}
      {open ? (
        <Button title="Exécuter dans le terminal" icon={<Play size={14} color="#fff" fill="#fff" />} style={{ marginTop: 16, opacity: missing ? 0.5 : 1 }} onPress={exec} />
      ) : (
        <Button title={server ? 'Se reconnecter' : 'Choisir un serveur'} style={{ marginTop: 16 }} onPress={() => (server ? router.replace(`/connect/${server.id}`) : router.dismissTo('/'))} />
      )}
    </View>
  );
}
