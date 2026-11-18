import { router } from 'expo-router';
import { ClipboardPaste, Search, TextSelect } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { parseVars, plainCmd, resolveCmd, runSnippet } from '@/components/snippet-row';
import type { Snippet } from '@/lib/types';
import { closeSession, pasteText, type Session } from '@/store/session';
import { getHistory, pushHistory, useServerSnippets, useSnippets } from '@/store/snippets';
import { T } from '@/tablet/theme';
import { Btn, card, Dot, Empty, EnvTag, Label, PlayButton, Seg, st, TabletScreen, Tx } from '@/tablet/ui';

/** Keys of the bar under the terminal (TL03), with the sequence they send. */
const KEYS: [string, string][] = [
  ['Ctrl', ''],
  ['Alt', ''],
  ['Esc', '\x1b'],
  ['Tab', '\t'],
  ['←', '\x1b[D'],
  ['↑', '\x1b[A'],
  ['↓', '\x1b[B'],
  ['→', '\x1b[C'],
  ['|', '|'],
  ['~', '~'],
  ['/', '/'],
  ['-', '-'],
  ['Home', '\x1b[H'],
  ['End', '\x1b[F'],
  // Runs a pasted command without the software keyboard (iOS cannot raise it programmatically).
  ['↵', '\r'],
  ['^C', '\x03'],
];

function Key({ children, on, onPress, disabled, label }: { children: ReactNode; on?: boolean; onPress: () => void; disabled?: boolean; label: string }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} style={({ pressed }) => ({ minWidth: 46, height: 44, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? T.blue : pressed ? T.segOn : T.chip, opacity: disabled ? 0.4 : 1 })}>
      {children}
    </Pressable>
  );
}

export function TabletKeyBar({ open, ctrl, alt, copied, onKey, onSearch, onSelect, onPaste }: { open: boolean; ctrl: boolean; alt: boolean; copied: boolean; onKey: (label: string, seq: string) => void; onSearch: () => void; onSelect: () => void; onPaste: () => void }) {
  return (
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, backgroundColor: T.panel, borderTopWidth: 1, borderColor: T.line }} contentContainerStyle={{ gap: 6, paddingVertical: 8, paddingHorizontal: 12 }}>
      {KEYS.map(([k, seq]) => {
        const on = (k === 'Ctrl' && ctrl) || (k === 'Alt' && alt);
        return (
          <Key key={k} label={k} on={on} disabled={!open} onPress={() => onKey(k, seq)}>
            <Tx mono style={{ fontSize: 14, color: on ? T.ink : k === '^C' ? T.red : T.text }}>
              {k}
            </Tx>
          </Key>
        );
      })}
      <View style={{ width: 1, backgroundColor: T.line, marginHorizontal: 2 }} />
      <Key label="Rechercher" onPress={onSearch}>
        <Search size={17} color={T.text} />
      </Key>
      <Key label="Sélectionner du texte" onPress={onSelect}>
        <TextSelect size={17} color={copied ? T.green : T.text} />
      </Key>
      <Key label="Coller" disabled={!open} onPress={onPaste}>
        <ClipboardPaste size={17} color={T.text} />
      </Key>
    </ScrollView>
  );
}

