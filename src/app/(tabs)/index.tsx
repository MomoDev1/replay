import { router } from 'expo-router';
import { ChevronDown, Plus, Search, Server as ServerIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Dot, EnvBadge, Mono, s } from '@/components/ui';
import type { Server, ServerStatus } from '@/lib/types';
import { useServers } from '@/store/servers';
import { C } from '@/theme';

const statusColor: Record<ServerStatus, string> = { online: C.green, offline: C.red, unknown: C.dim };
const statusLabel: Record<ServerStatus, string> = { online: 'Joignable', offline: 'Injoignable', unknown: 'Jamais connecté' };

function ago(ts: number | null) {
  if (!ts) return 'Aucune connexion';
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return 'Connecté à l’instant';
  if (min < 60) return `Connecté il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Hier' : `Il y a ${d} jours`;
}

export default function ServersScreen() {
  const { servers, deleteServer } = useServers();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const list = useMemo(() => {
    const f = servers.filter((sv) => `${sv.name} ${sv.host} ${sv.user}`.toLowerCase().includes(q.toLowerCase()));
    return sort === 'name' ? f : [...f].sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0));
  }, [servers, q, sort]);
  const online = servers.filter((sv) => sv.status === 'online').length;

  function actions(sv: Server) {
    Alert.alert(sv.name, `${sv.user}@${sv.host}:${sv.port}`, [
      { text: 'Modifier', onPress: () => router.push({ pathname: '/server/new', params: { id: sv.id } }) },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Supprimer ce serveur ?', `${sv.name} et son mot de passe enregistré seront effacés de cet appareil.`, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Supprimer', style: 'destructive', onPress: () => deleteServer(sv.id) },
          ]),
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View>
            <Text style={s.h1}>Serveurs</Text>
            <Text style={s.muted}>
              {servers.length} serveur{servers.length > 1 ? 's' : ''} · {online} joignable{online > 1 ? 's' : ''}
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
        {servers.length > 0 && (
          <View style={[s.row, { gap: 8, marginTop: 14 }]}>
            <View style={[s.row, { flex: 1, backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8 }]}>
              <Search size={16} color={C.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder="Nom, hôte, IP…" placeholderTextColor={C.dim} style={{ flex: 1, color: C.text, paddingVertical: 11 }} autoCapitalize="none" />
            </View>
            <Pressable onPress={() => setSort((v) => (v === 'recent' ? 'name' : 'recent'))} style={[s.row, { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, gap: 4 }]}>
              <Text style={{ color: C.text }}>{sort === 'recent' ? 'Récents' : 'Nom'}</Text>
              <ChevronDown size={14} color={C.muted} />
            </Pressable>
          </View>
        )}
      </View>
      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
        ListEmptyComponent={
          servers.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingBottom: 80 }}>
              <ServerIcon size={40} color={C.dim} />
              <Text style={s.h2}>Aucun serveur</Text>
              <Text style={[s.muted, { textAlign: 'center' }]}>Ajoute ton premier serveur pour t’y connecter en SSH.</Text>
              <Button title="Ajouter un serveur" style={{ marginTop: 8, alignSelf: 'stretch' }} onPress={() => router.push('/server/new')} />
            </View>
          ) : (
            <Text style={[s.muted, { textAlign: 'center', marginTop: 24 }]}>Aucun résultat pour « {q} »</Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/connect/${item.id}`)} onLongPress={() => actions(item)}>
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
                <Text style={{ fontSize: 12, color: C.dim }} numberOfLines={1}>
                  <Text style={{ color: item.status === 'unknown' ? C.muted : statusColor[item.status] }}>{item.status === 'offline' && item.lastError ? item.lastError : statusLabel[item.status]}</Text> · {ago(item.lastConnectedAt)}
                </Text>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
