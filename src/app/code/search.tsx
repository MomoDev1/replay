import { router } from 'expo-router';
import { File, Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { Mono, s, Segmented, SheetHeader } from '@/components/ui';
import { allFiles, grep, join, type GrepHit } from '@/lib/files';
import { asciiPunct } from '@/lib/text';
import { currentDir } from '@/store/code';
import { C, mono } from '@/theme';

type Mode = 'files' | 'content';

/** Subsequence match, VS Code "Go to File" style; lower is better, null = no match. */
function score(path: string, q: string) {
  const p = path.toLowerCase();
  let at = -1;
  let gaps = 0;
  for (const ch of q) {
    const next = p.indexOf(ch, at + 1);
    if (next < 0) return null;
    gaps += next - at - 1;
    at = next;
  }
  // Prefer matches inside the file name over matches spread across folders.
  const nameStart = p.lastIndexOf('/') + 1;
  return gaps + (p.indexOf(q, nameStart) >= 0 ? -1000 : 0) + path.length / 100;
}

function openFile(path: string, line?: number) {
  router.back();
  router.push({ pathname: '/code/edit', params: line ? { path, line: String(line) } : { path } });
}

export default function SearchSheet() {
  const root = currentDir() ?? '/';
  const [mode, setMode] = useState<Mode>('files');
  const [q, setQ] = useState('');
  const [files, setFiles] = useState<string[] | null>(null);
  const [hits, setHits] = useState<GrepHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    allFiles(root).then(setFiles, () => setFiles([]));
  }, [root]);

  const matches = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/\s+/g, '');
    if (!files) return [];
    if (!query) return files.slice(0, 100);
    return files
      .map((f) => ({ f, sc: score(f, query) }))
      .filter((x): x is { f: string; sc: number } => x.sc !== null)
      .sort((a, b) => a.sc - b.sc)
      .slice(0, 100)
      .map((x) => x.f);
  }, [files, q]);

  async function searchContent() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setHits(await grep(root, asciiPunct(q.trim())));
    } catch {
      setHits([]);
    }
    setBusy(false);
  }

  const input = { flex: 1, color: C.text, paddingVertical: 9, fontFamily: mono, fontSize: 13 } as const;

  return (
    <View style={s.sheet}>
      <SheetHeader
        title="Rechercher"
        subtitle={
          <Mono style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>
            {root}
          </Mono>
        }
      />
      <Segmented
        options={[
          { value: 'files', label: 'Fichiers' },
          { value: 'content', label: 'Contenu' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <View style={[s.row, { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 12, gap: 8, marginTop: 12 }]}>
        <Search size={14} color={C.muted} />
        <TextInput
          value={q}
          onChangeText={(t) => {
            setQ(t);
            if (mode === 'content') setHits(null);
          }}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          placeholder={mode === 'files' ? 'Nom de fichier…' : 'Texte à chercher…'}
          placeholderTextColor={C.dim}
          style={input}
          onSubmitEditing={() => (mode === 'content' ? searchContent() : matches[0] && openFile(join(root, matches[0])))}
        />
        {(busy || (mode === 'files' && !files)) && <ActivityIndicator size="small" color={C.muted} />}
      </View>

      {mode === 'files' ? (
        <FlatList
          style={{ flex: 1, marginTop: 8 }}
          keyboardShouldPersistTaps="handled"
          data={matches}
          keyExtractor={(f) => f}
          ListEmptyComponent={files ? <Text style={[s.muted, { marginTop: 8 }]}>Aucun fichier.</Text> : undefined}
          renderItem={({ item }) => {
            const slash = item.lastIndexOf('/');
            return (
              <Pressable onPress={() => openFile(join(root, item))} style={[s.row, { gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderColor: C.border }]}>
                <File size={14} color={C.muted} />
                <View style={{ flex: 1 }}>
                  <Mono style={{ fontSize: 13 }} numberOfLines={1}>
                    {item.slice(slash + 1)}
                  </Mono>
                  {slash > 0 && (
                    <Mono style={{ fontSize: 10, color: C.muted }} numberOfLines={1}>
                      {item.slice(0, slash)}
                    </Mono>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          style={{ flex: 1, marginTop: 8 }}
          keyboardShouldPersistTaps="handled"
          data={hits ?? []}
          keyExtractor={(h, i) => `${h.path}:${h.line}:${i}`}
          ListEmptyComponent={hits ? <Text style={[s.muted, { marginTop: 8 }]}>Aucun résultat.</Text> : <Text style={[s.muted, { marginTop: 8 }]}>Valide pour lancer la recherche (300 résultats max).</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => openFile(join(root, item.path), item.line)} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: C.border }}>
              <Mono style={{ fontSize: 11, color: C.accent }} numberOfLines={1}>
                {item.path}:{item.line}
              </Mono>
              <Mono style={{ fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                {item.text}
              </Mono>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
