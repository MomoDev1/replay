import { router } from 'expo-router';
import { FolderGit2, Search } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Button, Mono, s, SheetHeader } from '@/components/ui';
import { shPath } from '@/lib/git';
import { exec, useSession } from '@/store/session';
import { setRepo, useGit } from '@/store/git';
import { C, mono } from '@/theme';

export default function RepoSheet() {
  const server = useSession()?.server;
  const g = useGit();
  const [path, setPath] = useState(g?.repo ?? server?.path ?? '~');
  const [base, setBase] = useState(server?.path || '~');
  const [found, setFound] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function search() {
    setSearching(true);
    try {
      const r = await exec(`find ${shPath(base)} -maxdepth 4 -type d -name .git -prune -print 2>/dev/null | head -50`, 30_000);
      setFound(r.stdout.split('\n').filter(Boolean).map((p) => p.replace(/\/\.git$/, '')));
    } catch {
      setFound([]);
    }
    setSearching(false);
  }

  function choose(p: string) {
    if (!server || !p.trim()) return;
    setRepo(server, p.trim());
    router.back();
  }

  const input = { flex: 1, color: C.text, paddingVertical: 9, fontFamily: mono, fontSize: 13 } as const;

  return (
    <View style={s.sheet}>
      <SheetHeader title="Choisir un dépôt" subtitle={<Text style={s.muted}>{server?.name}</Text>} />
      <Text style={[s.section, { marginBottom: 8 }]}>CHEMIN DU DÉPÔT</Text>
      <View style={[s.row, { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8 }]}>
        <FolderGit2 size={14} color={C.muted} />
        <TextInput value={path} onChangeText={setPath} autoCapitalize="none" autoCorrect={false} placeholder="/var/www/api" placeholderTextColor={C.dim} style={input} onSubmitEditing={() => choose(path)} />
      </View>
      <Button title="Utiliser ce dépôt" style={{ marginTop: 10 }} onPress={() => choose(path)} />

      <Text style={[s.section, { marginTop: 20, marginBottom: 8 }]}>RECHERCHER SUR LE SERVEUR</Text>
      <View style={[s.row, { gap: 8 }]}>
        <View style={[s.row, { flex: 1, backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8 }]}>
          <Search size={14} color={C.muted} />
          <TextInput value={base} onChangeText={setBase} autoCapitalize="none" autoCorrect={false} placeholder="~" placeholderTextColor={C.dim} style={input} onSubmitEditing={search} />
        </View>
        <Pressable onPress={search} style={{ backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
          {searching ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Chercher</Text>}
        </Pressable>
      </View>
      <ScrollView style={{ flex: 1, marginTop: 8 }}>
        {found?.length === 0 && <Text style={[s.muted, { marginTop: 8 }]}>Aucun dépôt trouvé sous {base} (profondeur 4).</Text>}
        {found?.map((p) => (
          <Pressable key={p} onPress={() => choose(p)} style={[s.row, { gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.border }]}>
            <FolderGit2 size={14} color={p === g?.repo ? C.accent : C.muted} />
            <Mono style={{ fontSize: 12, flex: 1, color: p === g?.repo ? C.accent : C.text }} numberOfLines={1}>
              {p}
            </Mono>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
