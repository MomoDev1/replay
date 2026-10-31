import { router } from 'expo-router';
import { Play, Star } from 'lucide-react-native';
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Mono, s } from '@/components/ui';
import type { Snippet } from '@/lib/types';
import { C } from '@/theme';

// `${HOME}` is shell parameter expansion, not a snippet variable: the optional `$` is captured so it can be skipped.
const VAR = /(\$?)\{(\w+)(?::([^}]*))?\}/g;
const VAR_SPLIT = /(\$?\{\w+(?::[^}]*)?\})/;

export type SnippetVar = { name: string; choices: string[] };

/** Variables in order of first appearance; choices come from the first `{name:a|b}` occurrence. */
export function parseVars(cmd: string): SnippetVar[] {
  const vars = new Map<string, string[]>();
  for (const [, dollar, name, choices] of cmd.matchAll(VAR)) {
    if (dollar) continue;
    const list = choices ? choices.split('|').filter(Boolean) : [];
    if (!vars.has(name) || (!vars.get(name)!.length && list.length)) vars.set(name, list);
  }
  return [...vars].map(([name, choices]) => ({ name, choices }));
}

export const resolveCmd = (cmd: string, vals: Record<string, string>) => cmd.replace(VAR, (m, dollar: string, v: string) => (dollar ? m : vals[v] || v));

/** Command with variables reduced to their name, for one-line previews. */
export const plainCmd = (cmd: string) => cmd.replace(VAR, (m, dollar: string, v: string) => (dollar ? m : v));

/**
 * iOS "smart punctuation" rewrites ' " -- ... into ’ ” — … even with autoCorrect off,
 * and a shell rejects them. Applied when a snippet is saved and when it is pasted.
 */
export const asciiPunct = (text: string) =>
  text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2014/g, '--')
    .replace(/\u2026/g, '...');

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
  const parts = cmd.split(VAR_SPLIT);
  return (
    <Mono style={{ fontSize: 12, color: C.muted }} numberOfLines={numberOfLines}>
      {parts.map((p, i) =>
        i % 2 && p[0] !== '$' ? (
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

export function SnippetRow({ sn, showMeta = true, onToggleFav }: { sn: Snippet; showMeta?: boolean; onToggleFav?: () => void }) {
  return (
    <View style={[s.row, { gap: 12 }]}>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={[s.row, { gap: 6 }]}>
          {onToggleFav && (
            <Pressable onPress={onToggleFav} hitSlop={10}>
              <Star size={15} color={sn.fav ? C.orange : C.dim} fill={sn.fav ? C.orange : 'transparent'} />
            </Pressable>
          )}
          <Text style={{ color: C.text, fontWeight: '600', flex: 1 }}>{sn.title}</Text>
        </View>
        <SnippetCmd cmd={sn.cmd} numberOfLines={showMeta ? undefined : 1} />
        {showMeta && <Text style={{ color: C.dim, fontSize: 11 }}>{snippetMeta(sn)}</Text>}
      </View>
      <PlayButton onPress={() => runSnippet(sn)} size={showMeta ? 40 : 32} />
    </View>
  );
}
