import { router } from 'expo-router';
import { Play } from 'lucide-react-native';
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Mono, s } from '@/components/ui';
import type { Snippet } from '@/lib/types';
import { C } from '@/theme';

const VAR = /\{(\w+)(?::([^}]*))?\}/g;

export type SnippetVar = { name: string; choices: string[] };

/** Variables in order of first appearance; choices come from the first `{name:a|b}` occurrence. */
export function parseVars(cmd: string): SnippetVar[] {
  const vars = new Map<string, string[]>();
  for (const [, name, choices] of cmd.matchAll(VAR)) {
    const list = choices ? choices.split('|').filter(Boolean) : [];
    if (!vars.has(name) || (!vars.get(name)!.length && list.length)) vars.set(name, list);
  }
  return [...vars].map(([name, choices]) => ({ name, choices }));
}

export const resolveCmd = (cmd: string, vals: Record<string, string>) => cmd.replace(VAR, (_, v: string) => vals[v] || v);

/** Command with variables reduced to their name, for one-line previews. */
export const plainCmd = (cmd: string) => cmd.replace(VAR, '$1');

function ago(ts: number) {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days === 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  return `il y a ${days} j`;
}

export function snippetMeta(sn: Snippet) {
  const n = parseVars(sn.cmd).length;
  const parts = [n ? `${n} variable${n > 1 ? 's' : ''}` : 'Aucune variable'];
  if (sn.lastUsedAt) parts.push(`utilisé ${ago(sn.lastUsedAt)}`);
  return parts.join(' · ');
}

export function SnippetCmd({ cmd, numberOfLines }: { cmd: string; numberOfLines?: number }) {
  const parts = cmd.split(/(\{\w+(?::[^}]*)?\})/);
  return (
    <Mono style={{ fontSize: 12, color: C.muted }} numberOfLines={numberOfLines}>
      {parts.map((p, i) =>
        i % 2 ? (
          <Text key={i} style={{ color: C.accent, backgroundColor: C.accentBg }}>
            {p.slice(1, -1).split(':')[0]}
          </Text>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </Mono>
  );
}

export function PlayButton({ onPress, size = 40 }: { onPress: () => void; size?: number }) {
  return (
    <Pressable onPress={onPress} style={{ width: size, height: size, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Play size={size * 0.4} color="#fff" fill="#fff" />
    </Pressable>
  );
}

export function runSnippet(sn: Snippet) {
  router.push(`/snippet/${sn.id}`);
}

export function SnippetRow({ sn, showMeta = true }: { sn: Snippet; showMeta?: boolean }) {
  return (
    <View style={[s.row, { gap: 12 }]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: C.text, fontWeight: '600' }}>{sn.title}</Text>
        <SnippetCmd cmd={sn.cmd} numberOfLines={showMeta ? undefined : 1} />
        {showMeta && <Text style={{ color: C.dim, fontSize: 11 }}>{snippetMeta(sn)}</Text>}
      </View>
      <PlayButton onPress={() => runSnippet(sn)} size={showMeta ? 40 : 32} />
    </View>
  );
}
