import { router, useLocalSearchParams } from 'expo-router';
import { ClipboardPaste, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { asciiPunct, parseVars, resolveCmd } from '@/components/snippet-row';
import { Button, EnvBadge, Mono, s, Sheet, SheetHeader } from '@/components/ui';
import { useSheetKeyboardInset } from '@/hooks/use-sheet-keyboard';
import type { Snippet } from '@/lib/types';
import { pasteText, useSession } from '@/store/session';
import { pushHistory, useSnippets } from '@/store/snippets';
import { C } from '@/theme';

export default function RunSnippet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sn = useSnippets().snippets.find((x) => x.id === id);

  if (!sn) {
    return (
      <Sheet>
        <SheetHeader title="Snippet introuvable" />
      </Sheet>
    );
  }

  // Keyed so the form state is initialised from the snippet once it is actually loaded.
  return <RunForm key={sn.id} sn={sn} />;
}

function RunForm({ sn }: { sn: Snippet }) {
  const { markUsed } = useSnippets();
  const session = useSession();
  const kb = useSheetKeyboardInset();
  const vars = parseVars(sn.cmd);
  // A remembered value is dropped if the snippet's choices were edited since.
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      vars.map((v) => {
        const last = sn.lastVars[v.name];
        return [v.name, last !== undefined && (!v.choices.length || v.choices.includes(last)) ? last : (v.choices[0] ?? '')];
      }),
    ),
  );

  const server = session?.server;
  const open = !!session?.open;
  const prod = server?.env === 'prod';
  const resolved = asciiPunct(resolveCmd(sn.cmd, vals));
  const missing = vars.filter((v) => !vals[v.name]?.trim()).map((v) => v.name);

  // Never executes: the command is typed at the prompt and the user presses Enter in the terminal.
  async function paste() {
    if (missing.length || !pasteText(resolved)) return;
    pushHistory(resolved);
    router.dismissTo('/terminal');
    await markUsed(sn.id, vals);
  }

  const footer = (
    <>
      {!open ? (
        <View style={[s.row, { gap: 8, backgroundColor: C.surface2, borderRadius: 10, padding: 10, marginTop: 16 }]}>
          <Text style={{ color: C.muted, fontSize: 12, flex: 1 }}>Aucune session ouverte : connecte-toi à un serveur pour coller ce snippet dans le terminal.</Text>
        </View>
      ) : (
        prod && (
          <View style={[s.row, { gap: 8, backgroundColor: C.orangeBg, borderRadius: 10, padding: 10, marginTop: 16 }]}>
            <TriangleAlert size={14} color={C.orange} />
            <Text style={{ color: C.text, fontSize: 12, flex: 1 }}>Serveur de production : relis la commande avant d’appuyer sur Entrée (ou ↵).</Text>
          </View>
        )
      )}
      {open ? (
        <>
          <Button title="Coller dans le terminal" icon={<ClipboardPaste size={14} color="#fff" />} style={{ marginTop: 16, opacity: missing.length ? 0.5 : 1 }} onPress={paste} />
          <Text style={{ color: C.dim, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
            {missing.length ? `À renseigner : ${missing.join(', ')}` : 'La commande n’est pas exécutée : appuie sur Entrée (ou ↵) dans le terminal.'}
          </Text>
        </>
      ) : (
        <Button title={server ? 'Se reconnecter' : 'Choisir un serveur'} style={{ marginTop: 16 }} onPress={() => (server ? router.replace(`/connect/${server.id}`) : router.dismissTo('/'))} />
      )}
    </>
  );

  return (
    // Android: the keyboard height pads the scroll so the footer can be scrolled above the keyboard.
    <Sheet contentContainerStyle={{ paddingBottom: 40 + kb }}>
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
            <TextInput
              value={vals[v.name]}
              onChangeText={(t) => setVals((p) => ({ ...p, [v.name]: t }))}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              returnKeyType="done"
              style={{ backgroundColor: C.surface2, color: C.text, borderRadius: 8, padding: 10 }}
            />
          )}
        </View>
      ))}
      {footer}
    </Sheet>
  );
}
