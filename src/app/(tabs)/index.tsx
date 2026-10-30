import { router } from 'expo-router';
import { ChevronDown, Plus, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Dot, EnvBadge, Mono, s } from '@/components/ui';
import { servers, type ServerStatus } from '@/data/mock';
import { C } from '@/theme';

const statusColor: Record<ServerStatus, string> = { online: C.green, warning: C.orange, offline: C.dim };

export default function ServersScreen() {
  const [q, setQ] = useState('');
  const list = useMemo(
    () => servers.filter((sv) => `${sv.name} ${sv.host} ${sv.user}`.toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  const online = servers.filter((sv) => sv.status !== 'offline').length;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View>
            <Text style={s.h1}>Serveurs</Text>
            <Text style={s.muted}>
              {servers.length} serveurs · {online} en ligne
            </Text>
          </View>
          <View style={[s.row, { gap: 10 }]}>
            <Pressable onPress={() => router.push('/settings')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.text, fontWeight: '700' }}>JM</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/server/new')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
        <View style={[s.row, { gap: 8, marginTop: 14 }]}>
          <View style={[s.row, { flex: 1, backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8 }]}>
            <Search size={16} color={C.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder="Nom, hôte, IP…" placeholderTextColor={C.dim} style={{ flex: 1, color: C.text, paddingVertical: 11 }} autoCapitalize="none" />
          </View>
          <Pressable style={[s.row, { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, gap: 4 }]}>
            <Text style={{ color: C.text }}>Récents</Text>
            <ChevronDown size={14} color={C.muted} />
          </Pressable>
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/connect/${item.id}`)}>
            <Card>
              <View style={[s.row, { gap: 8 }]}>
                <Dot color={statusColor[item.status]} />
                <Text style={{ color: C.text, fontWeight: '700', fontSize: 16, flex: 1 }}>{item.name}</Text>
                <EnvBadge env={item.env} />
              </View>
              <View style={{ paddingLeft: 16, marginTop: 4, gap: 4 }}>
                <Mono style={{ color: C.muted, fontSize: 12 }}>
                  {item.user}@{item.host}
                  {item.port !== 22 ? `:${item.port}` : ''}
                </Mono>
                <Text style={{ fontSize: 12, color: C.dim }}>
                  <Text style={{ color: statusColor[item.status] === C.dim ? C.muted : statusColor[item.status] }}>{item.statusLabel}</Text> · {item.lastSeen}
                </Text>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
