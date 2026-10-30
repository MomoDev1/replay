import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Mono, s } from '@/components/ui';
import { C, mono } from '@/theme';

const TARGET = 'api-prod-01';

const rows: [string, string, string?][] = [
  ['Version', 'v2.13.4 → v2.14.0'],
  ['Commit', 'main @ d7e03b8'],
  ['Changements', '7 commits · 23 fichiers'],
  ['Migrations', '2 en attente', C.orange],
];

export default function ConfirmDeploy() {
  const [typed, setTyped] = useState('');
  const ok = typed === TARGET;

  async function confirm() {
    if (!ok) return;
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: `Déployer sur ${TARGET}` });
    if (!res.success && res.error !== 'not_available' && res.error !== 'not_enrolled') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    router.replace('/deploy/progress');
  }

  return (
    <SafeAreaView style={[s.screen, { borderTopWidth: 4, borderColor: C.red }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ backgroundColor: C.red, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>PRODUCTION</Text>
            </View>
            <Pressable onPress={() => router.back()}>
              <Text style={s.muted}>Annuler</Text>
            </Pressable>
          </View>
          <Text style={[s.h1, { fontSize: 28, marginTop: 16 }]}>
            Déployer sur <Text style={{ color: C.red, fontFamily: mono }}>{TARGET}</Text> ?
          </Text>
          <Text style={[s.muted, { marginTop: 8 }]}>Le service sera rechargé sans coupure. Les migrations ne sont pas annulables automatiquement.</Text>
          <Card style={{ padding: 0, marginTop: 20 }}>
            {rows.map(([k, v, col], i) => (
              <View key={k} style={[s.row, { justifyContent: 'space-between', padding: 14, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
                <Text style={s.muted}>{k}</Text>
                <Mono style={{ fontSize: 12, color: col ?? C.text }}>{v}</Mono>
              </View>
            ))}
          </Card>
          <Text style={{ color: C.text, fontSize: 13, marginTop: 20 }}>
            Tapez <Mono style={{ fontWeight: '700', fontSize: 13 }}>{TARGET}</Mono> pour confirmer
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={TARGET}
            placeholderTextColor={C.dim}
            style={{ marginTop: 8, borderWidth: 1.5, borderColor: ok ? C.red : C.border, borderRadius: 10, padding: 12, color: C.text, fontFamily: mono }}
          />
          <Button title="Déployer en production" variant="danger" style={{ marginTop: 16, opacity: ok ? 1 : 0.4 }} onPress={confirm} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
