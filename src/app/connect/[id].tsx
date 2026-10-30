import { router, useLocalSearchParams } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Dot, Mono, s, SectionLabel } from '@/components/ui';
import { servers } from '@/data/mock';
import { C } from '@/theme';

const STEPS = [
  { label: 'Résolution DNS', meta: '12 ms' },
  { label: 'Négociation SSH', meta: 'ed25519' },
  { label: 'Authentification par clé', meta: 'id_ed25519' },
  { label: 'Ouverture du shell', meta: '' },
];

export default function Connect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const server = servers.find((sv) => sv.id === id) ?? servers[0];
  const willFail = server.status !== 'online';
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed) return;
    if (willFail && step === 1) {
      const t = setTimeout(() => setFailed(true), 900);
      return () => clearTimeout(t);
    }
    if (step === STEPS.length) {
      router.replace('/terminal');
      return;
    }
    const t = setTimeout(() => setStep((n) => n + 1), 600);
    return () => clearTimeout(t);
  }, [step, failed, willFail]);

  const addr = `${server.user}@${server.host}:${server.port}`;

  if (failed) {
    return (
      <SafeAreaView style={s.screen}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
          <View style={{ alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: C.redBg, alignItems: 'center', justifyContent: 'center' }}>
            <X size={28} color={C.red} />
          </View>
          <Text style={[s.h2, { textAlign: 'center', marginTop: 16 }]}>Connexion impossible</Text>
          <Mono style={{ color: C.muted, textAlign: 'center', fontSize: 12, marginTop: 6 }}>
            {server.name} · {addr}
          </Mono>
          <Card style={{ marginTop: 20, borderColor: C.red + '66', backgroundColor: C.redBg }}>
            <Mono style={{ fontSize: 12 }}>
              ssh: connect to host {server.host} port {server.port}: Connection timed out
            </Mono>
            <Mono style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>après 15 s · 3 tentatives</Mono>
          </Card>
          <SectionLabel>Pistes</SectionLabel>
          {[
            [C.orange, 'Adresse privée : le VPN de l’équipe est-il actif ?'],
            [C.dim, `Port ${server.port} filtré par le pare-feu ?`],
            [C.dim, `Dernière connexion réussie : ${server.lastSeen.toLowerCase()}`],
          ].map(([c, t]) => (
            <View key={t} style={[s.row, { gap: 10, marginBottom: 8, alignItems: 'flex-start' }]}>
              <View style={{ marginTop: 5 }}>
                <Dot color={c} size={6} />
              </View>
              <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{t}</Text>
            </View>
          ))}
          <Button title="Réessayer" style={{ marginTop: 16 }} onPress={() => { setFailed(false); setStep(0); }} />
          <View style={[s.row, { gap: 8, marginTop: 8 }]}>
            <Button title="Modifier" variant="ghost" style={{ flex: 1 }} onPress={() => router.replace('/server/new')} />
            <Button title="Retour" variant="ghost" style={{ flex: 1 }} onPress={() => router.back()} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.screen, { padding: 20, justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={C.orange} />
      <Text style={[s.h2, { textAlign: 'center', marginTop: 16 }]}>Connexion à {server.name}</Text>
      <Mono style={{ color: C.muted, textAlign: 'center', fontSize: 12, marginTop: 6 }}>{addr}</Mono>
      <Card style={{ marginTop: 24, padding: 0 }}>
        {STEPS.map((st, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <View key={st.label} style={[s.row, { padding: 14, gap: 10, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
              {done ? <Check size={14} color={C.green} /> : <Dot color={active ? C.orange : C.dim} size={6} />}
              <Text style={{ flex: 1, color: done || active ? C.text : C.dim }}>{st.label}</Text>
              {(done || active) && <Mono style={{ fontSize: 11, color: C.muted }}>{st.meta}</Mono>}
            </View>
          );
        })}
      </Card>
      <Button title="Annuler" variant="ghost" style={{ marginTop: 20 }} onPress={() => router.back()} />
    </SafeAreaView>
  );
}
