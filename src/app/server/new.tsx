import { router } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Dot, Mono, Radio, s, SectionLabel, Segmented } from '@/components/ui';
import { useServerForm } from '@/hooks/use-server-form';
import { useTablet } from '@/hooks/use-tablet';
import { TabletServerForm } from '@/tablet/server-form';
import { C, envColor, mono, type Env } from '@/theme';

function Field({ label, value, onChange, monoFont, flex, keyboardType, placeholder }: { label: string; value: string; onChange: (v: string) => void; monoFont?: boolean; flex?: number; keyboardType?: 'number-pad'; placeholder?: string }) {
  return (
    <View style={[s.row, { flex, paddingHorizontal: 14, paddingVertical: 4, gap: 12 }]}>
      <Text style={{ color: C.muted, width: label.length > 6 ? undefined : 70 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} autoCapitalize="none" autoCorrect={false} keyboardType={keyboardType} placeholder={placeholder} placeholderTextColor={C.dim} style={{ flex: 1, color: C.text, paddingVertical: 10, fontFamily: monoFont ? mono : undefined }} />
    </View>
  );
}

export default function ServerForm() {
  const { tablet } = useTablet();
  return tablet ? <TabletServerForm /> : <PhoneServerForm />;
}

function PhoneServerForm() {
  const { existing, keys, keyId, setKeyId, name, setName, host, setHost, port, setPort, user, setUser, auth, setAuth, password, setPassword, env, setEnv, path, setPath, test, busy, problems, runTest, save, newKey } = useServerForm();

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: C.bg }]}>
      <View style={[s.row, { justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: C.border }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: C.muted, fontSize: 16 }}>Annuler</Text>
        </Pressable>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 16 }}>{existing ? 'Modifier le serveur' : 'Nouveau serveur'}</Text>
        <Pressable onPress={save} disabled={busy}>
          <Text style={{ color: problems.length ? C.dim : C.accent, fontWeight: '700', fontSize: 16 }}>Enregistrer</Text>
        </Pressable>
      </View>
      {/* iOS presents this modal as a page sheet, offset from the top of the window, which KeyboardAvoidingView
          does not account for: the scroll view insets itself from the keyboard instead (window coordinates).
          Android shows it full screen and, edge-to-edge, no longer resizes the window for the keyboard. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'android' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <SectionLabel>Connexion</SectionLabel>
          <Card style={{ padding: 0 }}>
            <Field label="Nom" value={name} onChange={setName} monoFont placeholder="api-prod-01" />
            <View style={s.sep} />
            <Field label="Hôte" value={host} onChange={setHost} monoFont placeholder="51.15.82.10" />
            <View style={s.sep} />
            <View style={s.row}>
              <Field label="Port" value={port} onChange={setPort} monoFont flex={1} keyboardType="number-pad" />
              <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border }} />
              <Field label="Utilisateur" value={user} onChange={setUser} monoFont flex={1.6} placeholder="deploy" />
            </View>
          </Card>

          <SectionLabel>Authentification</SectionLabel>
          <Segmented options={[{ value: 'key', label: 'Clé SSH' }, { value: 'password', label: 'Mot de passe' }]} value={auth} onChange={setAuth} />
          {auth === 'key' ? (
            <Card style={{ padding: 0, marginTop: 10 }}>
              {keys.length === 0 && <Text style={[s.muted, { padding: 14 }]}>Aucune clé sur cet appareil.</Text>}
              {keys.map((k, i) => (
                <View key={k.id}>
                  {i > 0 && <View style={s.sep} />}
                  <Pressable onPress={() => setKeyId(k.id)} style={[s.row, { gap: 12, padding: 14 }]}>
                    <Radio on={keyId === k.id} />
                    <View style={{ flex: 1 }}>
                      <Mono>{k.name}</Mono>
                      <Mono style={{ color: C.muted, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                        {k.type} · {k.fingerprint}
                      </Mono>
                    </View>
                    <Pressable onPress={() => router.push(`/key/${k.id}`)} hitSlop={10}>
                      <Text style={{ color: C.accent, fontSize: 13 }}>Voir</Text>
                    </Pressable>
                  </Pressable>
                </View>
              ))}
              <View style={s.sep} />
              <View style={s.row}>
                <Pressable onPress={newKey} style={{ flex: 1, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: C.accent, fontWeight: '600' }}>Générer une clé</Text>
                </Pressable>
                <Pressable onPress={() => router.push('/key/import')} style={{ flex: 1, padding: 12, alignItems: 'center' }}>
                  <Text style={{ color: C.accent, fontWeight: '600' }}>Importer…</Text>
                </Pressable>
              </View>
            </Card>
          ) : (
            <Card style={{ padding: 0, marginTop: 10 }}>
              <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder={existing?.auth === 'password' ? 'Inchangé' : 'Mot de passe'} placeholderTextColor={C.dim} style={{ color: C.text, padding: 14 }} />
            </Card>
          )}

          <SectionLabel>Environnement</SectionLabel>
          <View style={[s.row, { gap: 8 }]}>
            {(['dev', 'staging', 'prod'] as Env[]).map((e) => {
              const on = env === e;
              return (
                <Pressable key={e} onPress={() => setEnv(e)} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: on ? envColor[e] + '1A' : C.surface, borderWidth: 1, borderColor: on ? envColor[e] : C.border, gap: 6 }}>
                  <Dot color={envColor[e]} />
                  <Text style={{ color: C.text, fontWeight: '600' }}>{e === 'dev' ? 'Dev' : e === 'staging' ? 'Staging' : 'Prod'}</Text>
                </Pressable>
              );
            })}
          </View>
          {env === 'prod' && (
            <View style={{ backgroundColor: C.redBg, borderRadius: 10, padding: 12, marginTop: 10 }}>
              <Text style={{ color: C.text, fontSize: 12 }}>
                <Text style={{ color: C.red, fontWeight: '700' }}>Production protégée. </Text>
                Enregistrer un fichier, annuler des modifications ou faire un git reset demandera Face ID.
              </Text>
            </View>
          )}

          <SectionLabel>Dossier de projet par défaut</SectionLabel>
          <Card style={{ paddingVertical: 4 }}>
            <TextInput value={path} onChangeText={setPath} autoCapitalize="none" autoCorrect={false} placeholder="/var/www/api" placeholderTextColor={C.dim} style={{ color: C.text, fontFamily: mono, paddingVertical: 10 }} />
          </Card>

          <Button title="Tester la connexion" variant="ghost" style={{ marginTop: 20 }} onPress={runTest} icon={test?.state === 'running' ? <ActivityIndicator size="small" color={C.text} /> : undefined} />
          {test?.state === 'ok' && (
            <Mono style={{ color: C.green, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
              ✓ OK · {test.latencyMs} ms · empreinte {test.fingerprint}
            </Mono>
          )}
          {test?.state === 'error' && <Mono style={{ color: C.red, fontSize: 11, textAlign: 'center', marginTop: 8 }}>✗ {test.message}</Mono>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