/** Rail-side layout of the terminal: session tab bar + terminal on the left, favourites panel on the right. */
export function TabletTerminalShell({ session, children }: { session: Session | null; children?: ReactNode }) {
  const server = session?.server;
  return (
    <TabletScreen>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 400, minWidth: 0 }}>
        <View style={[st.row, { height: 56, gap: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: T.line }]}>
          {server && (
            <View style={[st.row, { height: 38, paddingLeft: 14, paddingRight: 8, borderRadius: 10, gap: 8, backgroundColor: T.field }]}>
              <Dot color={session.open ? T.green : T.faint} size={7} />
              <Tx mono style={{ fontSize: 13 }} numberOfLines={1}>
                {server.name}
              </Tx>
              <EnvTag env={server.env} size="sm" short />
              {session.open && (
                <Pressable onPress={() => closeSession()} hitSlop={8} accessibilityLabel="Fermer la session" style={{ width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}>
                  <Tx style={{ fontSize: 16, lineHeight: 18, color: T.dim }}>×</Tx>
                </Pressable>
              )}
            </View>
          )}
          <Pressable onPress={() => router.navigate('/')} accessibilityLabel="Ouvrir une autre session" style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? T.field : 'transparent' })}>
            <Tx style={{ fontSize: 20, color: T.dim }}>+</Tx>
          </Pressable>
          <View style={{ flex: 1 }} />
          {session?.open && <Tx style={{ fontSize: 12, color: T.green }}>● {session.latencyMs} ms</Tx>}
          {session && !session.open && (
            <>
              <Tx style={{ fontSize: 12, color: T.muted, flexShrink: 1 }} numberOfLines={1}>
                {session.closedReason ?? 'Déconnecté'}
              </Tx>
              <Btn title="Reconnecter" height={34} radius={10} onPress={() => router.push(`/connect/${session.server.id}`)} />
            </>
          )}
        </View>
        {session ? (
          <View style={{ flex: 1, backgroundColor: T.term }}>{children}</View>
        ) : (
          <Empty title="Aucune session" text="Connecte-toi à un serveur pour ouvrir un terminal." action={<Btn title="Choisir un serveur" style={{ marginTop: 8 }} onPress={() => router.navigate('/')} />} />
        )}
      </View>
      <SidePanel session={session} />
    </TabletScreen>
  );
}

function SidePanel({ session }: { session: Session | null }) {
  const { markUsed } = useSnippets();
  const open = !!session?.open;
  const favs = useServerSnippets(session?.server.id).filter((sn) => sn.fav);
  const [tab, setTab] = useState<'fav' | 'hist'>('fav');
  const [, bump] = useState(0);
  const history = getHistory();

  function paste(cmd: string) {
    if (!pasteText(cmd)) return;
    pushHistory(cmd);
    bump((n) => n + 1);
  }

  /** Snippets without variables are pasted straight away; the others open the variables sheet. */
  function play(sn: Snippet) {
    if (parseVars(sn.cmd).length) return runSnippet(sn);
    paste(resolveCmd(sn.cmd, {}));
    markUsed(sn.id, {});
  }

  return (
    <View style={{ flexGrow: 0, flexShrink: 1, flexBasis: 300, minWidth: 260, borderLeftWidth: 1, borderColor: T.line, backgroundColor: T.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Seg
          options={[
            { value: 'fav', label: '★ Favoris' },
            { value: 'hist', label: 'Historique' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'fav' &&
          favs.map((sn) => (
            <View key={sn.id} style={[card, st.row, { borderRadius: 14, padding: 12, gap: 10 }]}>
              <Pressable onLongPress={() => router.push({ pathname: '/snippet/edit', params: { id: sn.id } })} style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Tx w={600} style={{ fontSize: 14 }} numberOfLines={1}>
                  {sn.title}
                </Tx>
                <Tx mono style={{ fontSize: 11.5, color: T.muted }} numberOfLines={1}>
                  {plainCmd(sn.cmd)}
                </Tx>
              </Pressable>
              <PlayButton size={40} radius={11} disabled={!open} onPress={() => play(sn)} />
            </View>
          ))}
        {tab === 'fav' && !favs.length && <Tx style={{ fontSize: 13, color: T.dim, textAlign: 'center', marginTop: 8 }}>Aucun favori. Ajoute une étoile à un snippet.</Tx>}
        {tab === 'fav' && history.length > 0 && <Label style={{ paddingTop: 6 }}>SUGGESTIONS</Label>}
        {(tab === 'fav' ? history.slice(0, 3) : history).map((h) => (
          <Pressable key={h} disabled={!open} onPress={() => paste(h)} style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9, backgroundColor: pressed ? T.field : T.card })}>
            <Tx mono style={{ fontSize: 12.5, color: open ? T.text2 : T.faint }} numberOfLines={1}>
              {h}
            </Tx>
          </Pressable>
        ))}
        {tab === 'hist' && !history.length && <Tx style={{ fontSize: 13, color: T.dim, textAlign: 'center', marginTop: 8 }}>Aucune commande collée depuis un snippet.</Tx>}
        <Pressable onPress={() => router.navigate('/commands')} style={{ alignItems: 'center', paddingVertical: 8 }}>
          <Tx w={600} style={{ fontSize: 13, color: T.blue }}>
            Gérer les snippets →
          </Tx>
        </Pressable>
      </ScrollView>
    </View>
  );
}
