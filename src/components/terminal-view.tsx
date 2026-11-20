import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CaseSensitive, ChevronDown, ChevronLeft, ChevronUp, ClipboardPaste, Copy, Laptop, Plus, Search, Server, SquareTerminal, Star, TextSelect, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Dot, EnvBadge, Mono, s } from '@/components/ui';
import XTerm, { type XTermRef } from '@/components/xterm';
import { useTablet } from '@/hooks/use-tablet';
import { closeSession, getActiveId, openLocalSession, pasteText, removeTab, resizeSession, sendB64, sendText, setActiveTab, setPasteHandler, subscribeData, useTerminals, type Terminal } from '@/store/session';
import { C, mono } from '@/theme';

const KEYS: [string, string][] = [
  ['Ctrl', ''],
  ['Esc', '\x1b'],
  ['Tab', '\t'],
  // Runs a pasted snippet without having to open the keyboard (iOS cannot raise it programmatically).
  ['↵', '\r'],
  ['^C', '\x03'],
  ['←', '\x1b[D'],
  ['↑', '\x1b[A'],
  ['↓', '\x1b[B'],
  ['→', '\x1b[C'],
  ['|', '|'],
  ['~', '~'],
  ['/', '/'],
  ['-', '-'],
];

function BarButton({ onPress, disabled, active, children, label }: { onPress: () => void; disabled?: boolean; active?: boolean; children: ReactNode; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={4}
      style={{ minWidth: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 6, backgroundColor: active ? C.accent : C.surface2, opacity: disabled ? 0.4 : 1 }}>
      {children}
    </Pressable>
  );
}

