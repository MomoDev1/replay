import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';

import { Button, Card, Mono, s, Sheet, SheetHeader } from '@/components/ui';
import { bitbucketWhoAmI, getCreds, githubWhoAmI, setBitbucketCreds, setGithubCreds } from '@/lib/forge';
import { C, mono } from '@/theme';

const input = { backgroundColor: C.surface2, color: C.text, borderRadius: 8, padding: 10, fontFamily: mono, fontSize: 13 } as const;

type Saved = { label: string } | null;

function Status({ saved }: { saved: Saved | undefined }) {
  if (saved === undefined) return <ActivityIndicator size="small" color={C.muted} />;
  return <Text style={{ color: saved ? C.green : C.dim, fontSize: 12, fontWeight: '600' }}>{saved ? `Connecté · ${saved.label}` : 'Non configuré'}</Text>;
}

export default function Accounts() {
  const [gh, setGh] = useState<Saved | undefined>();
  const [bb, setBb] = useState<Saved | undefined>();
  const [ghToken, setGhToken] = useState('');
  const [bbEmail, setBbEmail] = useState('');
  const [bbToken, setBbToken] = useState('');
  const [busy, setBusy] = useState<'gh' | 'bb' | null>(null);

  useEffect(() => {
    getCreds('github').then((c) => setGh(c ? { label: 'jeton enregistré' } : null));
    getCreds('bitbucket').then((c) => {
      setBb(c ? { label: c.email } : null);
      if (c) setBbEmail(c.email);
    });
  }, []);

  async function saveGh() {
    const token = ghToken.trim();
    if (!token) return;
    setBusy('gh');
    try {
      const login = await githubWhoAmI(token);
      await setGithubCreds({ token });
      setGh({ label: login });
      setGhToken('');
    } catch (e) {
      Alert.alert('GitHub', (e as Error).message);
    }
    setBusy(null);
  }

  async function saveBb() {
    const email = bbEmail.trim();
    const token = bbToken.trim();
    if (!email || !token) return;
    setBusy('bb');
    try {
      const who = await bitbucketWhoAmI(email, token);
      await setBitbucketCreds({ email, token });
      setBb({ label: `${who} (${email})` });
      setBbToken('');
    } catch (e) {
      Alert.alert('Bitbucket', (e as Error).message);
    }
    setBusy(null);
  }

  function forget(which: 'gh' | 'bb') {
    Alert.alert('Supprimer le compte ?', 'Le jeton sera effacé de cet appareil.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          if (which === 'gh') {
            await setGithubCreds(null);
            setGh(null);
          } else {
            await setBitbucketCreds(null);
            setBb(null);
          }
        },
      },
    ]);
  }

  return (
    <Sheet>
      <SheetHeader title="Comptes Git" subtitle={<Text style={s.muted}>Pour gérer les pull requests GitHub et Bitbucket</Text>} />
      <View style={{ gap: 14 }}>
        <Card style={{ backgroundColor: C.surface2, gap: 8 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.h2}>GitHub</Text>
            <Status saved={gh} />
          </View>
          <Text style={[s.muted, { fontSize: 12 }]}>
            Jeton personnel (fine-grained) avec accès au dépôt : Pull requests (lecture/écriture), Contents (lecture/écriture pour merger), Commit statuses et Checks (lecture). Un jeton classique avec la portée « repo » marche aussi.
          </Text>
          <TextInput value={ghToken} onChangeText={setGhToken} placeholder={gh ? 'Nouveau jeton (remplace l’actuel)' : 'github_pat_…'} placeholderTextColor={C.dim} autoCapitalize="none" autoCorrect={false} secureTextEntry style={[input, { backgroundColor: C.surface }]} />
          <View style={[s.row, { gap: 8 }]}>
            <Button title={busy === 'gh' ? 'Vérification…' : 'Vérifier et enregistrer'} style={{ flex: 1, opacity: ghToken.trim() ? 1 : 0.5 }} onPress={saveGh} />
            {gh && <Button title="Supprimer" variant="outlineDanger" onPress={() => forget('gh')} />}
          </View>
          <Text style={{ color: C.accent, fontSize: 12 }} onPress={() => WebBrowser.openBrowserAsync('https://github.com/settings/personal-access-tokens/new')}>
            Créer un jeton sur github.com →
          </Text>
        </Card>

        <Card style={{ backgroundColor: C.surface2, gap: 8 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.h2}>Bitbucket Cloud</Text>
            <Status saved={bb} />
          </View>
          <Text style={[s.muted, { fontSize: 12 }]}>
            E-mail de ton compte Atlassian + jeton d’API Bitbucket avec les portées : <Mono style={{ fontSize: 11, color: C.muted }}>read:user, read:repository, read:pullrequest, write:pullrequest</Mono> (toutes en « :bitbucket »).
          </Text>
          <TextInput value={bbEmail} onChangeText={setBbEmail} placeholder="toi@exemple.com" placeholderTextColor={C.dim} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={[input, { backgroundColor: C.surface }]} />
          <TextInput value={bbToken} onChangeText={setBbToken} placeholder={bb ? 'Nouveau jeton (remplace l’actuel)' : 'Jeton d’API'} placeholderTextColor={C.dim} autoCapitalize="none" autoCorrect={false} secureTextEntry style={[input, { backgroundColor: C.surface }]} />
          <View style={[s.row, { gap: 8 }]}>
            <Button title={busy === 'bb' ? 'Vérification…' : 'Vérifier et enregistrer'} style={{ flex: 1, opacity: bbEmail.trim() && bbToken.trim() ? 1 : 0.5 }} onPress={saveBb} />
            {bb && <Button title="Supprimer" variant="outlineDanger" onPress={() => forget('bb')} />}
          </View>
          <Text style={{ color: C.accent, fontSize: 12 }} onPress={() => WebBrowser.openBrowserAsync('https://id.atlassian.com/manage-profile/security/api-tokens')}>
            Créer un jeton d’API Bitbucket →
          </Text>
        </Card>

        <Text style={[s.muted, { fontSize: 11, textAlign: 'center' }]}>Les jetons sont chiffrés dans le trousseau de l’appareil et envoyés uniquement à api.github.com / api.bitbucket.org.</Text>
      </View>
    </Sheet>
  );
}
