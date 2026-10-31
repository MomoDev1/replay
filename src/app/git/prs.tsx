import { router, useFocusEffect } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, GitPullRequest, MessageSquare } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { prStateColor, useHasCreds } from '@/components/pr';
import { Button, Card, Mono, s, Segmented } from '@/components/ui';
import { forgeLabel, providerFor, repoKey, type Pr, type PrState } from '@/lib/forge';
import { ago } from '@/lib/git';
import { useGit } from '@/store/git';
import { C } from '@/theme';

export default function PullRequests() {
  const ref = useGit()?.remote ?? null;
  const hasCreds = useHasCreds(ref?.forge);
  const [tab, setTab] = useState<PrState>('open');
  const [data, setData] = useState<{ key: string; prs: Pr[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = ref ? `${repoKey(ref)}|${tab}` : '';

  const load = useCallback(async () => {
    if (!ref || !hasCreds) return;
    setLoading(true);
    try {
      const prs = await providerFor(ref).list(tab);
      setData({ key, prs });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
    // `key` covers ref + tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasCreds]);

  // Reload whenever the screen comes back (e.g. after a merge).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const prs = data?.key === key ? data.prs : null;

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={loading && !!prs} onRefresh={load} tintColor={C.muted} />}>
        <Pressable onPress={() => router.back()} style={[s.row, { gap: 2 }]}>
          <ChevronLeft size={16} color={C.accent} />
          <Text style={{ color: C.accent }}>Git</Text>
        </Pressable>
        <Text style={[s.h1, { marginTop: 4 }]}>Pull requests</Text>
        {ref && (
          <Mono style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
            {forgeLabel[ref.forge]} · {ref.owner}/{ref.name}
          </Mono>
        )}

        {!ref ? (
          <Card style={{ marginTop: 16 }}>
            <Text style={{ color: C.text, fontWeight: '600' }}>Pas de dépôt GitHub ou Bitbucket</Text>
            <Text style={[s.muted, { marginTop: 4 }]}>Aucun remote de ce dépôt ne pointe vers github.com ou bitbucket.org.</Text>
          </Card>
        ) : hasCreds === false ? (
          <Card style={{ marginTop: 16, gap: 10 }}>
            <Text style={{ color: C.text, fontWeight: '600' }}>Compte {forgeLabel[ref.forge]} requis</Text>
            <Text style={s.muted}>Ajoute un jeton d’API pour lister, commenter, approuver et merger les pull requests.</Text>
            <Button title="Configurer le compte" onPress={() => router.push('/git/accounts')} />
          </Card>
        ) : (
          <>
            <View style={{ marginTop: 16 }}>
              <Segmented
                options={[
                  { value: 'open', label: 'Ouvertes' },
                  { value: 'merged', label: 'Fusionnées' },
                  { value: 'closed', label: ref.forge === 'bitbucket' ? 'Refusées' : 'Fermées' },
                ]}
                value={tab}
                onChange={setTab}
              />
            </View>

            {error && (
              <Card style={{ marginTop: 16, borderColor: C.red + '66', backgroundColor: C.redBg, gap: 10 }}>
                <Mono style={{ fontSize: 12, color: C.text }}>{error}</Mono>
                <View style={[s.row, { gap: 8 }]}>
                  <Button title="Réessayer" variant="ghost" style={{ flex: 1 }} onPress={load} />
                  <Button title="Comptes" variant="ghost" style={{ flex: 1 }} onPress={() => router.push('/git/accounts')} />
                </View>
              </Card>
            )}

            {!prs && !error && <ActivityIndicator style={{ marginTop: 40 }} color={C.muted} />}
            {prs && !prs.length && <Text style={[s.muted, { textAlign: 'center', marginTop: 30 }]}>Aucune pull request.</Text>}
            {prs && prs.length > 0 && (
              <Card style={{ padding: 0, marginTop: 16 }}>
                {prs.map((p, i) => (
                  <Pressable key={p.id} onPress={() => router.push({ pathname: '/git/pr/[id]', params: { id: String(p.id) } })} style={[s.row, { gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
                    <GitPullRequest size={16} color={p.draft ? C.dim : prStateColor[p.state]} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }} numberOfLines={2}>
                        {p.draft && <Text style={{ color: C.dim }}>[Brouillon] </Text>}
                        {p.title}
                      </Text>
                      <Mono style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>
                        #{p.id} · {p.source} → {p.target}
                      </Mono>
                      <View style={[s.row, { gap: 10 }]}>
                        <Text style={{ color: C.dim, fontSize: 11 }}>
                          {p.author} · {ago(p.updatedAt)}
                        </Text>
                        {!!p.approvals && (
                          <View style={[s.row, { gap: 2 }]}>
                            <Check size={11} color={C.green} />
                            <Text style={{ color: C.green, fontSize: 11 }}>{p.approvals}</Text>
                          </View>
                        )}
                        {!!p.comments && (
                          <View style={[s.row, { gap: 3 }]}>
                            <MessageSquare size={11} color={C.dim} />
                            <Text style={{ color: C.dim, fontSize: 11 }}>{p.comments}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <ChevronRight size={14} color={C.dim} />
                  </Pressable>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
