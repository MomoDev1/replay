import { router } from 'expo-router';
import { ChevronLeft, Star } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Dot, EnvBadge, Mono, s } from '@/components/ui';
import { terminalLines } from '@/data/mock';
import { C } from '@/theme';

const PROMPT = 'deploy@api-prod-01 /var/www/api$ ';
const KEYS = ['Ctrl', 'Alt', 'Esc', 'Tab', '←', '↑', '↓', '→', '|', '~', '/'];
const HISTORY = ['sudo systemctl restart api', 'sudo systemctl reload nginx', 'sudo systemctl status api'];

type Line = (typeof terminalLines)[number];

const lineColor = { prompt: C.green, green: C.green, orange: C.orange, muted: C.muted } as const;

export function TerminalView() {
  const [lines, setLines] = useState<Line[]>(terminalLines);
  const [input, setInput] = useState('sudo systemctl rest');
  const [ctrl, setCtrl] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  const suggestions = input ? HISTORY.filter((h) => h.startsWith(input) && h !== input) : [];

  function run(cmd: string) {
    if (!cmd.trim()) return;
    setLines((l) => [...l, { t: PROMPT + cmd, c: 'prompt' }]);
    setInput('');
    if (cmd.includes('restart')) {
      setRunning(cmd);
      const out = ['[sudo] Touch ID validé', 'Stopping api.service — Relay API…', 'api[18342]: SIGTERM reçu, fermeture des connexions (12 actives)', 'api[18342]: drain terminé en 1.8 s', 'Starting api.service — Relay API…'];
      out.forEach((t, i) => setTimeout(() => setLines((l) => [...l, { t, c: 'muted' }]), 500 * (i + 1)));
      setTimeout(() => setRunning(null), 500 * (out.length + 1));
    }
  }

  function key(k: string) {
    if (k === 'Ctrl') return setCtrl((c) => !c);
    if (k === 'Tab' && suggestions[0]) return setInput(suggestions[0]);
    if (k === '↑') return setInput(HISTORY[HISTORY.length - 1]);
    if (k.length === 1 && !'←↑↓→'.includes(k)) setInput((v) => v + k);
  }

  function interrupt() {
    setRunning(null);
    setLines((l) => [...l, { t: '^C', c: 'orange' }]);
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={[s.row, { paddingHorizontal: 12, paddingVertical: 8, gap: 10 }]}>
        <Pressable onPress={() => router.navigate('/')} hitSlop={8}>
          <ChevronLeft size={22} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={[s.row, { gap: 6 }]}>
            <Text style={{ color: C.text, fontWeight: '700', fontSize: 16 }}>api-prod-01</Text>
            <EnvBadge env="prod" />
          </View>
          <View style={[s.row, { gap: 4 }]}>
            <Dot color={C.green} size={6} />
            <Text style={{ color: C.green, fontSize: 11 }}>Connecté · 38 ms</Text>
          </View>
        </View>
        <Pressable onPress={() => router.push('/snippets')} style={{ backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
          <Text style={{ color: C.text, fontSize: 12 }}>Snippets</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/quick-commands')} style={{ backgroundColor: C.surface2, borderRadius: 8, padding: 7 }}>
          <Star size={16} color={C.orange} fill={C.orange} />
        </Pressable>
      </View>

      <View style={[s.row, { paddingHorizontal: 12, gap: 6, marginBottom: 6 }]}>
        <View style={[s.row, { gap: 4, backgroundColor: C.surface2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }]}>
          <Dot color={C.green} size={5} />
          <Mono style={{ fontSize: 11 }}>api-prod-01</Mono>
        </View>
        <View style={[s.row, { gap: 4, paddingHorizontal: 8, paddingVertical: 4 }]}>
          <Dot color={C.green} size={5} />
          <Mono style={{ fontSize: 11, color: C.muted }}>staging-eu</Mono>
        </View>
        <Text style={{ color: C.muted }}>+</Text>
      </View>

      {running && (
        <View style={[s.row, { marginHorizontal: 12, padding: 10, borderRadius: 10, backgroundColor: C.orangeBg, gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Mono style={{ fontSize: 12, fontWeight: '700' }}>{running}</Mono>
            <Text style={{ color: C.orange, fontSize: 11 }}>En cours…</Text>
          </View>
          <Text style={{ color: C.muted, fontSize: 11 }}>Notifier à la fin</Text>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 12, justifyContent: 'flex-end', flexGrow: 1 }} onContentSizeChange={() => scroll.current?.scrollToEnd()}>
          {lines.map((l, i) => (
            <Mono key={i} style={{ fontSize: 12, lineHeight: 18, color: l.c ? lineColor[l.c] : C.text }}>
              {l.t}
            </Mono>
          ))}
          <View style={s.row}>
            <Mono style={{ fontSize: 12, color: C.green }}>{PROMPT}</Mono>
          </View>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => run(input)}
            autoCapitalize="none"
            autoCorrect={false}
            submitBehavior="submit"
            style={{ color: C.text, fontFamily: 'Menlo', fontSize: 12, padding: 0 }}
          />
        </ScrollView>

        {suggestions.length > 0 && (
          <ScrollView horizontal keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingBottom: 6 }} style={{ flexGrow: 0 }}>
            {suggestions.map((sg) => (
              <Pressable key={sg} onPress={() => setInput(sg)} style={{ backgroundColor: C.surface2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Mono style={{ fontSize: 11 }}>{sg}</Mono>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <ScrollView horizontal keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 6, padding: 8 }} style={{ flexGrow: 0, backgroundColor: C.surface }}>
          {KEYS.map((k) => {
            const on = k === 'Ctrl' && ctrl;
            return (
              <Pressable key={k} onPress={() => key(k)} style={{ minWidth: 38, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6, backgroundColor: on ? C.accent : C.surface2 }}>
                <Text style={{ color: C.text, fontSize: 12 }}>{k}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {running && (
          <Pressable onPress={interrupt} style={[s.row, { justifyContent: 'center', gap: 8, margin: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.red, backgroundColor: C.redBg }]}>
            <View style={{ backgroundColor: C.red, borderRadius: 4, paddingHorizontal: 5 }}>
              <Mono style={{ fontSize: 11, color: '#fff' }}>Ctrl+C</Mono>
            </View>
            <Text style={{ color: C.red, fontWeight: '600' }}>Interrompre</Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
