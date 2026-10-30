import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Dot, Mono, Radio, s, SectionLabel, Segmented } from '@/components/ui';
import { sshKeys } from '@/data/mock';
import { C, envColor, mono, type Env } from '@/theme';

function Field({ label, value, onChange, monoFont, flex }: { label: string; value: string; onChange: (v: string) => void; monoFont?: boolean; flex?: number }) {
  return (
    <View style={[s.row, { flex, paddingHorizontal: 14, paddingVertical: 4, gap: 12 }]}>
      <Text style={{ color: C.muted, width: label.length > 6 ? undefined : 70 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} autoCapitalize="none" style={{ flex: 1, color: C.text, paddingVertical: 10, fontFamily: monoFont ? mono : undefined }} />
    </View>
  );
}

export default function NewServer() {
  const [name, setName] = useState('api-prod-03');
  const [host, setHost] = useState('51.15.82.12');
  const [port, setPort] = useState('22');
  const [user, setUser] = useState('deploy');
  const [auth, setAuth] = useState<'key' | 'password'>('key');
  const [key, setKey] = useState(sshKeys[0].name);
  const [env, setEnv] = useState<Env>('prod');
  const [path, setPath] = useState('/var/www/api');
  const [tested, setTested] = useState(false);

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: C.bg }]}>
      <View style={[s.row, { justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: C.border }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: C.muted, fontSize: 16 }}>Annuler</Text>
        </Pressable>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 16 }}>Nouveau serveur</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: C.accent, fontWeight: '700', fontSize: 16 }}>Enregistrer</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <SectionLabel>Connexion</SectionLabel>
        <Card style={{ padding: 0 }}>
          <Field label="Nom" value={name} onChange={setName} monoFont />
          <View style={s.sep} />
          <Field label="Hôte" value={host} onChange={setHost} monoFont />
          <View style={s.sep} />
          <View style={s.row}>
            <Field label="Port" value={port} onChange={setPort} monoFont flex={1} />
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border }} />
            <Field label="Utilisateur" value={user} onChange={setUser} monoFont flex={1.6} />
          </View>
        </Card>

        <SectionLabel>Authentification</SectionLabel>
        <Segmented options={[{ value: 'key', label: 'Clé SSH' }, { value: 'password', label: 'Mot de passe' }]} value={auth} onChange={setAuth} />
        {auth === 'key' ? (
          <Card style={{ padding: 0, marginTop: 10 }}>
            {sshKeys.map((k, i) => (
              <View key={k.name}>
                {i > 0 && <View style={s.sep} />}
                <Pressable onPress={() => setKey(k.name)} style={[s.row, { gap: 12, padding: 14 }]}>
                  <Radio on={key === k.name} />
                  <View>
                    <Mono>{k.name}</Mono>
                    <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{k.desc}</Text>
                  </View>
                </Pressable>
              </View>
            ))}
            <View style={s.sep} />
            <View style={s.row}>
              <Pressable style={{ flex: 1, padding: 12, alignItems: 'center' }}>
                <Text style={{ color: C.accent, fontWeight: '600' }}>Générer une clé</Text>
              </Pressable>
              <Pressable style={{ flex: 1, padding: 12, alignItems: 'center' }}>
                <Text style={{ color: C.accent, fontWeight: '600' }}>Importer…</Text>
              </Pressable>
            </View>
          </Card>
        ) : (
          <Card style={{ padding: 0, marginTop: 10 }}>
            <TextInput secureTextEntry placeholder="Mot de passe" placeholderTextColor={C.dim} style={{ color: C.text, padding: 14 }} />
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
              Chaque déploiement demandera le nom du serveur ou Face ID.
            </Text>
          </View>
        )}

        <SectionLabel>Dossier de projet par défaut</SectionLabel>
        <Card style={[s.row, { paddingVertical: 4 }]}>
          <TextInput value={path} onChangeText={setPath} autoCapitalize="none" style={{ flex: 1, color: C.text, fontFamily: mono, paddingVertical: 10 }} />
          <Text style={{ color: C.accent }}>Parcourir</Text>
        </Card>

        <Button title="Tester la connexion" variant="ghost" style={{ marginTop: 20 }} onPress={() => setTested(true)} />
        {tested && <Mono style={{ color: C.green, fontSize: 11, textAlign: 'center', marginTop: 8 }}>✓ OK · 41 ms · empreinte SHA256:Xk9f…q2Q</Mono>}
      </ScrollView>
    </SafeAreaView>
  );
}
