import { ScrollView, View } from 'react-native';

import { Mono, s } from '@/components/ui';
import type { DiffLine } from '@/lib/git';
import { C } from '@/theme';

/** Unified diff with old/new line numbers; scrolls horizontally for long lines. */
export function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <ScrollView horizontal>
      <View>
        {lines.map((l, i) => {
          if (l.k === '@')
            return (
              <Mono key={i} style={{ fontSize: 11, color: C.accent, backgroundColor: C.accentBg, padding: 8 }}>
                {l.t}
              </Mono>
            );
          const bg = l.k === '+' ? C.greenBg : l.k === '-' ? C.redBg : 'transparent';
          const col = l.k === '+' ? C.green : l.k === '-' ? C.red : C.text;
          return (
            <View key={i} style={[s.row, { backgroundColor: bg, paddingVertical: 2, paddingRight: 16 }]}>
              <Mono style={{ width: 36, textAlign: 'right', color: C.dim, fontSize: 11 }}>{l.o ?? ''}</Mono>
              <Mono style={{ width: 36, textAlign: 'right', color: C.dim, fontSize: 11 }}>{l.n ?? ''}</Mono>
              <Mono style={{ width: 18, textAlign: 'center', color: col, fontSize: 11 }}>{l.k ?? ''}</Mono>
              <Mono style={{ color: col, fontSize: 11 }}>{l.t}</Mono>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
