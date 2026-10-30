import { router, useLocalSearchParams } from 'expo-router';
import { Star } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { parseVars } from '@/components/snippet-row';
import { Button, Mono, s, Segmented, SheetHeader } from '@/components/ui';
import { useSession } from '@/store/session';
import { useSnippets } from '@/store/snippets';
import { C, mono } from '@/theme';

const input = { backgroundColor: C.surface2, color: C.text, borderRadius: 8, padding: 10 } as const;

export default function EditSnippet() {
  const { id, scope: initialScope } = useLocalSearchParams<{ id?: string; scope?: 'server' | 'global' }>();
  const { snippets, save } = useSnippets();
  const server = useSession()?.server;
  const existing = snippets.find((sn) => sn.id === id);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [cmd, setCmd] = useState(existing?.cmd ?? '');
  const [fav, setFav] = useState(existing?.fav ?? false);
  const [scope, setScope] = useState<'server' | 'global'>(existing ? (existing.serverId ? 'server' : 'global') : server && initialScope !== 'global' ? 'server' : 'global');
  const [busy, setBusy] = useState(false);
  const vars = parseVars(cmd);
  // Editing a server snippet while connected elsewhere keeps its original server.
  const serverId = scope === 'global' ? null : (existing?.serverId ?? server?.id ?? null);
  const valid = title.trim() && cmd.trim();

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    await save({ title: title.trim(), cmd: cmd.trim(), fav, serverId }, existing?.id);
    router.back();
  }

  return (
    <View style={s.sheet}>
      <SheetHeader title={existing ? 'Modifier le snippet' : 'Nouveau snippet'} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
        <View>
          <Text style={[s.section, { marginBottom: 8 }]}>TITRE</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Redémarrer un service" placeholderTextColor={C.dim} style={input} />
        </View>
        <View>
          <Text style={[s.section, { marginBottom: 8 }]}>COMMANDE</Text>
          <TextInput
            value={cmd}
            onChangeText={setCmd}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="sudo systemctl restart {service:api|nginx}"
            placeholderTextColor={C.dim}
            style={[input, { fontFamily: mono, fontSize: 13, minHeight: 70, textAlignVertical: 'top' }]}
          />
          <Text style={{ color: C.dim, fontSize: 11, marginTop: 6 }}>
            Variables : <Mono style={{ fontSize: 11, color: C.muted }}>{'{nom}'}</Mono> pour une saisie libre, <Mono style={{ fontSize: 11, color: C.muted }}>{'{nom:a|b|c}'}</Mono> pour un choix.
          </Text>
          {vars.length > 0 && (
            <View style={[s.row, { gap: 6, flexWrap: 'wrap', marginTop: 8 }]}>
              {vars.map((v) => (
                <View key={v.name} style={{ backgroundColor: C.accentBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Mono style={{ fontSize: 11, color: C.accent }}>
                    {v.name}
                    {v.choices.length ? ` · ${v.choices.length} choix` : ''}
                  </Mono>
                </View>
              ))}
            </View>
          )}
        </View>
        <View>
          <Text style={[s.section, { marginBottom: 8 }]}>PORTÉE</Text>
          {server || existing?.serverId ? (
            <Segmented
              options={[
                { value: 'server', label: existing?.serverId && existing.serverId !== server?.id ? 'Ce serveur' : (server?.name ?? 'Ce serveur') },
                { value: 'global', label: 'Tous les serveurs' },
              ]}
              value={scope}
              onChange={setScope}
            />
          ) : (
            <Text style={s.muted}>Global (connecte-toi à un serveur pour créer un snippet propre à celui-ci).</Text>
          )}
        </View>
        <Pressable onPress={() => setFav((f) => !f)} style={[s.row, { gap: 10, paddingVertical: 6 }]}>
          <Star size={18} color={fav ? C.orange : C.dim} fill={fav ? C.orange : 'transparent'} />
          <Text style={{ color: C.text }}>Afficher dans les commandes rapides</Text>
        </Pressable>
      </ScrollView>
      <Button title={existing ? 'Enregistrer' : 'Créer le snippet'} onPress={submit} style={{ opacity: valid ? 1 : 0.5 }} />
    </View>
  );
}
