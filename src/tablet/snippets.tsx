import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';

import { asciiPunct, parseVars, resolveCmd, snippetMeta } from '@/components/snippet-row';
import type { Snippet } from '@/lib/types';
import { pasteText, useSession } from '@/store/session';
import { pushHistory, useSnippets } from '@/store/snippets';
import { alpha, monoF, T } from '@/tablet/theme';
import { Btn, Empty, EnvTag, Grid, Label, PlayButton, PlusButton, Seg, st, TabletScreen, Tx } from '@/tablet/ui';

// Same grammar as snippet-row: `{name}` / `{name:a|b}`, `${HOME}` left alone.
const VAR_SPLIT = /(\$?\{\w+(?::[^}]*)?\})/;

/** Command with its variables as highlighted chips; `vals` fills them in when given. */
function CmdChips({ cmd, vals, size = 12 }: { cmd: string; vals?: Record<string, string>; size?: number }) {
  return (
    <Tx mono style={{ fontSize: size, lineHeight: size * 1.7, color: T.text2 }}>
      {cmd.split(VAR_SPLIT).map((p, i) => {
        if (!(i % 2) || p[0] === '$') return p;
        const name = p.slice(1, -1).split(':')[0];
        return (
          <Tx key={i} mono style={{ fontSize: size, color: T.blue, backgroundColor: alpha(T.blue, 0.16) }}>
            {` ${vals?.[name] || name} `}
          </Tx>
        );
      })}
    </Tx>
  );
}

