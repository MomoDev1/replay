import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Dot, Mono, Radio, s, SectionLabel, Segmented } from '@/components/ui';
import { getKnownHost, setKnownHost } from '@/lib/db';
import { asSshError, credentialsFor, ssh } from '@/lib/ssh';
import type { AuthMethod } from '@/lib/types';
import { useServer, useServers } from '@/store/servers';
import { C, envColor, mono, type Env } from '@/theme';

function Field({ label, value, onChange, monoFont, flex, keyboardType, placeholder }: { label: string; value: string; onChange: (v: string) => void; monoFont?: boolean; flex?: number; keyboardType?: 'number-pad'; placeholder?: string }) {
  return (
    <View style={[s.row, { flex, paddingHorizontal: 14, paddingVertical: 4, gap: 12 }]}>
      <Text style={{ color: C.muted, width: label.length > 6 ? undefined : 70 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} autoCapitalize="none" autoCorrect={false} keyboardType={keyboardType} placeholder={placeholder} placeholderTextColor={C.dim} style={{ flex: 1, color: C.text, paddingVertical: 10, fontFamily: monoFont ? mono : undefined }} />
    </View>
  );
}

type Test = { state: 'running' } | { state: 'ok'; latencyMs: number; fingerprint: string } | { state: 'error'; message: string };

export default function ServerForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useServer(id);
  const { keys, saveServer, generateKey } = useServers();
  const db = useSQLiteContext();

  const [name, setName] = useState(existing?.name ?? '');
  const [host, setHost] = useState(existing?.host ?? '');
  const [port, setPort] = useState(String(existing?.port ?? 22));
  const [user, setUser] = useState(existing?.user ?? '');
  const [auth, setAuth] = useState<AuthMethod>(existing?.auth ?? 'key');
  const [pickedKey, setKeyId] = useState<string | null>(existing?.keyId ?? null);
  const keyId = pickedKey ?? keys[0]?.id ?? null;
  const [password, setPassword] = useState('');
  const [env, setEnv] = useState<Env>(existing?.env ?? 'dev');
  const [path, setPath] = useState(existing?.path ?? '');
  const [test, setTest] = useState<Test | null>(null);
  const [busy, setBusy] = useState(false);

  const portNum = Number(port);
  const problems = [
    !host.trim() && 'Hôte requis',
    !user.trim() && 'Utilisateur requis',
    !(Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535) && 'Port invalide (1–65535)',
    auth === 'key' && !keyId && 'Choisis ou génère une clé SSH',
    auth === 'password' && !existing && !password && 'Mot de passe requis',
  ].filter(Boolean) as string[];

  function input() {
    return { name: name.trim() || host.trim(), host: host.trim(), port: portNum, user: user.trim(), env, auth, keyId, path: path.trim() };
  }

  async function runTest() {
    if (problems.length) return Alert.alert('Formulaire incomplet', problems.join('\n'));
    setTest({ state: 'running' });
    let sid: string | null = null;
    try {
      const creds = await credentialsFor({ id: existing?.id ?? '', user: user.trim(), auth, keyId }, auth === 'password' && password ? password : undefined);
      const r = await ssh().connect({ host: host.trim(), port: portNum, knownFingerprint: await getKnownHost(db, host.trim(), portNum) });
      sid = r.sessionId;
      await ssh().authenticate(sid, creds);
      setTest({ state: 'ok', latencyMs: r.latencyMs, fingerprint: r.fingerprint });
    } catch (e) {
      setTest({ state: 'error', message: asSshError(e).message });
    } finally {
      if (sid) ssh().disconnect(sid).catch(() => {});
    }
  }

  async function save() {
    if (problems.length) return Alert.alert('Formulaire incomplet', problems.join('\n'));
    setBusy(true);
    try {
      const data = input();
      await saveServer(data, { id: existing?.id, password: auth === 'password' ? password : undefined });
      // The user just saw this fingerprint while testing: treat it as trusted.
      if (test?.state === 'ok') await setKnownHost(db, data.host, data.port, test.fingerprint);
      router.back();
    } catch (e) {
      Alert.alert('Enregistrement impossible', asSshError(e).message);
    } finally {
      setBusy(false);
    }
  }

  async function newKey() {
    try {
      const k = await generateKey(`relay_ed25519${keys.length ? `_${keys.length + 1}` : ''}`);
      setKeyId(k.id);
    } catch (e) {
      Alert.alert('Génération impossible', asSshError(e).message);
    }
  }

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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
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
              <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder={existing ? 'Inchangé' : 'Mot de passe'} placeholderTextColor={C.dim} style={{ color: C.text, padding: 14 }} />
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