/** Open terminals (SSH and local) as tabs, with buttons to open more. */
function TerminalTabs({ tabs, activeId }: { tabs: Terminal[]; activeId: string | null }) {
  return (
    <View style={[s.row, { borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.surface }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 8, paddingVertical: 6 }} style={{ flex: 1 }}>
        {tabs.map((t) => {
          const active = t.id === activeId;
          const Icon = t.kind === 'local' ? Laptop : Server;
          return (
            <Pressable
              key={t.id}
              role="tab"
              aria-selected={active}
              accessibilityLabel={t.kind === 'local' ? t.title : t.server.name}
              onPress={() => setActiveTab(t.id)}
              style={[s.row, { gap: 6, paddingLeft: 10, paddingRight: 4, paddingVertical: 5, borderRadius: 8, maxWidth: 220, backgroundColor: active ? C.surface2 : 'transparent', borderWidth: 1, borderColor: active ? C.border : 'transparent' }]}>
              <Icon size={13} color={active ? C.text : C.muted} />
              <Text style={{ color: active ? C.text : C.muted, fontSize: 13, fontWeight: active ? '600' : '400', flexShrink: 1 }} numberOfLines={1}>
                {t.kind === 'local' ? t.title : t.server.name}
              </Text>
              <Dot color={t.open ? C.green : C.dim} size={6} />
              <Pressable onPress={() => removeTab(t.id)} hitSlop={6} accessibilityLabel="Fermer l’onglet" style={{ padding: 3, borderRadius: 4 }}>
                <X size={13} color={C.muted} />
              </Pressable>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[s.row, { gap: 6, paddingHorizontal: 8 }]}>
        <Pressable onPress={() => openLocalSession()} accessibilityLabel="Nouveau terminal local" style={[s.row, { gap: 5, backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 }]}>
          <Laptop size={14} color={C.text} />
          <Text style={{ color: C.text, fontSize: 12 }}>Local</Text>
        </Pressable>
        <Pressable onPress={() => router.navigate('/')} accessibilityLabel="Nouvelle session SSH" style={[s.row, { gap: 5, backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 }]}>
          <Plus size={14} color={C.text} />
          <Text style={{ color: C.text, fontSize: 12 }}>SSH</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function TerminalView() {
  const { tablet } = useTablet();
  const { tabs, activeId } = useTerminals();
  const session = tabs.find((t) => t.id === activeId) ?? null;
  const term = useRef<XTermRef>(null);
  const unsub = useRef<(() => void) | null>(null);
  const [ctrl, setCtrl] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState('');
  const [copied, setCopied] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState({ index: -1, count: 0 });

  useEffect(() => () => unsub.current?.(), []);

  // Id of the session the terminal shows, null until xterm is ready.
  const shown = useRef<string | null>(null);

  function attach(id: string | null) {
    shown.current = id;
    unsub.current?.();
    unsub.current = id ? subscribeData(id, (b64) => term.current?.write(b64)) : null;
  }

  // Switching tabs or reconnecting reuses the same xterm: remounting its WebView while this tab is hidden
  // leaves it blank or frozen. The new tab's buffered output is replayed into it.
  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId) {
      // Last tab closed: xterm unmounts, the next one attaches from onReady.
      unsub.current?.();
      unsub.current = null;
      shown.current = null;
      return;
    }
    if (shown.current === null || shown.current === sessionId) return;
    term.current?.clear();
    setCtrl(false);
    setSelecting(false);
    setSelection('');
    setSearching(false);
    setResults({ index: -1, count: 0 });
    attach(sessionId);
  }, [sessionId]);

  // Snippets and history are pasted through xterm (never executed): the user presses Enter themselves.
  useEffect(
    () =>
      setPasteHandler((text) => {
        setCtrl(false);
        term.current?.paste(text);
      }),
    [],
  );

  function key(label: string, seq: string) {
    if (label === 'Ctrl') {
      setCtrl((c) => !c);
      term.current?.setCtrl(!ctrl);
      return;
    }
    sendText(seq, getActiveId());
    term.current?.focus();
  }

  function startSelect() {
    closeSearch(false);
    setSelecting(true);
    term.current?.setSelectMode(true);
  }

  function stopSelect() {
    setSelecting(false);
    setSelection('');
    term.current?.setSelectMode(false);
  }

  async function copy() {
    if (!selection) return;
    await Clipboard.setStringAsync(selection);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
    stopSelect();
  }

  async function pasteClipboard() {
    const text = await Clipboard.getStringAsync();
    if (!text) return;
    if (session?.kind === 'ssh') pasteText(text);
    else term.current?.paste(text);
    if (selecting) stopSelect();
  }

  function openSearch() {
    if (selecting) stopSelect();
    setSearching(true);
    setResults({ index: -1, count: 0 });
    if (query) term.current?.find(query, false, caseSensitive);
  }

  function closeSearch(refocus = true) {
    if (!searching) return;
    setSearching(false);
    setResults({ index: -1, count: 0 });
    term.current?.clearSearch();
    if (refocus) term.current?.focus();
  }

  function find(q: string, backwards = false, cs = caseSensitive) {
    term.current?.find(q, backwards, cs);
  }

  if (!session) {
    return (
      <SafeAreaView style={[s.screen, { justifyContent: 'center', padding: 24 }]}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <SquareTerminal size={40} color={C.dim} />
          <Text style={s.h2}>Aucune session</Text>
          <Text style={[s.muted, { textAlign: 'center' }]}>Connecte-toi à un serveur, ou ouvre un terminal sur cet appareil.</Text>
        </View>
        <Button title="Choisir un serveur" style={{ marginTop: 24, width: '100%', maxWidth: 360, alignSelf: 'center' }} onPress={() => router.navigate('/')} />
        <Button title="Terminal local" variant="ghost" icon={<Laptop size={16} color={C.text} />} style={{ marginTop: 8, width: '100%', maxWidth: 360, alignSelf: 'center' }} onPress={() => openLocalSession()} />
      </SafeAreaView>
    );
  }

  const server = session.kind === 'ssh' ? session.server : null;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <View style={[s.row, { paddingHorizontal: 12, paddingVertical: 8, gap: 10 }]}>
        <Pressable onPress={() => router.navigate('/')} hitSlop={8}>
          <ChevronLeft size={22} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={[s.row, { gap: 6 }]}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
              {server ? server.name : 'Terminal local'}
            </Text>
            {server && <EnvBadge env={server.env} />}
          </View>
          <View style={[s.row, { gap: 4 }]}>
            <Dot color={session.open ? C.green : C.dim} size={6} />
            <Text style={{ color: session.open ? C.green : C.muted, fontSize: 11 }}>
              {session.kind === 'ssh' ? (session.open ? `Connecté · ${session.latencyMs} ms` : 'Déconnecté') : session.open ? 'Cet appareil' : 'Terminé'}
            </Text>
          </View>
        </View>
        {server && (
          <>
            <Pressable onPress={() => router.push('/snippets')} style={{ backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
              <Text style={{ color: C.text, fontSize: 12 }}>Snippets</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/quick-commands')} style={{ backgroundColor: C.surface2, borderRadius: 8, padding: 7 }}>
              <Star size={16} color={C.orange} fill={C.orange} />
            </Pressable>
          </>
        )}
        {session.open && (
          <Pressable onPress={() => closeSession(session.kind === 'ssh' ? 'Déconnecté' : 'Session locale terminée', session.id)} style={{ backgroundColor: C.redBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Text style={{ color: C.red, fontSize: 12, fontWeight: '600' }}>Quitter</Text>
          </Pressable>
        )}
      </View>

      {(tablet || tabs.length > 1) && <TerminalTabs tabs={tabs} activeId={activeId} />}

      {!session.open && (
        <View style={[s.row, { marginHorizontal: 12, marginVertical: 6, padding: 10, borderRadius: 10, backgroundColor: C.surface2, gap: 8 }]}>
          <Text style={{ color: C.muted, fontSize: 12, flex: 1 }}>{session.closedReason}</Text>
          {server ? (
            <Pressable onPress={() => router.push(`/connect/${server.id}`)}>
              <Text style={{ color: C.accent, fontWeight: '600' }}>Reconnecter</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => openLocalSession(session.id)}>
              <Text style={{ color: C.accent, fontWeight: '600' }}>Relancer</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Android is edge-to-edge: the window no longer resizes for the keyboard, so pad on both platforms */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={{ flex: 1 }}>
          <XTerm
            ref={term}
            background={C.bg}
            foreground={C.text}
            cursor={C.green}
            accent={C.accent}
            match={C.orange}
            // iOS: no prev/next/done bar above the keyboard, the key bar below replaces it
            dom={{ style: { flex: 1, backgroundColor: C.bg }, scrollEnabled: false, hideKeyboardAccessoryView: true }}
            onReady={async () => attach(getActiveId())}
            onInput={async (b64) => sendB64(b64, getActiveId())}
            onResize={async (cols, rows) => resizeSession(cols, rows, getActiveId())}
            onCtrlConsumed={async () => setCtrl(false)}
            onSelectModeChange={async (on) => {
              if (on) {
                Haptics.selectionAsync().catch(() => {});
                closeSearch(false);
              }
              setSelecting(on);
            }}
            onSelection={async (text) => setSelection(text)}
            onSearchResults={async (index, count) => setResults({ index, count })}
          />
        </View>

        {searching ? (
          <View style={[s.row, { gap: 6, padding: 8, backgroundColor: C.surface }]}>
            <View style={[s.row, { flex: 1, gap: 6, backgroundColor: C.surface2, borderRadius: 6, paddingHorizontal: 8 }]}>
              <Search size={14} color={C.muted} />
              <TextInput
                value={query}
                onChangeText={(q) => {
                  setQuery(q);
                  find(q);
                }}
                onSubmitEditing={() => find(query)}
                submitBehavior="submit"
                returnKeyType="search"
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Rechercher dans le terminal"
                placeholderTextColor={C.dim}
                style={{ flex: 1, color: C.text, fontFamily: mono, fontSize: 13, paddingVertical: 7 }}
              />
              {!!query && (
                <Text style={{ color: results.count ? C.muted : C.red, fontSize: 11 }}>
                  {results.count ? `${results.index >= 0 ? results.index + 1 : '?'}/${results.count}` : '0'}
                </Text>
              )}
            </View>
            <BarButton
              label="Respecter la casse"
              active={caseSensitive}
              onPress={() => {
                const cs = !caseSensitive;
                setCaseSensitive(cs);
                if (query) find(query, false, cs);
              }}>
              <CaseSensitive size={16} color={C.text} />
            </BarButton>
            <BarButton label="Résultat précédent" disabled={!query} onPress={() => find(query, true)}>
              <ChevronUp size={16} color={C.text} />
            </BarButton>
            <BarButton label="Résultat suivant" disabled={!query} onPress={() => find(query)}>
              <ChevronDown size={16} color={C.text} />
            </BarButton>
            <BarButton label="Fermer la recherche" onPress={() => closeSearch()}>
              <X size={16} color={C.text} />
            </BarButton>
          </View>
        ) : selecting ? (
          <View style={[s.row, { gap: 6, padding: 8, backgroundColor: C.surface }]}>
            <Text style={{ flex: 1, color: C.muted, fontSize: 11 }} numberOfLines={2}>
              {selection ? `${selection.length} caractère${selection.length > 1 ? 's' : ''} · glisse les poignées pour ajuster` : 'Touche un mot ou glisse pour sélectionner · 2 doigts pour défiler'}
            </Text>
            <BarButton label="Tout sélectionner" onPress={() => term.current?.selectAll()}>
              <Text style={{ color: C.text, fontSize: 12 }}>Tout</Text>
            </BarButton>
            <BarButton label="Copier" active={!!selection} disabled={!selection} onPress={copy}>
              <Copy size={14} color={C.text} />
              <Text style={{ color: C.text, fontSize: 12, fontWeight: '600' }}>Copier</Text>
            </BarButton>
            <BarButton label="Terminer la sélection" onPress={stopSelect}>
              <X size={16} color={C.text} />
            </BarButton>
          </View>
        ) : (
          <ScrollView horizontal keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 6, padding: 8 }} style={{ flexGrow: 0, backgroundColor: C.surface }}>
            <BarButton label="Rechercher" onPress={openSearch}>
              <Search size={15} color={C.text} />
            </BarButton>
            <BarButton label="Sélectionner du texte" onPress={startSelect}>
              <TextSelect size={15} color={copied ? C.green : C.text} />
            </BarButton>
            <BarButton label="Coller" disabled={!session.open} onPress={pasteClipboard}>
              <ClipboardPaste size={15} color={C.text} />
            </BarButton>
            <View style={{ width: 1, backgroundColor: C.border, marginHorizontal: 2 }} />
            {KEYS.map(([label, seq]) => {
              const on = label === 'Ctrl' && ctrl;
              return (
                <Pressable key={label} disabled={!session.open} onPress={() => key(label, seq)} style={{ minWidth: 38, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6, backgroundColor: on ? C.accent : C.surface2, opacity: session.open ? 1 : 0.4 }}>
                  {label === '^C' ? <Mono style={{ fontSize: 12, color: C.red }}>{label}</Mono> : <Text style={{ color: C.text, fontSize: 12 }}>{label}</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
