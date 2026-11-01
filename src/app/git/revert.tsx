import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Mono, Radio, s, Sheet, SheetHeader } from '@/components/ui';
import { confirmBiometric } from '@/lib/auth';
import { ago, git } from '@/lib/git';
import { sq } from '@/lib/ssh';
import { act, currentRepo, useGit } from '@/store/git';
import { useSession } from '@/store/session';
import { C } from '@/theme';

export default function RevertSheet() {
  const { sha } = useLocalSearchParams<{ sha: string }>();
  const g = useGit();
  const server = useSession()?.server;
  const commit = g?.commits.find((c) => c.full === sha);
  const [mode, setMode] = useState<'revert' | 'reset'>('revert');
  const [after, setAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const short = commit?.sha ?? sha?.slice(0, 7);

  useEffect(() => {
    git(currentRepo(), `rev-list --count ${sq(sha)}..HEAD`)
      .then((r) => setAfter(Number(r.stdout.trim())))
      .catch(() => {});
  }, [sha]);

  async function run() {
    if (busy) return;
    if (mode === 'reset' && server?.env === 'prod' && !(await confirmBiometric(`git reset --hard sur ${server.name}`))) return;
    setBusy(true);
    const ok = await act(async (repo) => {
      if (mode === 'reset') return git(repo, `reset --hard ${sq(sha)}`);
      try {
        return await git(repo, `revert --no-edit ${sq(sha)}`);
      } catch (e) {
        // Leave the repo clean rather than half-reverted with conflicts.
        await git(repo, 'revert --abort', { allowFail: true });
        throw e;
      }
    });
    setBusy(false);
    if (ok) router.back();
  }

  const opt = (m: typeof mode, cmd: string, desc: string, danger?: boolean) => {
    const on = mode === m;
    const col = danger ? C.red : C.accent;
    return (
      <Pressable onPress={() => setMode(m)} style={[s.row, { gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? col : C.border, backgroundColor: on ? col + '14' : C.surface2, marginTop: 10 }]}>
        <Radio on={on} />
        <View style={{ flex: 1 }}>
          <Mono style={{ fontWeight: '700', color: danger ? C.red : C.text }}>{cmd}</Mono>
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{desc}</Text>
        </View>
      </Pressable>
    );
  };

  const dropped = after ? `${after} commit${after > 1 ? 's' : ''} après celui-ci ser${after > 1 ? 'ont' : 'a'} supprimé${after > 1 ? 's' : ''}, ainsi que les modifications non commitées.` : 'Les modifications non commitées seront supprimées.';

  return (
    <Sheet>
      <SheetHeader title="Revenir à un commit" subtitle={<Text style={s.muted}>{[g?.repo, g?.status?.branch, server?.name].filter(Boolean).join(' · ')}</Text>} />
      <Card style={{ backgroundColor: C.surface2 }}>
        <Mono style={{ color: C.orange, fontSize: 12 }}>{short}</Mono>
        {commit && <Text style={{ color: C.text, marginTop: 2 }}>{commit.msg}</Text>}
        <Text style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
          {commit ? `${commit.author} · ${ago(commit.time)}` : ''}
          {after !== null ? ` · ${after ? `${after} commit${after > 1 ? 's' : ''} après` : 'HEAD'}` : ''}
        </Text>
      </Card>
      {opt('revert', `git revert ${short}`, 'Sûr : crée un nouveau commit qui annule les changements de ce commit. L’historique est conservé.')}
      {opt('reset', `git reset --hard ${short}`, `Destructif : ${dropped}`, true)}
      <Button
        title={busy ? 'En cours…' : mode === 'revert' ? 'Créer le commit d’annulation' : 'Réinitialiser (destructif)'}
        variant={mode === 'revert' ? 'primary' : 'danger'}
        style={{ marginTop: 16, opacity: busy ? 0.6 : 1 }}
        onPress={run}
      />
      <Pressable onPress={() => router.back()} style={{ alignItems: 'center', padding: 12 }}>
        <Text style={s.muted}>Annuler</Text>
      </Pressable>
    </Sheet>
  );
}
