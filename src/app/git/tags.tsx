import { Tag as TagIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import { Button, Card, Mono, s, Sheet, SheetHeader } from '@/components/ui';
import { ago, git, type Tag } from '@/lib/git';
import { sq } from '@/lib/ssh';
import { act, useGit } from '@/store/git';
import { C, mono } from '@/theme';

const validName = (n: string) => /^[\w.+-][\w./+-]*$/.test(n) && !n.includes('..') && !n.endsWith('/') && !n.endsWith('.lock');

export default function TagsSheet() {
  const g = useGit();
  const list = g?.tags ?? [];
  const st = g?.status;
  // Remote of the current upstream (`origin/main` → `origin`), else `origin`.
  const remote = st?.upstream?.split('/')[0] || 'origin';
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const n = name.trim();
  const exists = list.some((t) => t.name === n);
  const canCreate = !!n && validName(n) && !exists && !!st?.oid && !busy;

  async function run(key: string, fn: (repo: string) => Promise<unknown>) {
    setBusy(key);
    const ok = await act(async (repo) => {
      await fn(repo);
      return true;
    });
    setBusy(null);
    return ok;
  }

  async function create() {
    if (!canCreate) return;
    const m = msg.trim();
    const ok = await run('create', (repo) => git(repo, m ? `tag -a ${sq(n)} -m ${sq(m)}` : `tag ${sq(n)}`));
    if (ok) {
      setName('');
      setMsg('');
    }
  }

  async function push(t: Tag) {
    const ok = await run('push:' + t.name, (repo) => git(repo, `push ${sq(remote)} ${sq(`refs/tags/${t.name}`)}`, { timeoutMs: 120_000 }));
    if (ok) Alert.alert('Tag poussé', `${t.name} → ${remote}`);
  }

  function remove(t: Tag) {
    Alert.alert(`Supprimer ${t.name} ?`, 'Le tag local sera supprimé. Il reste sur le dépôt distant s’il a été poussé.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => run('del:' + t.name, (repo) => git(repo, `tag -d ${sq(t.name)}`)) },
    ]);
  }

  const btn = (key: string, label: string, onPress: () => void, color = C.text) => (
    <Pressable onPress={onPress} disabled={!!busy} hitSlop={6} style={{ backgroundColor: C.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 64, alignItems: 'center' }}>
      {busy === key ? <ActivityIndicator size="small" color={color} /> : <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{label}</Text>}
    </Pressable>
  );

  return (
    <Sheet>
      <SheetHeader title="Tags" subtitle={<Text style={s.muted}>{`${list.length} tag${list.length > 1 ? 's' : ''} · ${g?.repo ?? ''}`}</Text>} />
      <Text style={[s.section, { marginBottom: 6 }]}>{`NOUVEAU TAG SUR ${st?.oid?.slice(0, 7) ?? 'HEAD'}`}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="v1.0.0"
        placeholderTextColor={C.dim}
        style={{ backgroundColor: C.surface2, color: C.text, borderRadius: 8, padding: 10, fontFamily: mono, fontSize: 13 }}
      />
      <TextInput
        value={msg}
        onChangeText={setMsg}
        placeholder="Message (optionnel → tag annoté)"
        placeholderTextColor={C.dim}
        style={{ backgroundColor: C.surface2, color: C.text, borderRadius: 8, padding: 10, fontSize: 13, marginTop: 8 }}
      />
      {exists && <Text style={{ color: C.orange, fontSize: 12, marginTop: 6 }}>Ce tag existe déjà.</Text>}
      <Button title={busy === 'create' ? 'Création…' : 'Créer le tag'} style={{ marginTop: 10, opacity: canCreate ? 1 : 0.5 }} onPress={create} />
      <View style={{ gap: 10, marginTop: 20 }}>
        {!list.length && <Text style={[s.muted, { textAlign: 'center', marginTop: 20 }]}>Aucun tag.</Text>}
        {list.map((t) => (
          <Card key={t.name} style={{ backgroundColor: C.surface2 }}>
            <View style={[s.row, { gap: 6 }]}>
              <TagIcon size={13} color={C.green} />
              <Mono style={{ color: C.green, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
                {t.name}
              </Mono>
              <Mono style={{ color: C.orange, fontSize: 12 }}>{t.sha}</Mono>
              {t.commit === st?.oid && (
                <View style={{ backgroundColor: C.accentBg, borderRadius: 4, paddingHorizontal: 4 }}>
                  <Text style={{ color: C.accent, fontSize: 9, fontWeight: '700' }}>HEAD</Text>
                </View>
              )}
            </View>
            <Text style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
              {t.annotated ? 'Annoté' : 'Léger'} · {ago(t.time)}
            </Text>
            {!!t.msg && <Text style={{ color: C.text, marginTop: 4 }}>{t.msg}</Text>}
            <View style={[s.row, { gap: 8, marginTop: 10 }]}>
              {btn('push:' + t.name, `Pousser`, () => push(t), C.accent)}
              <View style={{ flex: 1 }} />
              {btn('del:' + t.name, 'Supprimer', () => remove(t), C.red)}
            </View>
          </Card>
        ))}
      </View>
    </Sheet>
  );
}
