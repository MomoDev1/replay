import { useLocalSearchParams } from 'expo-router';
import { CircleCheck, CircleX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Mono, s, Sheet, SheetHeader } from '@/components/ui';
import { git } from '@/lib/git';
import { currentRepo, refresh, useGit } from '@/store/git';
import { C } from '@/theme';

type Result = { ok: boolean; output: string; ms: number };

/** Runs `git pull` or `git push` (param `op`) and shows its output. */
export default function PullSheet() {
  const { op = 'pull' } = useLocalSearchParams<{ op?: 'pull' | 'push' }>();
  const st = useGit()?.status;
  const [res, setRes] = useState<Result | null>(null);
  // Snapshot the command once: the status refreshes after the run.
  const [cmd] = useState(() => (op === 'push' ? (st?.upstream ? 'push' : `push -u origin ${st?.branch ?? 'HEAD'}`) : 'pull --ff-only'));

  useEffect(() => {
    const t0 = Date.now();
    git(currentRepo(), cmd, { allowFail: true, timeoutMs: 300_000 })
      .then((r) => setRes({ ok: r.exitCode === 0, output: r.output || (r.exitCode === 0 ? 'Déjà à jour.' : ''), ms: Date.now() - t0 }))
      .catch((e) => setRes({ ok: false, output: (e as Error).message, ms: Date.now() - t0 }))
      .finally(refresh);
  }, [cmd]);

  const lines = res?.output.split('\n') ?? [];
  const failMsg = op === 'pull' && res?.output.includes('Not possible to fast-forward') ? 'Branches divergentes : fusionne ou rebase depuis le terminal' : 'Échec';

  return (
    <Sheet>
      <SheetHeader
        title={`git ${cmd}`}
        subtitle={
          <View style={[s.row, { gap: 6, marginTop: 4 }]}>
            {!res ? <ActivityIndicator size="small" color={C.orange} /> : res.ok ? <CircleCheck size={14} color={C.green} /> : <CircleX size={14} color={C.red} />}
            <Text style={{ color: !res ? C.orange : res.ok ? C.green : C.red, fontSize: 12, flex: 1 }}>
              {!res ? 'En cours…' : res.ok ? `Terminé en ${(res.ms / 1000).toFixed(1).replace('.', ',')} s` : failMsg}
            </Text>
          </View>
        }
      />
      <View style={{ backgroundColor: C.bg, borderRadius: 10, padding: 12, minHeight: 160 }}>
        {lines.map((l, i) => (
          <Mono key={i} selectable style={{ fontSize: 11, lineHeight: 16, color: /^(fatal|error|CONFLICT|!)/.test(l.trim()) ? C.red : l === 'Fast-forward' ? C.green : C.muted }}>
            {l}
          </Mono>
        ))}
      </View>
    </Sheet>
  );
}
