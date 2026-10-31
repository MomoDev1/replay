import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Check, ChevronLeft, ChevronRight, CircleDot, ExternalLink, GitMerge, MessageSquareReply, Send, X, XCircle } from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { prStateColor, prStateLabel, ReviewBadge } from '@/components/pr';
import { Button, Card, Mono, s, Segmented } from '@/components/ui';
import { forgeLabel, type CheckState, type PrComment } from '@/lib/forge';
import { ago } from '@/lib/git';
import { useGit } from '@/store/git';
import { loadPrExtra, openPr, prAct, reloadPr, usePr } from '@/store/pr';
import { C } from '@/theme';

type Tab = 'discussion' | 'files' | 'commits';
type Compose = { kind: 'comment' } | { kind: 'reply'; to: PrComment } | { kind: 'changes' };

const checkColor: Record<CheckState, string> = { success: C.green, failure: C.red, pending: C.orange, neutral: C.dim };
const fileColor = { added: C.green, removed: C.red, modified: C.orange, renamed: C.accent } as const;
const fileLetter = { added: 'A', removed: 'D', modified: 'M', renamed: 'R' } as const;

function ActionBtn({ icon, label, color = C.text, primary, disabled, onPress }: { icon: ReactNode; label: string; color?: string; primary?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, backgroundColor: primary ? C.accent : C.surface2, opacity: disabled ? 0.45 : 1 }}>
      {icon}
      <Text style={{ color: primary ? '#fff' : color, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function CommentView({ c, onReply, depth }: { c: PrComment; onReply?: () => void; depth: number }) {
  return (
    <View style={{ paddingVertical: 10, paddingLeft: depth ? 12 : 0, borderLeftWidth: depth ? 2 : 0, borderColor: C.border, marginLeft: depth ? 4 : 0 }}>
      <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
        <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>{c.author}</Text>
        <Text style={{ color: C.dim, fontSize: 11 }}>{ago(c.createdAt)}</Text>
        {c.review && c.review !== 'commented' && <ReviewBadge state={c.review} />}
      </View>
      {c.deleted ? (
        <Text style={[s.muted, { fontStyle: 'italic', marginTop: 4 }]}>Commentaire supprimé.</Text>
      ) : (
        !!c.body.trim() && (
          <Text selectable style={{ color: C.text, fontSize: 14, marginTop: 4, lineHeight: 20 }}>
            {c.body.trim()}
          </Text>
        )
      )}
      {onReply && !c.deleted && (
        <Pressable onPress={onReply} hitSlop={8} style={[s.row, { gap: 4, marginTop: 6, alignSelf: 'flex-start' }]}>
          <MessageSquareReply size={13} color={C.accent} />
          <Text style={{ color: C.accent, fontSize: 12, fontWeight: '600' }}>Répondre</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function PrDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ref = useGit()?.remote ?? null;
  const st = usePr();
  const [tab, setTab] = useState<Tab>('discussion');
  const [compose, setCompose] = useState<Compose>({ kind: 'comment' });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const prId = Number(id);

  useEffect(() => {
    if (ref && prId) openPr(ref, prId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref?.forge, ref?.owner, ref?.name, prId]);

  const mine = st?.id === prId && st.ref.owner === ref?.owner && st.ref.name === ref?.name ? st : null;
  const pr = mine?.pr ?? null;

  useEffect(() => {
    if (tab !== 'discussion' && mine && !mine[tab]) loadPrExtra(tab);
  }, [tab, mine]);

  /** Roots in time order, each followed by its replies (any depth, flattened with depth info). */
  const threads = useMemo(() => {
    // Bitbucket keeps deleted comments: show them only when they still anchor replies.
    const all = mine?.comments ?? [];
    const parents = new Set(all.map((c) => c.parentId));
    const cs = all.filter((c) => !c.deleted || parents.has(c.id));
    const ids = new Set(cs.map((c) => c.id));
    const kids = new Map<number, PrComment[]>();
    for (const c of cs) if (c.parentId && ids.has(c.parentId)) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c]);
    const flat = (c: PrComment, depth: number): { c: PrComment; depth: number }[] => [{ c, depth }, ...(kids.get(c.id) ?? []).flatMap((k) => flat(k, Math.min(depth + 1, 3)))];
    return cs.filter((c) => !c.parentId || !ids.has(c.parentId)).map((root) => flat(root, 0));
  }, [mine?.comments]);

  if (!ref) {
    return (
      <SafeAreaView style={[s.screen, { padding: 16 }]}>
        <Text style={s.muted}>Aucun dépôt GitHub / Bitbucket sélectionné.</Text>
      </SafeAreaView>
    );
  }

  const open = pr?.state === 'open';
  const canMerge = open && pr.mergeable !== false;
  const checks = mine?.checks ?? [];
  const failed = checks.filter((c) => c.state === 'failure').length;
  const pending = checks.filter((c) => c.state === 'pending').length;

  async function run(key: string, fn: Parameters<typeof prAct>[0], title?: string) {
    setBusy(key);
    const ok = await prAct(fn, title);
    setBusy(null);
    return ok;
  }

  async function send() {
    const body = text.trim();
    if (compose.kind === 'changes') {
      if (!body && ref!.forge === 'github') return Alert.alert('Message requis', 'GitHub demande d’expliquer les changements attendus.');
      if (await run('send', (p) => p.requestChanges(prId, body), 'Demande de changements')) {
        setText('');
        setCompose({ kind: 'comment' });
      }
      return;
    }
    if (!body) return;
    const parent = compose.kind === 'reply' ? compose.to : undefined;
    if (await run('send', (p) => p.comment(prId, body, parent), 'Commentaire')) {
      setText('');
      setCompose({ kind: 'comment' });
    }
  }

  function toggleApprove() {
    if (!pr) return;
    if (pr.myReview === 'approved' || pr.myReview === 'changes') run('approve', (p, cur) => p.unapprove(cur), 'Revue');
    else run('approve', (p) => p.approve(prId), 'Approbation');
  }

  function more() {
    if (!pr) return;
    const closeLabel = ref!.forge === 'bitbucket' ? 'Refuser la PR' : 'Fermer la PR';
    Alert.alert(`#${pr.id}`, pr.title, [
      { text: `Ouvrir sur ${forgeLabel[ref!.forge]}`, onPress: () => WebBrowser.openBrowserAsync(pr.url) },
      ...(open
        ? [
            {
              text: closeLabel,
              style: 'destructive' as const,
              onPress: () =>
                Alert.alert(`${closeLabel} ?`, 'Elle ne pourra plus être mergée.', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: closeLabel, style: 'destructive', onPress: () => run('close', (p) => p.close(prId), closeLabel) },
                ]),
            },
          ]
        : []),
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  const reviewed = pr?.myReview === 'approved' || pr?.myReview === 'changes';
  const placeholder = compose.kind === 'changes' ? 'Explique les changements demandés…' : compose.kind === 'reply' ? `Réponse à ${compose.to.author}…` : 'Ajouter un commentaire…';

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={!!mine?.loading && !!pr} onRefresh={reloadPr} tintColor={C.muted} />}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Pressable onPress={() => router.back()} style={[s.row, { gap: 2 }]}>
              <ChevronLeft size={16} color={C.accent} />
              <Text style={{ color: C.accent }}>Pull requests</Text>
            </Pressable>
            {pr && (
              <Pressable onPress={() => WebBrowser.openBrowserAsync(pr.url)} hitSlop={8}>
                <ExternalLink size={16} color={C.muted} />
              </Pressable>
            )}
          </View>

          {!pr && mine?.error && (
            <Card style={{ marginTop: 16, borderColor: C.red + '66', backgroundColor: C.redBg, gap: 10 }}>
              <Mono style={{ fontSize: 12 }}>{mine.error}</Mono>
              <Button title="Réessayer" variant="ghost" onPress={reloadPr} />
            </Card>
          )}
          {!pr && !mine?.error && <ActivityIndicator style={{ marginTop: 60 }} color={C.muted} />}

          {pr && (
            <>
              <Text style={[s.h2, { marginTop: 8 }]} selectable>
                {pr.title}
              </Text>
              <View style={[s.row, { gap: 8, marginTop: 8, flexWrap: 'wrap' }]}>
                <View style={[s.row, { gap: 4, backgroundColor: (pr.draft ? C.dim : prStateColor[pr.state]) + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }]}>
                  <CircleDot size={12} color={pr.draft ? C.dim : prStateColor[pr.state]} />
                  <Text style={{ color: pr.draft ? C.muted : prStateColor[pr.state], fontSize: 12, fontWeight: '700' }}>{pr.draft ? 'Brouillon' : prStateLabel[pr.state]}</Text>
                </View>
                <Text style={s.muted}>
                  #{pr.id} · {pr.author} · {ago(pr.updatedAt)}
                </Text>
              </View>
              <Mono style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                <Text style={{ color: C.accent }}>{pr.source}</Text> → <Text style={{ color: C.text }}>{pr.target}</Text>
              </Mono>

              {pr.reviewers.length > 0 && (
                <View style={[s.row, { gap: 6, flexWrap: 'wrap', marginTop: 12 }]}>
                  {pr.reviewers.map((r) => (
                    <ReviewBadge key={r.name} state={r.state} name={r.me ? `${r.name} (toi)` : r.name} />
                  ))}
                </View>
              )}

              {checks.length > 0 && (
                <Card style={{ marginTop: 12, padding: 0 }}>
                  <View style={[s.row, { gap: 8, padding: 12 }]}>
                    {failed ? <XCircle size={16} color={C.red} /> : pending ? <ActivityIndicator size="small" color={C.orange} /> : <Check size={16} color={C.green} />}
                    <Text style={{ color: C.text, fontWeight: '600', flex: 1 }}>
                      {failed ? `${failed} check${failed > 1 ? 's' : ''} en échec` : pending ? `${pending} check${pending > 1 ? 's' : ''} en cours` : 'Tous les checks sont passés'}
                    </Text>
                    <Text style={s.muted}>{checks.length}</Text>
                  </View>
                  {checks.map((c, i) => (
                    <Pressable key={c.name + i} disabled={!c.url} onPress={() => c.url && WebBrowser.openBrowserAsync(c.url)} style={[s.row, { gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: C.border }]}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: checkColor[c.state] }} />
                      <Text style={{ color: C.text, fontSize: 12, flex: 1 }} numberOfLines={1}>
                        {c.name}
                      </Text>
                      {c.url && <ChevronRight size={12} color={C.dim} />}
                    </Pressable>
                  ))}
                </Card>
              )}

              {open && pr.mergeHint && (
                <Card style={{ marginTop: 12, borderColor: C.orange + '55', backgroundColor: C.orangeBg }}>
                  <Text style={{ color: C.orange, fontSize: 12 }}>{pr.mergeHint}</Text>
                </Card>
              )}

              {open && (
                <View style={[s.row, { gap: 8, marginTop: 14 }]}>
                  <ActionBtn
                    icon={busy === 'approve' ? <ActivityIndicator size="small" color={C.green} /> : reviewed ? <X size={18} color={C.muted} /> : <Check size={18} color={C.green} />}
                    label={reviewed ? 'Retirer ma revue' : 'Approuver'}
                    color={reviewed ? C.muted : C.green}
                    disabled={!!busy}
                    onPress={toggleApprove}
                  />
                  <ActionBtn
                    icon={<MessageSquareReply size={18} color={C.orange} />}
                    label="Changements"
                    color={C.orange}
                    disabled={!!busy || pr.myReview === 'changes'}
                    onPress={() => {
                      setTab('discussion');
                      setCompose({ kind: 'changes' });
                    }}
                  />
                  <ActionBtn icon={<GitMerge size={18} color="#fff" />} label="Merge" primary disabled={!canMerge || !!busy} onPress={() => router.push('/git/pr/merge')} />
                  <ActionBtn icon={<Text style={{ color: C.text, fontSize: 16, lineHeight: 18, fontWeight: '800' }}>⋯</Text>} label="Plus" disabled={!!busy} onPress={more} />
                </View>
              )}
              {!open && (
                <View style={{ marginTop: 14 }}>
                  <Button title={`Ouvrir sur ${forgeLabel[ref.forge]}`} variant="ghost" onPress={() => WebBrowser.openBrowserAsync(pr.url)} />
                </View>
              )}

              <View style={{ marginTop: 18 }}>
                <Segmented
                  options={[
                    { value: 'discussion', label: `Discussion${threads.length ? ` · ${threads.flat().length}` : ''}` },
                    { value: 'files', label: `Fichiers${mine!.files ? ` · ${mine!.files.length}` : ''}` },
                    { value: 'commits', label: `Commits${mine!.commits ? ` · ${mine!.commits.length}` : ''}` },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
              </View>

              {tab === 'discussion' && (
                <>
                  <Card style={{ marginTop: 12 }}>
                    <Text style={[s.section, { marginBottom: 6 }]}>DESCRIPTION</Text>
                    {pr.body.trim() ? (
                      <Text selectable style={{ color: C.text, fontSize: 14, lineHeight: 20 }}>
                        {pr.body.trim()}
                      </Text>
                    ) : (
                      <Text style={s.muted}>Aucune description.</Text>
                    )}
                  </Card>
                  {!threads.length && <Text style={[s.muted, { textAlign: 'center', marginTop: 20 }]}>Aucun commentaire.</Text>}
                  {threads.map((thread) => {
                    const root = thread[0].c;
                    return (
                      <Card key={`${root.kind}-${root.id}`} style={{ marginTop: 10, paddingVertical: 4 }}>
                        {root.path && (
                          <Pressable onPress={() => router.push({ pathname: '/git/pr/file', params: { path: root.path! } })}>
                            <Mono style={{ fontSize: 11, color: C.accent, paddingTop: 8 }} numberOfLines={1}>
                              {root.path}
                              {root.line ? `:${root.line}` : ''}
                            </Mono>
                          </Pressable>
                        )}
                        {thread.map(({ c, depth }) => (
                          <CommentView
                            key={`${c.kind}-${c.id}`}
                            c={c}
                            depth={depth}
                            onReply={
                              c.kind === 'review' && !c.body.trim()
                                ? undefined
                                : () => {
                                    setTab('discussion');
                                    setCompose({ kind: 'reply', to: c });
                                  }
                            }
                          />
                        ))}
                      </Card>
                    );
                  })}
                </>
              )}

              {tab === 'files' &&
                (!mine!.files ? (
                  <ActivityIndicator style={{ marginTop: 30 }} color={C.muted} />
                ) : (
                  <Card style={{ padding: 0, marginTop: 12 }}>
                    {!mine!.files.length && <Text style={[s.muted, { padding: 14 }]}>Aucun fichier.</Text>}
                    {mine!.files.map((f, i) => (
                      <Pressable key={f.path} onPress={() => router.push({ pathname: '/git/pr/file', params: { path: f.path } })} style={[s.row, { gap: 10, padding: 12, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
                        <View style={{ width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: fileColor[f.status] + '22' }}>
                          <Mono style={{ fontSize: 11, color: fileColor[f.status] }}>{fileLetter[f.status]}</Mono>
                        </View>
                        <Mono style={{ flex: 1, fontSize: 12 }} numberOfLines={2}>
                          {f.oldPath ? `${f.oldPath} → ` : ''}
                          {f.path}
                        </Mono>
                        <Mono style={{ fontSize: 11 }}>
                          <Text style={{ color: C.green }}>+{f.add}</Text> <Text style={{ color: C.red }}>-{f.del}</Text>
                        </Mono>
                      </Pressable>
                    ))}
                  </Card>
                ))}

              {tab === 'commits' &&
                (!mine!.commits ? (
                  <ActivityIndicator style={{ marginTop: 30 }} color={C.muted} />
                ) : (
                  <Card style={{ padding: 0, marginTop: 12 }}>
                    {mine!.commits.map((c, i) => (
                      <View key={c.sha} style={{ padding: 12, gap: 2, borderTopWidth: i ? 1 : 0, borderColor: C.border }}>
                        <Mono style={{ color: C.orange, fontSize: 12 }}>{c.sha.slice(0, 7)}</Mono>
                        <Text style={{ color: C.text, fontSize: 13 }}>{c.msg}</Text>
                        <Text style={{ color: C.dim, fontSize: 11 }}>
                          {c.author} · {ago(c.time)}
                        </Text>
                      </View>
                    ))}
                  </Card>
                ))}
            </>
          )}
        </ScrollView>

        {pr && tab === 'discussion' && (
          <View style={{ borderTopWidth: 1, borderColor: C.border, backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 8 }}>
            {compose.kind !== 'comment' && (
              <View style={[s.row, { gap: 6, marginBottom: 6 }]}>
                <Text style={{ color: compose.kind === 'changes' ? C.orange : C.accent, fontSize: 12, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                  {compose.kind === 'changes' ? 'Demande de changements' : `Réponse à ${compose.to.author} : ${compose.to.body.replace(/\s+/g, ' ').slice(0, 60)}`}
                </Text>
                <Pressable onPress={() => setCompose({ kind: 'comment' })} hitSlop={10}>
                  <X size={14} color={C.muted} />
                </Pressable>
              </View>
            )}
            <View style={[s.row, { gap: 8, alignItems: 'flex-end' }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={placeholder}
                placeholderTextColor={C.dim}
                multiline
                autoFocus={compose.kind !== 'comment'}
                key={compose.kind === 'reply' ? `r${compose.to.id}` : compose.kind}
                style={{ flex: 1, maxHeight: 140, minHeight: 38, backgroundColor: C.surface2, color: C.text, borderRadius: 10, paddingHorizontal: 10, paddingTop: 9, paddingBottom: 9, fontSize: 14 }}
              />
              <Pressable
                onPress={send}
                disabled={!!busy}
                style={{ height: 38, minWidth: 38, paddingHorizontal: compose.kind === 'changes' ? 12 : 0, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: compose.kind === 'changes' ? C.orange : C.accent, opacity: text.trim() || compose.kind === 'changes' ? 1 : 0.5 }}>
                {busy === 'send' ? <ActivityIndicator size="small" color="#fff" /> : compose.kind === 'changes' ? <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Demander</Text> : <Send size={16} color="#fff" />}
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
