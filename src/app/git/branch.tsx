import { router } from 'expo-router';
import { Plus, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, Mono, Radio, s, SheetHeader } from '@/components/ui';
import { ago, branches as listBranches, git, type Branch } from '@/lib/git';
import { sq } from '@/lib/ssh';
import { act, currentRepo, useGit } from '@/store/git';
import { C } from '@/theme';

/** `origin/feat/x` → `feat/x` */
const localName = (b: Branch) => (b.remote ? b.name.slice(b.name.indexOf('/') + 1) : b.name);

export default function BranchSheet() {
  const st = useGit()?.status;
  const dirty = (st?.files.length ?? 0) > 0;
  const [all, setAll] = useState<Branch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    listBranches(currentRepo()).then(setAll, (e) => setError((e as Error).message));

  useEffect(() => {
    load();
  }, []);

  const match = (b: Branch) => b.name.toLowerCase().includes(q.toLowerCase());
  const local = all?.filter((b) => !b.remote) ?? [];
  const remote = all?.filter((b) => b.remote) ?? [];
  const selected = all?.find((b) => b.name === sel);
  const newName = q.trim();
  const canCreate = !!newName && /^[\w./-]+$/.test(newName) && !local.some((b) => b.name === newName);

  /** Stashes local changes first so the switch can't fail on them. */
  async function withStash(target: string, fn: (repo: string) => Promise<unknown>) {
    setBusy(true);
    const done = await act(async (repo) => {
      if (dirty) await git(repo, `stash push -u -m ${sq(`hop: auto avant ${target}`)}`);
      await fn(repo);
      return true;
    });
    setBusy(false);
    if (done) router.back();
  }

  function checkout() {
    if (!selected || selected.current) return;
    const name = localName(selected);
    withStash(name, (repo) => {
      if (!selected.remote || local.some((b) => b.name === name)) return git(repo, `switch ${sq(name)}`);
      return git(repo, `switch -c ${sq(name)} --track ${sq(selected.name)}`);
    });
  }

  function remove(b: Branch) {
    if (b.remote || b.current) return;
    Alert.alert(`Supprimer ${b.name} ?`, 'La branche locale sera supprimée.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const r = await git(currentRepo(), `branch -d ${sq(b.name)}`, { allowFail: true }).catch((e) => ({ exitCode: 1, output: (e as Error).message }));
          if (r.exitCode === 0) return load();
          Alert.alert('Branche non fusionnée', `${r.output}\n\nForcer la suppression ? Les commits non fusionnés seront perdus.`, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Forcer', style: 'destructive', onPress: () => act((repo) => git(repo, `branch -D ${sq(b.name)}`)).then(load) },
          ]);
        },
      },
    ]);
  }

  const row = (b: Branch) => (
    <Pressable key={b.name} onPress={() => setSel(b.name)} onLongPress={() => remove(b)} style={[s.row, { gap: 12, paddingVertical: 8 }]}>
      <Radio on={sel === b.name} />
      <View style={{ flex: 1 }}>
        <Mono style={{ fontSize: 13, color: b.current ? C.accent : C.text }}>{b.name}</Mono>
        <Text style={{ color: C.dim, fontSize: 11 }}>
          {b.current ? 'Actuelle · ' : ''}
          {b.sha} · {b.author} · {ago(b.time)}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={s.sheet}>
      <SheetHeader title="Changer de branche" />
      <View style={[s.row, { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8 }]}>
        <Search size={14} color={C.muted} />
        <TextInput value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} placeholder="Rechercher ou nommer une branche…" placeholderTextColor={C.dim} style={{ flex: 1, color: C.text, paddingVertical: 9 }} />
      </View>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {canCreate && (
          <Pressable onPress={() => withStash(newName, (repo) => git(repo, `switch -c ${sq(newName)}`))} style={[s.row, { gap: 10, paddingVertical: 12 }]}>
            <Plus size={18} color={C.accent} />
            <Text style={{ color: C.accent }}>
              Créer <Mono style={{ color: C.accent }}>{newName}</Mono> depuis {st?.branch ?? 'HEAD'}
            </Text>
          </Pressable>
        )}
        {!all && !error && <ActivityIndicator style={{ marginTop: 24 }} color={C.muted} />}
        {error && <Mono style={{ color: C.red, marginTop: 16, fontSize: 12 }}>{error}</Mono>}
        {all && (
          <>
            <Text style={[s.section, { marginTop: 16, marginBottom: 4 }]}>LOCALES</Text>
            {local.filter(match).map(row)}
            {remote.length > 0 && <Text style={[s.section, { marginTop: 12, marginBottom: 4 }]}>DISTANTES</Text>}
            {remote.filter(match).map(row)}
            <Text style={{ color: C.dim, fontSize: 11, marginTop: 12 }}>Appui long sur une branche locale pour la supprimer.</Text>
          </>
        )}
      </ScrollView>
      {dirty && <Text style={{ color: C.orange, fontSize: 12, marginVertical: 10 }}>{st!.files.length} fichier{st!.files.length > 1 ? 's' : ''} modifié{st!.files.length > 1 ? 's' : ''} seront mis de côté (stash) avant le changement.</Text>}
      <Button
        title={busy ? 'Changement…' : selected ? (selected.current ? 'Branche actuelle' : `Basculer sur ${localName(selected)}`) : 'Choisis une branche'}
        style={{ marginTop: dirty ? 0 : 10, opacity: selected && !selected.current && !busy ? 1 : 0.5 }}
        onPress={checkout}
      />
    </View>
  );
}
