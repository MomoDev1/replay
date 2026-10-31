import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Mono, s, SectionLabel, Segmented } from '@/components/ui';
import { asSshError } from '@/lib/ssh';
import type { SshKey } from '@/lib/types';
import { useServers } from '@/store/servers';
import { getIdleTimeout, setIdleTimeout, type IdleTimeout } from '@/store/session';
import { C } from '@/theme';

export default function Settings() {
  const [timeout, setTimeoutVal] = useState<IdleTimeout>(getIdleTimeout);
  const { keys, servers, generateKey } = useServers();
  const usage = (k: SshKey) => servers.filter((sv) => sv.auth === 'key' && sv.keyId === k.id).length;

  async function newKey() {
    try {
      const k = await generateKey(`relay_ed25519${keys.length ? `_${keys.length + 1}` : ''}`);
      router.push(`/key/${k.id}`);
    } catch (e) {
      Alert.alert('Génération impossible', asSshError(e).message);
    }
  }

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Pressable onPress={() => router.back()} style={[s.row, { gap: 2 }]}>
          <ChevronLeft size={16} color={C.accent} />
          <Text style={{ color: C.accent }}>Serveurs</Text>
        </Pressable>
        <Text style={[s.h1, { marginTop: 4 }]}>Réglages</Text>

        <SectionLabel>Sécurité</SectionLabel>
        <Card style={{ padding: 0 }}>
          <View style={{ padding: 14, gap: 10 }}>
            <Text style={{ color: C.text }}>Déconnexion SSH automatique</Text>
            <Segmented
              options={[
                { value: '5', label: '5 min' },
                { value: '15', label: '15 min' },
                { value: '60', label: '1 h' },
                { value: 'never', label: 'Jamais' },
              ]}
              value={timeout}
              onChange={(v) => {
                setTimeoutVal(v);
                setIdleTimeout(v);
              }}
            />
          </View>
          <View style={s.sep} />
          <View style={{ padding: 14, gap: 2 }}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={{ color: C.text }}>Confirmation production</Text>
              <Text style={s.muted}>Face ID</Text>
            </View>
            <Text style={[s.muted, { fontSize: 11 }]}>Enregistrer un fichier, annuler des modifications ou git reset sur un serveur prod</Text>
          </View>
        </Card>

        <SectionLabel>Comptes Git</SectionLabel>
        <Pressable onPress={() => router.push('/git/accounts')}>
          <Card style={[s.row, { padding: 14, gap: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text }}>GitHub et Bitbucket</Text>
              <Text style={[s.muted, { fontSize: 11 }]}>Jetons d’API pour gérer les pull requests</Text>
            </View>
            <ChevronRight size={14} color={C.dim} />
          </Card>
        </Pressable>

        <SectionLabel>Clés SSH</SectionLabel>
        <Card style={{ padding: 0 }}>
          {keys.length === 0 && <Text style={[s.muted, { padding: 14 }]}>Aucune clé. Génère-en une ou importe une clé existante.</Text>}
          {keys.map((k, i) => (
            <Pressable key={k.id} onPress={() => router.push(`/key/${k.id}`)} style={[s.row, { padding: 14, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Mono>{k.name}</Mono>
                <Mono style={{ fontSize: 10, color: C.dim, marginTop: 2 }} numberOfLines={1}>
                  {k.type} · {k.fingerprint}
                </Mono>
              </View>
              <Text style={[s.muted, { fontSize: 12 }]}>
                {usage(k)} serveur{usage(k) > 1 ? 's' : ''}
              </Text>
            </Pressable>
          ))}
          <View style={s.sep} />
          <View style={s.row}>
            <Pressable onPress={newKey} style={{ flex: 1, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: C.accent, fontWeight: '600' }}>+ Générer</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/key/import')} style={{ flex: 1, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: C.accent, fontWeight: '600' }}>Importer…</Text>
            </Pressable>
          </View>
        </Card>

        <SectionLabel>À propos</SectionLabel>
        <Card style={[s.row, { padding: 14, justifyContent: 'space-between' }]}>
          <Text style={{ color: C.text }}>Version</Text>
          <Mono style={{ color: C.muted }}>{`v${Constants.expoConfig?.version ?? '?'}`}</Mono>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
