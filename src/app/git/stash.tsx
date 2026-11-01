import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, Mono, s, Sheet, SheetHeader } from '@/components/ui';
import { ago, git, type Stash } from '@/lib/git';
import { sq } from '@/lib/ssh';
import { act, useGit } from '@/store/git';
import { C } from '@/theme';

export default function StashSheet() {
  const g = useGit();
  const list = g?.stashes ?? [];
  const dirty = (g?.status?.files.length ?? 0) > 0;

  function drop(st: Stash) {
    Alert.alert(`Supprimer ${st.ref} ?`, st.msg, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => act((repo) => git(repo, `stash drop ${sq(st.ref)}`)) },
    ]);
  }

  const btn = (label: string, onPress: () => void, color = C.text) => (
    <Pressable onPress={onPress} hitSlop={6} style={{ backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  return (
    <Sheet>
      <SheetHeader title="Remises (stash)" subtitle={<Text style={s.muted}>{g?.status?.branch ?? ''}</Text>} />
      <Button
        title="Mettre de côté les modifications"
        style={{ marginBottom: 16, opacity: dirty ? 1 : 0.5 }}
        onPress={() => dirty && act((repo) => git(repo, `stash push -u -m ${sq(`hop: ${new Date().toLocaleString('fr-FR')}`)}`))}
      />
      <View style={{ gap: 10 }}>
        {!list.length && <Text style={[s.muted, { textAlign: 'center', marginTop: 20 }]}>Aucune remise.</Text>}
        {list.map((st) => (
          <Card key={st.ref} style={{ backgroundColor: C.surface2 }}>
            <View style={[s.row, { gap: 6 }]}>
              <Mono style={{ color: C.orange, fontSize: 12 }}>{st.ref}</Mono>
              <Text style={{ color: C.dim, fontSize: 11 }}>{ago(st.time)}</Text>
            </View>
            <Text style={{ color: C.text, marginTop: 4 }}>{st.msg}</Text>
            <View style={[s.row, { gap: 8, marginTop: 10 }]}>
              {btn('Appliquer', () => act((repo) => git(repo, `stash apply ${sq(st.ref)}`)))}
              {btn('Pop', () => act((repo) => git(repo, `stash pop ${sq(st.ref)}`)), C.accent)}
              <View style={{ flex: 1 }} />
              {btn('Supprimer', () => drop(st), C.red)}
            </View>
          </Card>
        ))}
      </View>
    </Sheet>
  );
}