export function TabletSnippets() {
  const session = useSession();
  const server = session?.server;
  const { snippets, remove, markUsed } = useSnippets();
  const [scope, setScope] = useState<'server' | 'global'>(server ? 'server' : 'global');
  const mine = snippets.filter((sn) => server && sn.serverId === server.id);
  const globals = snippets.filter((sn) => sn.serverId === null);
  const list = scope === 'server' && server ? mine : globals;
  const [picked, setPicked] = useState<string | null>(null);
  const selected = list.find((sn) => sn.id === picked) ?? list[0];

  function actions(sn: Snippet) {
    Alert.alert(sn.title, undefined, [
      { text: 'Modifier', onPress: () => router.push({ pathname: '/snippet/edit', params: { id: sn.id } }) },
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

  const options = [...(server ? [{ value: 'server' as const, label: `${server.name} · ${mine.length}` }] : []), { value: 'global' as const, label: `Globaux · ${globals.length}` }];

  return (
    <TabletScreen>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 360, minWidth: 0 }}>
        <View style={[st.row, { gap: 12, flexWrap: 'wrap', paddingTop: 16, paddingHorizontal: 20, paddingBottom: 14 }]}>
          <Tx w={700} style={[st.h1, { flex: 1 }]}>
            Snippets
          </Tx>
          <Seg height={42} radius={12} fontSize={13.5} options={options} value={server ? scope : 'global'} onChange={setScope} />
          <PlusButton label="Nouveau snippet" onPress={() => router.push({ pathname: '/snippet/edit', params: { scope: server ? scope : 'global' } })} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          <Grid min={260} fill>
            {list.map((sn) => {
              const on = sn.id === selected?.id;
              return (
                <Pressable key={sn.id} onPress={() => setPicked(sn.id)} onLongPress={() => actions(sn)} style={{ borderRadius: 16, padding: 14, gap: 10, backgroundColor: on ? alpha(T.blue, 0.08) : T.card, borderWidth: 1.5, borderColor: on ? T.blue : T.cardLine }}>
                  <View style={[st.row, { gap: 10 }]}>
                    <Tx w={600} style={{ flex: 1, fontSize: 15 }} numberOfLines={2}>
                      {sn.fav ? '★ ' : ''}
                      {sn.title}
                    </Tx>
                    <PlayButton
                      onPress={() => {
                        setPicked(sn.id);
                        if (!parseVars(sn.cmd).length) paste(sn, {}, session?.open ?? false, markUsed);
                      }}
                    />
                  </View>
                  <CmdChips cmd={sn.cmd} />
                  <Tx style={{ fontSize: 12, color: T.dim }}>{snippetMeta(sn)}</Tx>
                </Pressable>
              );
            })}
          </Grid>
          {!list.length && <Tx style={{ fontSize: 14, color: T.dim, textAlign: 'center', marginTop: 40 }}>{scope === 'server' ? 'Aucun snippet propre à ce serveur. Touche + pour en créer un.' : 'Aucun snippet global.'}</Tx>}
        </ScrollView>
      </View>
      <View style={{ flexGrow: 0, flexShrink: 1, flexBasis: 340, minWidth: 280, borderLeftWidth: 1, borderColor: T.line, backgroundColor: T.panel }}>
        {selected ? <RunPanel key={selected.id} sn={selected} /> : <Empty title="Aucun snippet" text="Sélectionne un snippet pour renseigner ses variables." />}
      </View>
    </TabletScreen>
  );
}

/** Pastes the command at the prompt and switches to the terminal; the user runs it with Enter. */
async function paste(sn: Snippet, vals: Record<string, string>, open: boolean, markUsed?: (id: string, v: Record<string, string>) => Promise<void>) {
  if (!open) return;
  const cmd = asciiPunct(resolveCmd(sn.cmd, vals));
  if (!pasteText(cmd)) return;
  pushHistory(cmd);
  router.navigate('/terminal');
  await markUsed?.(sn.id, vals);
}

function RunPanel({ sn }: { sn: Snippet }) {
  const { markUsed, toggleFav } = useSnippets();
  const session = useSession();
  const server = session?.server;
  const open = !!session?.open;
  const vars = parseVars(sn.cmd);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      vars.map((v) => {
        const last = sn.lastVars[v.name];
        return [v.name, last !== undefined && (!v.choices.length || v.choices.includes(last)) ? last : (v.choices[0] ?? '')];
      }),
    ),
  );
  const missing = vars.filter((v) => !vals[v.name]?.trim()).map((v) => v.name);

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 18, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 6 }}>
        <View style={[st.row, { justifyContent: 'space-between' }]}>
          <Label>EXÉCUTER</Label>
          <View style={[st.row, { gap: 14 }]}>
            <Pressable onPress={() => toggleFav(sn.id)} hitSlop={8}>
              <Tx style={{ fontSize: 13, color: sn.fav ? T.orange : T.muted }}>{sn.fav ? '★ Favori' : '☆ Favori'}</Tx>
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/snippet/edit', params: { id: sn.id } })} hitSlop={8}>
              <Tx w={600} style={{ fontSize: 13, color: T.blue }}>
                Modifier
              </Tx>
            </Pressable>
          </View>
        </View>
        <Tx w={700} style={{ fontSize: 20 }}>
          {sn.title}
        </Tx>
      </View>
      <View style={{ backgroundColor: T.term, borderRadius: 12, padding: 12 }}>
        <Tx mono selectable style={{ fontSize: 13, lineHeight: 21, color: T.text2 }}>
          <Tx mono style={{ fontSize: 13, color: T.faint }}>
            ${' '}
          </Tx>
          <CmdChips cmd={sn.cmd} vals={vals} size={13} />
        </Tx>
      </View>
      {vars.map((v) => (
        <View key={v.name} style={{ gap: 8 }}>
          <Tx mono style={{ fontSize: 12, color: T.muted }}>
            {v.name}
          </Tx>
          {v.choices.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {v.choices.map((c) => {
                const on = vals[v.name] === c;
                return (
                  <Pressable key={c} onPress={() => setVals((p) => ({ ...p, [v.name]: c }))} style={{ height: 40, paddingHorizontal: 14, borderRadius: 11, justifyContent: 'center', borderWidth: 1, borderColor: on ? T.blue : T.chip, backgroundColor: on ? alpha(T.blue, 0.16) : 'transparent' }}>
                    <Tx mono style={{ fontSize: 13, color: on ? T.blue : T.text }}>
                      {c}
                    </Tx>
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
              style={[{ height: 46, borderRadius: 12, backgroundColor: T.bg, borderWidth: 1, borderColor: T.chip, paddingHorizontal: 14, fontSize: 15, color: T.text }, monoF(400)]}
            />
          )}
        </View>
      ))}
      <View style={{ gap: 8 }}>
        <Tx mono style={{ fontSize: 12, color: T.muted }}>
          cible
        </Tx>
        <View style={[st.row, { height: 46, borderRadius: 12, backgroundColor: T.bg, borderWidth: 1, borderColor: T.chip, gap: 8, paddingHorizontal: 14 }]}>
          {server ? (
            <>
              <Tx mono style={{ fontSize: 14, color: open ? T.text : T.muted }} numberOfLines={1}>
                {server.name}
              </Tx>
              <EnvTag env={server.env} />
              {!open && <Tx style={{ fontSize: 12, color: T.dim }}>· déconnecté</Tx>}
            </>
          ) : (
            <Tx style={{ fontSize: 14, color: T.dim }}>Aucune session ouverte</Tx>
          )}
        </View>
      </View>
      <View style={{ flex: 1 }} />
      {open ? (
        <View style={{ gap: 8 }}>
          <Btn title="Coller dans le terminal" height={56} radius={16} textStyle={{ fontSize: 16 }} disabled={missing.length > 0} onPress={() => paste(sn, vals, open, markUsed)} />
          <Tx style={{ fontSize: 12, color: server?.env === 'prod' ? T.orange : T.dim, textAlign: 'center' }}>
            {missing.length ? `À renseigner : ${missing.join(', ')}` : server?.env === 'prod' ? 'Production : relis la commande avant d’appuyer sur Entrée.' : 'La commande est collée au prompt : Entrée pour l’exécuter.'}
          </Tx>
        </View>
      ) : (
        <Btn title={server ? 'Se reconnecter' : 'Choisir un serveur'} height={56} radius={16} textStyle={{ fontSize: 16 }} onPress={() => (server ? router.push(`/connect/${server.id}`) : router.navigate('/'))} />
      )}
    </ScrollView>
  );
}
