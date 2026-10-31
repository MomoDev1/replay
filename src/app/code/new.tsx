import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { Button, Mono, s, Segmented, SheetHeader } from '@/components/ui';
import { create, join } from '@/lib/files';
import { asciiPunct } from '@/lib/text';
import { currentDir, open } from '@/store/code';
import { C, mono } from '@/theme';

export default function NewEntry() {
  const dir = currentDir() ?? '/';
  const [kind, setKind] = useState<'file' | 'dir'>('file');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = asciiPunct(name.trim());
    if (!n || busy) return;
    // Sub-paths are allowed (`src/utils.ts`) but must stay inside the current folder.
    const path = join(dir, n);
    if (!path.startsWith(dir === '/' ? '/' : dir + '/')) return Alert.alert('Nom invalide', 'Le chemin doit rester dans le dossier courant.');
    setBusy(true);
    try {
      await create(path, kind === 'dir');
      await open(dir);
      router.back();
      if (kind === 'file') router.push({ pathname: '/code/edit', params: { path } });
    } catch (e) {
      Alert.alert('Création impossible', (e as Error).message);
    }
    setBusy(false);
  }

  return (
    <View style={s.sheet}>
      <SheetHeader
        title="Nouveau"
        subtitle={
          <Mono style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>
            {dir}
          </Mono>
        }
      />
      <Segmented
        options={[
          { value: 'file', label: 'Fichier' },
          { value: 'dir', label: 'Dossier' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <Text style={[s.section, { marginTop: 16, marginBottom: 8 }]}>NOM</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={kind === 'file' ? 'index.ts' : 'components'}
        placeholderTextColor={C.dim}
        onSubmitEditing={submit}
        style={{ backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: C.text, fontFamily: mono, fontSize: 14 }}
      />
      <Button title={busy ? 'Création…' : 'Créer'} style={{ marginTop: 14 }} onPress={submit} />
    </View>
  );
}
