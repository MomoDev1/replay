import { CircleCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { Mono, s, SheetHeader } from '@/components/ui';
import { C } from '@/theme';

const OUTPUT = [
  'remote: Enumerating objects: 23, done.',
  'remote: Counting objects: 100% (23/23), done.',
  'remote: Compressing objects: 100% (11/11), done.',
  'Unpacking objects: 100% (14/14), 3.41 KiB | 498 KiB/s',
  'From github.com:relay/api',
  '   a41f9c2..d7e03b8  main       -> origin/main',
  'Updating a41f9c2..d7e03b8',
  'Fast-forward',
  ' src/billing/export.ts | 42 ++++++++++++++++--',
  ' 2 files changed, 38 insertions(+), 4 deletions(-)',
];

export default function PullSheet() {
  const [n, setN] = useState(0);
  const done = n >= OUTPUT.length;

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setN((x) => x + 1), 250);
    return () => clearTimeout(t);
  }, [n, done]);

  return (
    <View style={s.sheet}>
      <SheetHeader
        title="git pull origin main"
        subtitle={
          <View style={[s.row, { gap: 6, marginTop: 4 }]}>
            {done ? <CircleCheck size={14} color={C.green} /> : <ActivityIndicator size="small" color={C.orange} />}
            <Text style={{ color: done ? C.green : C.orange, fontSize: 12 }}>{done ? 'Terminé en 2,4 s · 2 commits récupérés' : 'En cours…'}</Text>
          </View>
        }
      />
      <ScrollView style={{ flex: 1, backgroundColor: C.bg, borderRadius: 10 }} contentContainerStyle={{ padding: 12, justifyContent: 'flex-end', flexGrow: 1 }}>
        {OUTPUT.slice(0, n).map((l, i) => (
          <Mono key={i} style={{ fontSize: 11, lineHeight: 16, color: l === 'Fast-forward' ? C.green : C.muted }}>
            {l}
          </Mono>
        ))}
      </ScrollView>
    </View>
  );
}
