import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { router, useIsFocused } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';

import { forgetKnownHost, listKnownHosts } from '@/lib/db';
import { asSshError } from '@/lib/ssh';
import { useServers } from '@/store/servers';
import { FONT_MAX, FONT_MIN, setPrefs, termFont, usePrefs } from '@/store/prefs';
import { getIdleTimeout, setIdleTimeout, type IdleTimeout } from '@/store/session';
import { alpha, T } from '@/tablet/theme';
import { Grid, Label, Seg, st, TabletScreen, Tx } from '@/tablet/ui';

type Cat = 'security' | 'keys' | 'terminal' | 'git' | 'hosts' | 'about';

/** `SHA256:Xk9f…q2Q` */
const shortFp = (fp: string) => {
  const [algo, rest] = fp.includes(':') ? [fp.slice(0, fp.indexOf(':') + 1), fp.slice(fp.indexOf(':') + 1)] : ['', fp];
  return rest.length > 10 ? `${algo}${rest.slice(0, 4)}…${rest.slice(-3)}` : fp;
};

function Toggle({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityLabel={label} aria-checked={on} style={{ width: 51, height: 31, borderRadius: 16, padding: 2, backgroundColor: on ? T.green : T.chip, alignItems: on ? 'flex-end' : 'flex-start' }}>
      <View style={{ width: 27, height: 27, borderRadius: 14, backgroundColor: '#fff' }} />
    </Pressable>
  );
}

function Section({ label, right, children, onLayout }: { label: string; right?: ReactNode; children: ReactNode; onLayout: (y: number) => void }) {
  return (
    <View style={{ gap: 8 }} onLayout={(e) => onLayout(e.nativeEvent.layout.y)}>
      <View style={[st.row, { justifyContent: 'space-between' }]}>
        <Label>{label}</Label>
        {right}
      </View>
      {children}
    </View>
  );
}

const box = { backgroundColor: T.card, borderWidth: 1, borderColor: T.cardLine, borderRadius: 16, overflow: 'hidden' as const };
const row = { minHeight: 60, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 18, borderBottomWidth: 1, borderColor: T.cardLine };

