import { router } from 'expo-router';
import { ChevronLeft, Star, SquareTerminal } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Dot, EnvBadge, Mono, s } from '@/components/ui';
import XTerm, { type XTermRef } from '@/components/xterm';
import { closeSession, resizeSession, sendB64, sendText, subscribeData, useSession } from '@/store/session';
import { C } from '@/theme';

const KEYS: [string, string][] = [
  ['Ctrl', ''],
  ['Esc', '\x1b'],
  ['Tab', '\t'],
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

export function TerminalView() {
  const session = useSession();
  const term = useRef<XTermRef>(null);
  const unsub = useRef<(() => void) | null>(null);
  const [ctrl, setCtrl] = useState(false);

  useEffect(() => () => unsub.current?.(), []);

  function key(label: string, seq: string) {
    if (label === 'Ctrl') {
      setCtrl((c) => !c);
      term.current?.setCtrl(!ctrl);
      return;
    }
    sendText(seq);
    term.current?.focus();
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
            key={session.id}
            ref={term}
            background={C.bg}
            foreground={C.text}
            cursor={C.green}
            // iOS: no prev/next/done bar above the keyboard, the key bar below replaces it
            dom={{ style: { flex: 1, backgroundColor: C.bg }, scrollEnabled: false, hideKeyboardAccessoryView: true }}
            onReady={async () => {
              unsub.current?.();
              unsub.current = subscribeData((b64) => term.current?.write(b64));
            }}
            onInput={async (b64) => sendB64(b64)}
            onResize={async (cols, rows) => resizeSession(cols, rows)}
            onCtrlConsumed={async () => setCtrl(false)}
          />
        </View>

        <ScrollView horizontal keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 6, padding: 8 }} style={{ flexGrow: 0, backgroundColor: C.surface }}>
          {KEYS.map(([label, seq]) => {
            const on = label === 'Ctrl' && ctrl;
            return (
              <Pressable key={label} disabled={!session.open} onPress={() => key(label, seq)} style={{ minWidth: 38, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6, backgroundColor: on ? C.accent : C.surface2, opacity: session.open ? 1 : 0.4 }}>
                {label === '^C' ? <Mono style={{ fontSize: 12, color: C.red }}>{label}</Mono> : <Text style={{ color: C.text, fontSize: 12 }}>{label}</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
