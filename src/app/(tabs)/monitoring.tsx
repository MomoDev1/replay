import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Dot, Mono, s } from '@/components/ui';
import { logs as seed } from '@/data/mock';
import { C } from '@/theme';

type Lvl = (typeof seed)[number]['lvl'];
const lvlColor: Record<Lvl, string> = { INFO: C.accent, WARN: C.orange, ERROR: C.red, DEBUG: C.dim };
type Filter = 'all' | 'WARN' | 'ERROR';

function Bars({ data }: { data: number[] }) {
  return (
    <View style={[s.row, { alignItems: 'flex-end', gap: 2, height: 24, marginTop: 8 }]}>
      {data.map((v, i) => (
        <View key={i} style={{ flex: 1, height: `${v}%`, backgroundColor: C.accent, opacity: 0.5 + v / 200, borderRadius: 1 }} />
      ))}
    </View>
  );
}

function Meter({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={{ height: 4, backgroundColor: C.surface2, borderRadius: 2, marginTop: 8 }}>
      <View style={{ width: `${pct}%`, height: 4, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

export default function Monitoring() {
  const [cpu, setCpu] = useState(() => Array.from({ length: 20 }, () => 20 + Math.random() * 60));
  const [lines, setLines] = useState(seed);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setInterval(() => {
      setCpu((c) => [...c.slice(1), 20 + Math.random() * 60]);
      setLines((l) => {
        const src = seed[Math.floor(Math.random() * seed.length)];
        const time = new Date().toTimeString().slice(0, 8);
        return [...l.slice(-60), { ...src, time }];
      });
    }, 2000);
    return () => clearInterval(t);
  }, []);

  const shown = useMemo(
    () => lines.filter((l) => (filter === 'all' || l.lvl === filter) && l.msg.toLowerCase().includes(q.toLowerCase())).reverse(),
    [lines, filter, q],
  );
  const cpuNow = Math.round(cpu[cpu.length - 1]);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={s.h1}>Monitoring</Text>
          <View style={[s.row, { gap: 6, backgroundColor: C.surface2, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }]}>
            <Dot color={C.green} size={6} />
            <Mono style={{ fontSize: 11 }}>api-prod-01</Mono>
          </View>
        </View>
        <View style={[s.row, { gap: 8, marginTop: 12 }]}>
          <Card style={{ flex: 1, padding: 12 }}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.muted}>CPU</Text>
              <Text style={{ color: C.text, fontWeight: '700' }}>{cpuNow}%</Text>
            </View>
            <Bars data={cpu} />
          </Card>
          <Card style={{ flex: 1, padding: 12 }}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.muted}>RAM</Text>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 18 }}>
                2,1 <Text style={{ fontSize: 11, color: C.muted }}>/ 4 Go</Text>
              </Text>
            </View>
            <Meter pct={52} color={C.green} />
            <Text style={{ color: C.dim, fontSize: 10, marginTop: 4 }}>52 % · swap 0 %</Text>
          </Card>
        </View>
        <View style={[s.row, { gap: 8, marginTop: 8 }]}>
          <Card style={{ flex: 1, padding: 12, borderColor: C.orange + '88' }}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.muted}>Disque /</Text>
              <Text style={{ color: C.orange, fontWeight: '700' }}>82%</Text>
            </View>
            <Meter pct={82} color={C.orange} />
            <Text style={{ color: C.orange, fontSize: 10, marginTop: 4 }}>14 Go libres sur 80</Text>
          </Card>
          <Card style={{ flex: 1, padding: 12 }}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.muted}>Uptime</Text>
              <Text style={{ color: C.text, fontWeight: '700' }}>12 j 4 h</Text>
            </View>
            <Mono style={{ color: C.dim, fontSize: 10, marginTop: 12 }}>load 0.42 0.38 0.35</Mono>
          </Card>
        </View>
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 16 }]}>
          <Mono style={{ fontSize: 12 }}>tail -f storage/logs/app.log</Mono>
          <View style={[s.row, { gap: 4, backgroundColor: C.greenBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }]}>
            <Dot color={C.green} size={5} />
            <Text style={{ color: C.green, fontSize: 11 }}>En direct</Text>
          </View>
        </View>
        <View style={[s.row, { gap: 6, marginTop: 8 }]}>
          <TextInput value={q} onChangeText={setQ} placeholder="/ Filtrer" placeholderTextColor={C.dim} autoCapitalize="none" style={{ flex: 1, backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, color: C.text, fontSize: 12 }} />
          {(['all', 'WARN', 'ERROR'] as Filter[]).map((f) => {
            const on = filter === f;
            const col = f === 'WARN' ? C.orange : f === 'ERROR' ? C.red : C.text;
            return (
              <Pressable key={f} onPress={() => setFilter(f)} style={{ paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6, backgroundColor: on ? C.surface2 : 'transparent', borderWidth: 1, borderColor: on ? C.border : 'transparent' }}>
                <Text style={{ color: col, fontSize: 11, fontWeight: '700' }}>{f === 'all' ? 'Tous' : f === 'ERROR' ? 'ERR' : f}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        renderItem={({ item }) => (
          <View style={[s.row, { gap: 8, paddingVertical: 2, alignItems: 'flex-start', backgroundColor: item.lvl === 'ERROR' ? C.redBg : 'transparent' }]}>
            <Mono style={{ fontSize: 10, color: C.dim }}>{item.time}</Mono>
            <Mono style={{ fontSize: 10, color: lvlColor[item.lvl], width: 38 }}>{item.lvl}</Mono>
            <Mono style={{ fontSize: 10, flex: 1 }}>{item.msg}</Mono>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
