import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, Mono, s, SheetHeader } from '@/components/ui';
import { git, isStaged, isUnstaged } from '@/lib/git';
import { sq } from '@/lib/ssh';
import { act, useGit } from '@/store/git';
import { C, mono } from '@/theme';

function Toggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.row, { gap: 10, paddingVertical: 8 }]}>
      <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: on ? C.accent : C.dim, backgroundColor: on ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on && <Check size={13} color="#fff" strokeWidth={3} />}
      </View>
      <Text style={{ color: C.text }}>{label}</Text>
    </Pressable>
  );
}

export default function CommitSheet() {
  const st = useGit()?.status;
  const staged = st?.files.filter(isStaged) ?? [];
  const unstaged = st?.files.filter(isUnstaged) ?? [];
  const [msg, setMsg] = useState('');
  const [all, setAll] = useState(staged.length === 0);
  const [push, setPush] = useState(false);
  const [busy, setBusy] = useState(false);
  const files = all ? [...staged, ...unstaged.filter((u) => !staged.some((f) => f.path === u.path))] : staged;
  const valid = msg.trim() && files.length > 0 && !busy;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    const ok = await act(async (repo) => {
      if (all) await git(repo, 'add -A');
      await git(repo, `commit -m ${sq(msg.trim())}`);
      return true;
    });
    setBusy(false);
    if (!ok) return;
    if (push) router.replace({ pathname: '/git/pull', params: { op: 'push' } });
    else router.back();
  }

  return (
    <View style={s.sheet}>
      <SheetHeader title="Commit" subtitle={<Text style={s.muted}>sur {st?.branch ?? 'HEAD détachée'}</Text>} />
      <TextInput
        value={msg}
        onChangeText={setMsg}
        multiline
        autoFocus
        placeholder="fix: description du changement"
        placeholderTextColor={C.dim}
        style={{ backgroundColor: C.surface2, color: C.text, borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: 'top', fontFamily: mono, fontSize: 13 }}
      />
      {unstaged.length > 0 && <Toggle on={all} label={`Inclure les ${unstaged.length} fichier${unstaged.length > 1 ? 's' : ''} non indexé${unstaged.length > 1 ? 's' : ''}`} onPress={() => setAll((a) => !a)} />}
      <Toggle on={push} label="Pousser ensuite (git push)" onPress={() => setPush((p) => !p)} />
      <Text style={[s.section, { marginTop: 10, marginBottom: 6 }]}>{`${files.length} FICHIER${files.length > 1 ? 'S' : ''}`}</Text>
      <ScrollView style={{ flex: 1 }}>
        {files.map((f) => (
          <Mono key={f.path} style={{ fontSize: 12, color: C.muted, paddingVertical: 3 }} numberOfLines={1}>
            {f.path}
          </Mono>
        ))}
      </ScrollView>
      <Button title={busy ? 'Commit…' : 'Commit'} style={{ marginTop: 10, opacity: valid ? 1 : 0.5 }} onPress={submit} />
    </View>
  );
}
