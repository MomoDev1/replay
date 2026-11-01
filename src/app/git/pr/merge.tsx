import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import { Button, Card, Mono, Radio, s, Sheet, SheetHeader } from '@/components/ui';
import { prAct, usePr } from '@/store/pr';
import { C } from '@/theme';

export default function MergeSheet() {
  const st = usePr();
  const pr = st?.pr ?? null;
  const [strategy, setStrategy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [deleteSource, setDeleteSource] = useState(true);
  const [busy, setBusy] = useState(false);

  if (!pr) {
    return (
      <Sheet>
        <SheetHeader title="Merge" />
        <ActivityIndicator color={C.muted} />
      </Sheet>
    );
  }

  const chosen = strategy ?? pr.defaultStrategy;
  const unapproved = !pr.reviewers.some((r) => r.state === 'approved');
  const failing = st!.checks.filter((c) => c.state === 'failure').length;
  const running = st!.checks.filter((c) => c.state === 'pending').length;

  async function merge() {
    setBusy(true);
    const ok = await prAct((p, cur) => p.merge(cur, { strategy: chosen, message, deleteSource }), 'Merge impossible');
    setBusy(false);
    if (ok) {
      router.back();
      Alert.alert('Pull request fusionnée', `#${pr!.id} → ${pr!.target}`);
    }
  }

  function confirm() {
    const warn = [unapproved && 'aucune approbation', failing && `${failing} check(s) en échec`, running && `${running} check(s) en cours`].filter(Boolean);
    if (!warn.length) return merge();
    Alert.alert('Merger quand même ?', `Attention : ${warn.join(', ')}.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Merger', style: 'destructive', onPress: merge },
    ]);
  }

  return (
    <Sheet>
      <SheetHeader
        title={`Merger #${pr.id}`}
        subtitle={
          <Mono style={{ fontSize: 12, color: C.muted }} numberOfLines={1}>
            {pr.source} → {pr.target}
          </Mono>
        }
      />
      <View style={{ gap: 10, paddingBottom: 16 }}>
        <Text style={s.section}>STRATÉGIE</Text>
        <Card style={{ padding: 0, backgroundColor: C.surface2 }}>
          {pr.strategies.map((m, i) => (
            <Pressable key={m.value} onPress={() => setStrategy(m.value)} style={[s.row, { gap: 12, padding: 12, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
              <Radio on={chosen === m.value} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '600' }}>{m.label}</Text>
                <Text style={[s.muted, { fontSize: 12 }]}>{m.hint}</Text>
              </View>
            </Pressable>
          ))}
        </Card>

        <Text style={[s.section, { marginTop: 6 }]}>MESSAGE DE COMMIT</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="Laisser vide pour le message par défaut"
          placeholderTextColor={C.dim}
          style={{ backgroundColor: C.surface2, color: C.text, borderRadius: 8, padding: 10, fontSize: 13, minHeight: 70, textAlignVertical: 'top' }}
        />

        {pr.sameRepo && !pr.autoDeleteSource && (
          <Pressable onPress={() => setDeleteSource(!deleteSource)} style={[s.row, { gap: 10, paddingVertical: 6 }]}>
            <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: deleteSource ? C.accent : C.dim, backgroundColor: deleteSource ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {deleteSource && <Check size={13} color="#fff" strokeWidth={3} />}
            </View>
            <Text style={{ color: C.text, flex: 1 }}>
              Supprimer la branche <Mono style={{ color: C.accent }}>{pr.source}</Mono> après le merge
            </Text>
          </Pressable>
        )}
        {pr.autoDeleteSource && <Text style={[s.muted, { fontSize: 12 }]}>La branche source sera supprimée automatiquement (réglage du dépôt).</Text>}

        {(unapproved || failing > 0 || running > 0) && (
          <Card style={{ borderColor: C.orange + '55', backgroundColor: C.orangeBg, gap: 2 }}>
            {unapproved && <Text style={{ color: C.orange, fontSize: 12 }}>• Aucune approbation pour l’instant</Text>}
            {failing > 0 && <Text style={{ color: C.orange, fontSize: 12 }}>• {failing} check(s) en échec</Text>}
            {running > 0 && <Text style={{ color: C.orange, fontSize: 12 }}>• {running} check(s) encore en cours</Text>}
          </Card>
        )}
      </View>
      <Button title={busy ? 'Merge en cours…' : `Merger dans ${pr.target}`} onPress={busy ? undefined : confirm} style={{ opacity: busy ? 0.6 : 1 }} />
    </Sheet>
  );
}
