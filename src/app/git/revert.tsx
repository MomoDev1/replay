import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Mono, Radio, s, SheetHeader } from '@/components/ui';
import { C } from '@/theme';

export default function RevertSheet() {
  const [mode, setMode] = useState<'revert' | 'reset'>('revert');

  const opt = (m: typeof mode, cmd: string, desc: string, danger?: boolean) => {
    const on = mode === m;
    const col = danger ? C.red : C.accent;
    return (
      <Pressable onPress={() => setMode(m)} style={[s.row, { gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? col : C.border, backgroundColor: on ? col + '14' : C.surface2, marginTop: 10 }]}>
        <Radio on={on} />
        <View style={{ flex: 1 }}>
          <Mono style={{ fontWeight: '700', color: danger ? C.red : C.text }}>{cmd}</Mono>
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{desc}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={s.sheet}>
      <SheetHeader title="Revenir à un commit" subtitle={<Text style={s.muted}>relay/api · main · api-prod-01</Text>} />
      <Card style={{ backgroundColor: C.surface2 }}>
        <Mono style={{ color: C.orange, fontSize: 12 }}>9c1e7b0</Mono>
        <Text style={{ color: C.text, marginTop: 2 }}>feat: export CSV des factures</Text>
        <Text style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Sarah K. · hier 17:42 · 1 commit après</Text>
      </Card>
      {opt('revert', 'git revert a41f9c2', 'Sûr : crée un nouveau commit qui annule les changements. L’historique est conservé.')}
      {opt('reset', 'git reset --hard 9c1e7b0', 'Destructif : supprime le commit et les modifications locales non commitées.', true)}
      <Button title={mode === 'revert' ? 'Créer le commit d’annulation' : 'Réinitialiser (destructif)'} variant={mode === 'revert' ? 'primary' : 'danger'} style={{ marginTop: 16 }} onPress={() => router.back()} />
      <Pressable onPress={() => router.back()} style={{ alignItems: 'center', padding: 12 }}>
        <Text style={s.muted}>Annuler</Text>
      </Pressable>
    </View>
  );
}
