import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { Copy, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, Share, Text, View } from 'react-native';

import { Button, Card, Mono, s, SectionLabel, SheetHeader } from '@/components/ui';
import { useServers } from '@/store/servers';
import { C } from '@/theme';

export default function KeyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { keys, servers, deleteKey } = useServers();
  const [copied, setCopied] = useState<'key' | 'cmd' | null>(null);
  const k = keys.find((x) => x.id === id);
  if (!k) return null;

  const pub = k.publicKey.trim();
  const usage = servers.filter((sv) => sv.auth === 'key' && sv.keyId === k.id).length;
  // One-liner to paste in a shell already open on the target server
  const cmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${pub}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;

  async function copy(what: 'key' | 'cmd') {
    await Clipboard.setStringAsync(what === 'key' ? pub : cmd);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  function remove() {
    Alert.alert('Supprimer cette clé ?', `La clé privée sera effacée de cet appareil. ${usage} serveur(s) l’utilisent.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteKey(k!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 40 }}>
      <SheetHeader title={k.name} subtitle={<Mono style={{ color: C.muted, fontSize: 10 }} numberOfLines={1}>{k.type} · {k.fingerprint}</Mono>} />

      <SectionLabel>Clé publique</SectionLabel>
      <Card>
        <Mono selectable style={{ fontSize: 11 }}>{pub}</Mono>
      </Card>
      <View style={[s.row, { gap: 8, marginTop: 10 }]}>
        <Button title={copied === 'key' ? 'Copiée ✓' : 'Copier'} variant="ghost" icon={<Copy size={16} color={C.text} />} style={{ flex: 1 }} onPress={() => copy('key')} />
        <Button title="Partager" variant="ghost" icon={<Share2 size={16} color={C.text} />} style={{ flex: 1 }} onPress={() => Share.share({ message: pub, title: `${k.name}.pub` })} />
      </View>

      <SectionLabel>Installer sur un serveur</SectionLabel>
      <Text style={[s.muted, { marginBottom: 8, paddingHorizontal: 4 }]}>
        Colle cette commande dans un terminal déjà connecté au serveur (mot de passe, console de l’hébergeur…), avec l’utilisateur qui se connectera.
      </Text>
      <Card>
        <Mono selectable style={{ fontSize: 10, color: C.muted }}>{cmd}</Mono>
      </Card>
      <Button title={copied === 'cmd' ? 'Commande copiée ✓' : 'Copier la commande'} variant="ghost" style={{ marginTop: 10 }} onPress={() => copy('cmd')} />

      <Button title="Supprimer la clé" variant="outlineDanger" style={{ marginTop: 28 }} onPress={remove} />
    </ScrollView>
  );
}
