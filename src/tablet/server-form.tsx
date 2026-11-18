import { router } from 'expo-router';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useServerForm } from '@/hooks/use-server-form';
import { alpha, envTone, monoF, T } from '@/tablet/theme';
import { Dot, Grid, Label, Seg, st, Tx } from '@/tablet/ui';
import type { Env } from '@/theme';

function Field({ label, value, onChange, placeholder, numeric, secure }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; secure?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Tx style={{ fontSize: 13, color: T.muted }}>{label}</Tx>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={T.faint}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        secureTextEntry={secure}
        keyboardType={numeric ? 'number-pad' : 'default'}
        style={[{ height: 50, borderRadius: 12, backgroundColor: T.bg, borderWidth: 1, borderColor: T.chip, paddingHorizontal: 14, fontSize: 15, color: T.text }, monoF(400)]}
      />
    </View>
  );
}

const ENVS: { value: Env; label: string }[] = [
  { value: 'dev', label: 'Dev' },
  { value: 'staging', label: 'Staging' },
  { value: 'prod', label: 'Prod' },
];

/** Add / edit server, drawn as a centered card over a dimmed backdrop (TL02). */
export function TabletServerForm() {
  const f = useServerForm();
  const insets = useSafeAreaInsets();

  function addKey() {
    Alert.alert('Clé SSH', 'ED25519 recommandé : la clé est générée sur cet appareil.', [
      { text: 'Générer', onPress: f.newKey },
      { text: 'Importer…', onPress: () => router.push('/key/import') },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', paddingTop: 40 + insets.top, paddingBottom: 40 + insets.bottom, paddingHorizontal: 40 }}>
      <View style={{ width: '100%', maxWidth: 620, maxHeight: '100%', backgroundColor: T.card, borderWidth: 1, borderColor: T.chip, borderRadius: 24, overflow: 'hidden' }}>
        <View style={[st.row, { height: 60, justifyContent: 'space-between', paddingHorizontal: 22, borderBottomWidth: 1, borderColor: T.cardLine }]}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Tx style={{ fontSize: 16, color: T.muted }}>Annuler</Tx>
          </Pressable>
          <Tx w={600} style={{ fontSize: 17 }}>
            {f.existing ? 'Modifier le serveur' : 'Nouveau serveur'}
          </Tx>
          <Pressable onPress={f.save} disabled={f.busy} hitSlop={10}>
            <Tx w={600} style={{ fontSize: 16, color: f.problems.length ? T.faint : T.blue }}>
              Enregistrer
            </Tx>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 22, gap: 22 }} keyboardShouldPersistTaps="handled">
          <Grid min={160} gap={12}>
            {[
              <Field key="n" label="Nom" value={f.name} onChange={f.setName} placeholder="api-prod-01" />,
              <Field key="h" label="Hôte" value={f.host} onChange={f.setHost} placeholder="51.15.82.10" />,
              <Field key="p" label="Port" value={f.port} onChange={f.setPort} numeric />,
              <Field key="u" label="Utilisateur" value={f.user} onChange={f.setUser} placeholder="deploy" />,
            ]}
          </Grid>

          <View style={{ gap: 10 }}>
            <Label>AUTHENTIFICATION</Label>
            <Seg
              height={44}
              radius={12}
              fontSize={14}
              style={{ maxWidth: 340, backgroundColor: T.bg }}
              options={[
                { value: 'key', label: 'Clé SSH' },
                { value: 'password', label: 'Mot de passe' },
              ]}
              value={f.auth}
              onChange={f.setAuth}
            />
            {f.auth === 'key' ? (
              <Grid min={170} gap={8}>
                {[
                  ...f.keys.map((k) => {
                    const on = f.keyId === k.id;
                    return (
                      <Pressable key={k.id} onPress={() => f.setKeyId(k.id)} onLongPress={() => router.push(`/key/${k.id}`)} style={{ borderRadius: 14, borderWidth: on ? 1.5 : 1, borderColor: on ? T.blue : T.chip, backgroundColor: on ? alpha(T.blue, 0.1) : 'transparent', paddingVertical: 12, paddingHorizontal: 14, gap: 4 }}>
                        <Tx mono style={{ fontSize: 14 }} numberOfLines={1}>
                          {k.name}
                        </Tx>
                        <Tx style={{ fontSize: 12, color: T.muted }} numberOfLines={1}>
                          {k.type.replace(/^ssh-/, '').toUpperCase()}
                        </Tx>
                      </Pressable>
                    );
                  }),
                  <Pressable key="add" onPress={addKey} style={{ borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: T.dashed, paddingVertical: 12, paddingHorizontal: 14, gap: 4 }}>
                    <Tx w={600} style={{ fontSize: 14, color: T.blue }}>
                      + Générer / importer
                    </Tx>
                    <Tx style={{ fontSize: 12, color: T.muted }}>ED25519 recommandé</Tx>
                  </Pressable>,
                ]}
              </Grid>
            ) : (
              <View style={{ maxWidth: 340 }}>
                <Field label="Mot de passe" value={f.password} onChange={f.setPassword} placeholder={f.existing?.auth === 'password' ? 'Inchangé' : ''} secure />
              </View>
            )}
          </View>

          <View style={{ gap: 10 }}>
            <Label>ENVIRONNEMENT</Label>
            <Grid columns={3} gap={8}>
              {ENVS.map((e) => {
                const on = f.env === e.value;
                const c = envTone[e.value];
                return (
                  <Pressable key={e.value} onPress={() => f.setEnv(e.value)} style={[st.row, { height: 56, borderRadius: 13, gap: 10, paddingHorizontal: 14, borderWidth: on ? 1.5 : 1, borderColor: on ? c : T.chip, backgroundColor: on ? alpha(c, 0.12) : 'transparent' }]}>
                    <Dot color={c} size={9} />
                    <Tx w={600}>{e.label}</Tx>
                  </Pressable>
                );
              })}
            </Grid>
            {f.env === 'prod' && (
              <Tx style={{ fontSize: 13, color: T.soft }}>
                <Tx w={600} style={{ fontSize: 13, color: T.red }}>
                  Production protégée.
                </Tx>{' '}
                Nom du serveur ou Face ID requis avant chaque déploiement.
              </Tx>
            )}
          </View>

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <View style={{ flex: 1, minWidth: 220 }}>
                <Field label="Dossier de projet par défaut" value={f.path} onChange={f.setPath} placeholder="/var/www/api" />
              </View>
              <Pressable onPress={f.runTest} style={({ pressed }) => [st.row, { height: 50, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: T.btnLine, gap: 10, opacity: pressed ? 0.8 : 1 }]}>
                {f.test?.state === 'running' && <ActivityIndicator size="small" color={T.text} />}
                <Tx w={600}>Tester la connexion</Tx>
              </Pressable>
            </View>
            {f.test?.state === 'ok' && (
              <Tx mono style={{ fontSize: 12, color: T.green }}>
                ✓ OK · {f.test.latencyMs} ms · empreinte {f.test.fingerprint}
              </Tx>
            )}
            {f.test?.state === 'error' && (
              <Tx mono style={{ fontSize: 12, color: T.red }}>
                ✕ {f.test.message}
              </Tx>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
