import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { Button, Card, s, SectionLabel, Sheet, SheetHeader } from '@/components/ui';
import { asSshError } from '@/lib/ssh';
import { useServers } from '@/store/servers';
import { C, mono } from '@/theme';

export default function ImportKey() {
  const { importKey } = useServers();
  const [name, setName] = useState('');
  const [pem, setPem] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);

  async function fromFile() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled) return;
    const asset = res.assets[0];
    setPem(await new File(asset.uri).text());
    if (!name) setName(asset.name);
  }

  async function fromClipboard() {
    setPem(await Clipboard.getStringAsync());
  }

  async function submit() {
    if (!pem.includes('PRIVATE KEY')) return Alert.alert('Clé invalide', 'Colle une clé privée (-----BEGIN … PRIVATE KEY-----).');
    setBusy(true);
    try {
      await importKey(name.trim() || 'imported_key', pem.trim() + '\n', passphrase || undefined);
      router.back();
    } catch (e) {
      Alert.alert('Import impossible', asSshError(e).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet>
      <SheetHeader title="Importer une clé" subtitle={<Text style={s.muted}>La clé privée reste chiffrée sur cet appareil.</Text>} />
      <View style={[s.row, { gap: 8 }]}>
        <Button title="Depuis un fichier" variant="ghost" style={{ flex: 1 }} onPress={fromFile} />
        <Button title="Coller" variant="ghost" style={{ flex: 1 }} onPress={fromClipboard} />
      </View>
      <SectionLabel>Nom</SectionLabel>
      <Card style={{ paddingVertical: 4 }}>
        <TextInput value={name} onChangeText={setName} autoCapitalize="none" placeholder="id_ed25519" placeholderTextColor={C.dim} style={{ color: C.text, fontFamily: mono, paddingVertical: 10 }} />
      </Card>
      <SectionLabel>Clé privée</SectionLabel>
      <Card>
        <TextInput value={pem} onChangeText={setPem} multiline autoCapitalize="none" autoCorrect={false} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" placeholderTextColor={C.dim} style={{ color: C.text, fontFamily: mono, fontSize: 10, minHeight: 120, textAlignVertical: 'top' }} />
      </Card>
      <SectionLabel>Phrase de passe (si chiffrée)</SectionLabel>
      <Card style={{ paddingVertical: 4 }}>
        <TextInput value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" placeholderTextColor={C.dim} style={{ color: C.text, paddingVertical: 10 }} />
      </Card>
      <Button title={busy ? 'Import…' : 'Importer'} style={{ marginTop: 20 }} onPress={submit} />
      <Pressable onPress={() => router.back()} style={{ alignItems: 'center', padding: 12 }}>
        <Text style={s.muted}>Annuler</Text>
      </Pressable>
    </Sheet>
  );
}
