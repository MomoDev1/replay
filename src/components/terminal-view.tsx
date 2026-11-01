import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CaseSensitive, ChevronDown, ChevronLeft, ChevronUp, ClipboardPaste, Copy, Search, SquareTerminal, Star, TextSelect, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Dot, EnvBadge, Mono, s } from '@/components/ui';
import XTerm, { type XTermRef } from '@/components/xterm';
import { closeSession, pasteText, resizeSession, sendB64, sendText, setPasteHandler, subscribeData, useSession } from '@/store/session';
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

export function TerminalView() {
  const session = useSession();
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
  const latest = useRef<string | null>(null);
  latest.current = session?.id ?? null;

  function attach(id: string) {
    shown.current = id;
    unsub.current?.();
    unsub.current = subscribeData((b64) => term.current?.write(b64));
  }

  // Reconnecting reuses the same xterm: remounting its WebView while this tab is hidden leaves it blank or frozen.
  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId || shown.current === null || shown.current === sessionId) return;
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
    sendText(seq);
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
    if (text) pasteText(text);
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
          <Text style={[s.muted, { textAlign: 'center' }]}>Connecte-toi à un serveur pour ouvrir un terminal.</Text>
        </View>
        <Button title="Choisir un serveur" style={{ marginTop: 24 }} onPress={() => router.navigate('/')} />
      </SafeAreaView>
    );
  }

  const { server } = session;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={[s.row, { paddingHorizontal: 12, paddingVertical: 8, gap: 10 }]}>
        <Pressable onPress={() => router.navigate('/')} hitSlop={8}>
          <ChevronLeft size={22} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={[s.row, { gap: 6 }]}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
              {server.name}
            </Text>
            <EnvBadge env={server.env} />
          </View>
          <View style={[s.row, { gap: 4 }]}>
            <Dot color={session.open ? C.green : C.dim} size={6} />
            <Text style={{ color: session.open ? C.green : C.muted, fontSize: 11 }}>{session.open ? `Connecté · ${session.latencyMs} ms` : 'Déconnecté'}</Text>
          </View>
        </View>
        <Pressable onPress={() => router.push('/snippets')} style={{ backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
          <Text style={{ color: C.text, fontSize: 12 }}>Snippets</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/quick-commands')} style={{ backgroundColor: C.surface2, borderRadius: 8, padding: 7 }}>
          <Star size={16} color={C.orange} fill={C.orange} />
        </Pressable>
        {session.open && (
          <Pressable onPress={() => closeSession()} style={{ backgroundColor: C.redBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Text style={{ color: C.red, fontSize: 12, fontWeight: '600' }}>Quitter</Text>
          </Pressable>
        )}
      </View>

      {!session.open && (
        <View style={[s.row, { marginHorizontal: 12, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: C.surface2, gap: 8 }]}>
          <Text style={{ color: C.muted, fontSize: 12, flex: 1 }}>{session.closedReason}</Text>
          <Pressable onPress={() => router.push(`/connect/${server.id}`)}>
            <Text style={{ color: C.accent, fontWeight: '600' }}>Reconnecter</Text>
          </Pressable>
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
            onReady={async () => attach(latest.current!)}
            onInput={async (b64) => sendB64(b64)}
            onResize={async (cols, rows) => resizeSession(cols, rows)}
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