export function TabletSettings() {
  const db = useSQLiteContext();
  const focused = useIsFocused();
  const prefs = usePrefs();
  const { keys, servers, generateKey } = useServers();
  const [timeout, setTimeoutVal] = useState<IdleTimeout>(getIdleTimeout);
  const [hosts, setHosts] = useState<{ host: string; port: number; fingerprint: string }[]>([]);
  const [cat, setCat] = useState<Cat>('security');
  const [ys, setYs] = useState<Partial<Record<Cat, number>>>({});
  const scroller = useRef<ScrollViewInstance>(null);
  const font = termFont(prefs, true);

  useEffect(() => {
    if (focused) listKnownHosts(db).then(setHosts);
  }, [db, focused]);

  const usage = (id: string) => servers.filter((sv) => sv.auth === 'key' && sv.keyId === id).length;

  async function toggleLock() {
    if (prefs.biometricLock) return setPrefs({ biometricLock: false });
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Activer le verrouillage de Hop', cancelLabel: 'Annuler' });
    if (res.success) setPrefs({ biometricLock: true });
    else if (res.error === 'not_available' || res.error === 'not_enrolled' || res.error === 'passcode_not_set') Alert.alert('Face ID indisponible', 'Configure Face ID, l’empreinte ou un code sur cet appareil pour verrouiller Hop.');
  }

  async function newKey() {
    try {
      const k = await generateKey(`relay_ed25519${keys.length ? `_${keys.length + 1}` : ''}`);
      router.push(`/key/${k.id}`);
    } catch (e) {
      Alert.alert('Génération impossible', asSshError(e).message);
    }
  }

  function forget(h: { host: string; port: number }) {
    Alert.alert('Oublier cette empreinte ?', `${h.host}:${h.port} — la prochaine connexion demandera de vérifier à nouveau la clé du serveur.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Oublier', style: 'destructive', onPress: async () => (await forgetKnownHost(db, h.host, h.port), setHosts(await listKnownHosts(db))) },
    ]);
  }

  const cats: { k: Cat; t: string; s: string }[] = [
    { k: 'security', t: 'Sécurité', s: prefs.biometricLock ? 'Face ID' : '' },
    { k: 'keys', t: 'Clés SSH', s: String(keys.length) },
    { k: 'terminal', t: 'Terminal & apparence', s: `${font} pt` },
    { k: 'git', t: 'Comptes Git', s: '' },
    { k: 'hosts', t: 'known_hosts', s: String(hosts.length) },
    { k: 'about', t: 'À propos', s: `v${Constants.expoConfig?.version ?? '?'}` },
  ];

  const at = (k: Cat) => (y: number) => setYs((p) => (p[k] === y ? p : { ...p, [k]: y }));

  return (
    <TabletScreen>
      <View style={{ flexGrow: 0, flexShrink: 1, flexBasis: 280, minWidth: 220, borderRightWidth: 1, borderColor: T.line, paddingVertical: 16, paddingHorizontal: 12, gap: 4 }}>
        <Tx w={700} style={[st.h1, { paddingHorizontal: 8, paddingBottom: 12 }]}>
          Réglages
        </Tx>
        {cats.map((c) => {
          const on = c.k === cat;
          return (
            <Pressable
              key={c.k}
              onPress={() => {
                setCat(c.k);
                scroller.current?.scrollTo({ y: Math.max(0, (ys[c.k] ?? 0) - 20), animated: true });
              }}
              style={[st.row, { minHeight: 50, borderRadius: 12, gap: 12, paddingHorizontal: 12, backgroundColor: on ? T.field : 'transparent' }]}>
              <Tx style={{ flex: 1, fontSize: 15, color: on ? T.text : T.text2 }}>{c.t}</Tx>
              <Tx style={{ fontSize: 12, color: T.dim }}>{c.s}</Tx>
            </Pressable>
          );
        })}
      </View>

      <ScrollView ref={scroller} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: 28, gap: 22 }}>
        <Section label="SÉCURITÉ" onLayout={at('security')}>
          <View style={box}>
            <View style={row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Tx style={{ fontSize: 16 }}>Verrouillage Face ID</Tx>
                <Tx style={{ fontSize: 12.5, color: T.dim }}>À l’ouverture et au retour dans l’app</Tx>
              </View>
              <Toggle on={prefs.biometricLock} onPress={toggleLock} label="Verrouillage Face ID" />
            </View>
            <View style={[row, { gap: 16, paddingVertical: 10, flexWrap: 'wrap' }]}>
              <Tx style={{ flex: 1, minWidth: 200, fontSize: 16 }}>Déconnexion SSH automatique</Tx>
              <Seg
                itemWidth={72}
                style={{ backgroundColor: T.bg }}
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
            <Pressable
              onPress={() => Alert.alert('Confirmation production', 'Sur un serveur prod : saisie du nom du serveur ou Face ID avant un déploiement ou un rollback ; Face ID avant d’enregistrer un fichier, d’annuler des modifications ou de faire un git reset.')}
              style={[row, { borderBottomWidth: 0 }]}>
              <Tx style={{ flex: 1, fontSize: 16 }}>Confirmation production</Tx>
              <Tx style={{ fontSize: 14, color: T.muted }}>Nom du serveur + Face ID ›</Tx>
            </Pressable>
          </View>
        </Section>

        <Section
          label="CLÉS SSH"
          onLayout={at('keys')}
          right={
            <View style={[st.row, { gap: 16 }]}>
              <Pressable onPress={newKey} hitSlop={8}>
                <Tx w={600} style={{ fontSize: 14, color: T.blue }}>
                  + Générer
                </Tx>
              </Pressable>
              <Pressable onPress={() => router.push('/key/import')} hitSlop={8}>
                <Tx w={600} style={{ fontSize: 14, color: T.blue }}>
                  Importer…
                </Tx>
              </Pressable>
            </View>
          }>
          {keys.length ? (
            <Grid min={220}>
              {keys.map((k) => {
                const n = usage(k.id);
                return (
                  <Pressable key={k.id} onPress={() => router.push(`/key/${k.id}`)} style={({ pressed }) => [box, { paddingVertical: 14, paddingHorizontal: 16, gap: 6, backgroundColor: pressed ? T.field : T.card }]}>
                    <View style={[st.row, { justifyContent: 'space-between', gap: 8 }]}>
                      <Tx mono style={{ fontSize: 15, flexShrink: 1 }} numberOfLines={1}>
                        {k.name}
                      </Tx>
                      <Tx style={{ fontSize: 12, color: T.muted }}>
                        {n} serveur{n > 1 ? 's' : ''}
                      </Tx>
                    </View>
                    <Tx mono style={{ fontSize: 11.5, color: T.dim }}>
                      {shortFp(k.fingerprint)}
                    </Tx>
                    <Tx style={{ fontSize: 12, color: k.type.includes('ed25519') ? T.green : T.muted }}>{k.type}</Tx>
                  </Pressable>
                );
              })}
            </Grid>
          ) : (
            <View style={[box, { padding: 16 }]}>
              <Tx style={{ fontSize: 14, color: T.muted }}>Aucune clé. Génère-en une ou importe une clé existante.</Tx>
            </View>
          )}
        </Section>

        <Section label="TERMINAL & APPARENCE" onLayout={at('terminal')}>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <View style={[box, { flexGrow: 1, flexShrink: 1, flexBasis: 260, paddingVertical: 14, paddingHorizontal: 16, gap: 12 }]}>
              <View style={[st.row, { gap: 10 }]}>
                <Tx style={{ flex: 1, fontSize: 16 }}>Taille de police</Tx>
                <Pressable onPress={() => setPrefs({ termFontSize: Math.max(FONT_MIN, font - 1) })} accessibilityLabel="Réduire" style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: T.chip, alignItems: 'center', justifyContent: 'center' }}>
                  <Tx style={{ fontSize: 18 }}>−</Tx>
                </Pressable>
                <Tx mono style={{ width: 26, textAlign: 'center' }}>
                  {font}
                </Tx>
                <Pressable onPress={() => setPrefs({ termFontSize: Math.min(FONT_MAX, font + 1) })} accessibilityLabel="Agrandir" style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: T.chip, alignItems: 'center', justifyContent: 'center' }}>
                  <Tx style={{ fontSize: 18 }}>+</Tx>
                </Pressable>
              </View>
              <View style={{ backgroundColor: T.term, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Tx mono style={{ fontSize: font, color: T.text2 }} numberOfLines={1}>
                  <Tx mono style={{ fontSize: font, color: T.green }}>
                    deploy@api
                  </Tx>
                  :
                  <Tx mono style={{ fontSize: font, color: T.blue }}>
                    ~
                  </Tx>
                  $ uptime
                </Tx>
              </View>
            </View>
            <View style={[box, { flexGrow: 1, flexShrink: 1, flexBasis: 260, paddingVertical: 14, paddingHorizontal: 16, gap: 12 }]}>
              <Tx style={{ fontSize: 16 }}>Thème</Tx>
              <Grid columns={3} gap={8}>
                {[
                  <View key="d" style={{ height: 64, borderRadius: 12, backgroundColor: T.bg, borderWidth: 2, borderColor: T.blue, justifyContent: 'flex-end', padding: 8 }}>
                    <Tx w={600} style={{ fontSize: 12.5 }}>
                      Sombre
                    </Tx>
                  </View>,
                  <View key="l" style={{ height: 64, borderRadius: 12, backgroundColor: '#F6F6F4', borderWidth: 1, borderColor: T.chip, justifyContent: 'space-between', padding: 8, opacity: 0.45 }}>
                    <Tx style={{ fontSize: 10, color: '#16181B' }}>Bientôt</Tx>
                    <Tx w={600} style={{ fontSize: 12.5, color: '#16181B' }}>
                      Clair
                    </Tx>
                  </View>,
                  <View key="s" style={{ height: 64, borderRadius: 12, backgroundColor: T.field, borderWidth: 1, borderColor: T.chip, justifyContent: 'space-between', padding: 8, opacity: 0.45 }}>
                    <Tx style={{ fontSize: 10, color: T.muted }}>Bientôt</Tx>
                    <Tx w={600} style={{ fontSize: 12.5 }}>
                      Système
                    </Tx>
                  </View>,
                ]}
              </Grid>
            </View>
          </View>
        </Section>

        <Section label="COMPTES GIT" onLayout={at('git')}>
          <Pressable onPress={() => router.push('/git/accounts')} style={[box, row, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Tx style={{ fontSize: 16 }}>GitHub et Bitbucket</Tx>
              <Tx style={{ fontSize: 12.5, color: T.dim }}>Jetons d’API pour gérer les pull requests</Tx>
            </View>
            <Tx style={{ fontSize: 14, color: T.muted }}>›</Tx>
          </Pressable>
        </Section>

        <Section label="KNOWN_HOSTS" onLayout={at('hosts')}>
          <View style={box}>
            {hosts.map((h, i) => (
              <View key={`${h.host}:${h.port}`} style={[row, { minHeight: 52, borderBottomWidth: i === hosts.length - 1 ? 0 : 1 }]}>
                <Tx mono style={{ fontSize: 14, flexShrink: 1 }} numberOfLines={1}>
                  {h.host}
                  {h.port !== 22 ? `:${h.port}` : ''}
                </Tx>
                <Tx mono style={{ flex: 1, fontSize: 11.5, color: T.dim }} numberOfLines={1}>
                  {shortFp(h.fingerprint)}
                </Tx>
                <Pressable onPress={() => forget(h)} hitSlop={8}>
                  <Tx style={{ fontSize: 13, color: T.red }}>Oublier</Tx>
                </Pressable>
              </View>
            ))}
            {!hosts.length && (
              <View style={[row, { borderBottomWidth: 0 }]}>
                <Tx style={{ fontSize: 14, color: T.dim }}>Aucune empreinte de serveur enregistrée.</Tx>
              </View>
            )}
          </View>
        </Section>

        <Section label="À PROPOS" onLayout={at('about')}>
          <View style={[box, row, { borderBottomWidth: 0 }]}>
            <Tx style={{ flex: 1, fontSize: 16 }}>Version</Tx>
            <Tx mono style={{ fontSize: 14, color: alpha(T.muted, 1) }}>
              v{Constants.expoConfig?.version ?? '?'}
            </Tx>
          </View>
        </Section>
      </ScrollView>
    </TabletScreen>
  );
}
