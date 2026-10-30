import { router } from 'expo-router';
import { Play } from 'lucide-react-native';
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Mono, s } from '@/components/ui';
import type { Snippet } from '@/data/mock';
import { C } from '@/theme';

export function SnippetCmd({ cmd, numberOfLines }: { cmd: string; numberOfLines?: number }) {
  const parts = cmd.split(/(\{\w+\})/);
  return (
    <Mono style={{ fontSize: 12, color: C.muted }} numberOfLines={numberOfLines}>
      {parts.map((p, i) =>
        p.startsWith('{') ? (
          <Text key={i} style={{ color: C.accent, backgroundColor: C.accentBg }}>
            {p.slice(1, -1)}
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
        {showMeta && <Text style={{ color: C.dim, fontSize: 11 }}>{sn.meta}</Text>}
      </View>
      <PlayButton onPress={() => runSnippet(sn)} size={showMeta ? 40 : 32} />
    </View>
  );
}
