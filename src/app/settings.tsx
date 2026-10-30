import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Mono, s, SectionLabel, Segmented } from '@/components/ui';
import { sshKeys } from '@/data/mock';
import { C } from '@/theme';

type Timeout = '5' | '15' | '60' | 'never';

export default function Settings() {
  const [faceId, setFaceId] = useState(true);
  const [timeout, setTimeoutVal] = useState<Timeout>('15');

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
          <View style={[s.row, { padding: 14 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text }}>Verrouillage Face ID</Text>
              <Text style={[s.muted, { fontSize: 11 }]}>À l’ouverture et au retour dans l’app</Text>
            </View>
            <Switch value={faceId} onValueChange={setFaceId} trackColor={{ true: C.green, false: C.surface2 }} />
          </View>
          <View style={s.sep} />
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
              onChange={setTimeoutVal}
            />
          </View>
          <View style={s.sep} />
          <View style={[s.row, { padding: 14, justifyContent: 'space-between' }]}>
            <Text style={{ color: C.text }}>Confirmation production</Text>
            <Text style={s.muted}>Nom + Face ID ›</Text>
          </View>
        </Card>

        <SectionLabel>Clés SSH</SectionLabel>
        <Card style={{ padding: 0 }}>
          {sshKeys.map((k, i) => (
            <View key={k.name} style={[s.row, { padding: 14, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <View style={[s.row, { gap: 6 }]}>
                  <Mono>{k.name}</Mono>
                  {k.enclave && (
                    <View style={{ backgroundColor: C.greenBg, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                      <Text style={{ color: C.green, fontSize: 9, fontWeight: '700' }}>SECURE ENCLAVE</Text>
                    </View>
                  )}
                </View>
                <Mono style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{k.fp}</Mono>
              </View>
              <Text style={[s.muted, { fontSize: 12 }]}>
                {k.servers} serveur{k.servers > 1 ? 's' : ''}
              </Text>
            </View>
          ))}
          <View style={s.sep} />
          <View style={s.row}>
            <Pressable style={{ flex: 1, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: C.accent, fontWeight: '600' }}>+ Générer</Text>
            </Pressable>
            <Pressable style={{ flex: 1, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: C.accent, fontWeight: '600' }}>Importer…</Text>
            </Pressable>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
