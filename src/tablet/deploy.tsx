import * as Clipboard from 'expo-clipboard';
import { router, useIsFocused } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';

import { confirmBiometric } from '@/lib/auth';
import { clock, fmtDuration, plan as loadPlan, saveSteps, stepsFor, when, type Plan, type StepDef } from '@/lib/deploy';
import type { Server } from '@/lib/types';
import { cancel, dismiss, history, isCancelling, start, useHistoryVersion, useRun, type DeployRecord, type Run, type RunStep, type StepState } from '@/store/deploy';
import { repoFor } from '@/store/git';
import { useSession } from '@/store/session';
import { alpha, monoF, T } from '@/tablet/theme';
import { Btn, card, Empty, EnvTag, Label, Meter, st, TabletScreen, Tx, vline } from '@/tablet/ui';

type Target = { kind: 'deploy' | 'rollback'; to: { version: string; sha: string } };

export function TabletDeploy() {
  const session = useSession();
  if (!session?.open) {
    const server = session?.server;
    return (
      <TabletScreen>
        <Empty
          title="Aucune session"
          text="Connecte-toi au serveur à déployer : le pipeline s’exécute dans son dossier de projet."
          action={<Btn title={server ? 'Se reconnecter' : 'Choisir un serveur'} style={{ marginTop: 8 }} onPress={() => (server ? router.push(`/connect/${server.id}`) : router.navigate('/'))} />}
        />
      </TabletScreen>
    );
  }
  return <Pipeline key={session.server.id} server={session.server} />;
}

/** Current time, refreshed every second while `on`, for the elapsed clocks. */
function useNow(on: boolean) {
  const [now, set] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

function Pipeline({ server }: { server: Server }) {
  const db = useSQLiteContext();
  const focused = useIsFocused();
  const repo = repoFor(server);
  const liveRun = useRun();
  const run = liveRun?.serverId === server.id ? liveRun : null;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [hist, setHist] = useState<DeployRecord[]>([]);
  const [confirm, setConfirm] = useState<Target | null>(null);
  const [configuring, setConfiguring] = useState(false);
  // Step whose logs are shown, for the current step of the current run only (then it follows the run again).
  const [view, setView] = useState<{ at: string; i: number } | null>(null);
  const [steps, setStepsState] = useState<StepDef[]>(() => stepsFor(server.id));
  const hv = useHistoryVersion();
  const running = run?.phase === 'running';
  const now = useNow(running);

  useEffect(() => {
    let live = true;
    history(db, server.id, 6).then((h) => live && setHist(h));
    return () => {
      live = false;
    };
  }, [db, server.id, hv]);

  // Describe the next deploy whenever the screen is shown and nothing runs (after a deploy HEAD has moved).
  useEffect(() => {
    if (!focused || running) return;
    let live = true;
    loadPlan(repo).then(
      (p) => {
        if (!live) return;
        setPlan(p);
        setPlanError(null);
      },
      (e) => live && setPlanError((e as Error).message),
    );
    return () => {
      live = false;
    };
  }, [focused, running, repo, hv]);

  const otherRun = liveRun && liveRun.phase === 'running' && liveRun.serverId !== server.id;
  const okDurations = hist.filter((h) => h.status === 'ok' && h.kind === 'deploy').slice(0, 3);
  const estimate = okDurations.length ? okDurations.reduce((a, h) => a + h.durationMs, 0) / okDurations.length : null;
  const rollbackTo = plan ? hist.find((h) => h.status === 'ok' && h.sha !== plan.sha) : null;

  async function go(t: Target) {
    setConfirm(null);
    await start(db, server, repo, { kind: t.kind, from: { version: plan?.version ?? '?', sha: plan?.sha ?? '' }, to: t.to });
  }

  function ask(t: Target) {
    if (server.env === 'prod' || t.kind === 'rollback') setConfirm(t);
    else go(t);
  }

  // ---- what the left column shows
  const shownSteps: RunStep[] = run ? run.steps : steps.map((s) => ({ ...s, state: s.cmd.trim() ? 'wait' : 'skip', startedAt: null, durMs: null, log: [], exit: null }));
  const total = shownSteps.filter((s) => s.cmd.trim()).length;
  const done = shownSteps.filter((s) => s.state === 'ok').length;
  const cur = run ? run.steps[run.current] : null;
  const elapsed = run ? Math.max(0, (run.endedAt ?? now) - run.startedAt) : 0;
  const what = run?.kind === 'rollback' ? 'rollback' : 'déploiement';

  let title = 'Prêt à déployer';
  let summary = estimate ? `${total} étapes · ~${fmtDuration(estimate)} estimé` : `${total} étapes`;
  let sumColor = T.muted;
  let pct = 0;
  if (run?.phase === 'running') {
    title = run.kind === 'rollback' ? 'Rollback en cours' : 'Déploiement en cours';
    summary = isCancelling() ? 'Annulation…' : `Étape ${done + 1} sur ${total} · ${cur?.name ?? ''}`;
    sumColor = T.orange;
    pct = ((done + 0.5) / total) * 100;
  } else if (run?.phase === 'ok') {
    title = run.kind === 'rollback' ? 'Rollback réussi' : 'Déploiement réussi';
    summary = `${done} étape${done > 1 ? 's' : ''} réussie${done > 1 ? 's' : ''} · ${run.to.version} en service`;
    sumColor = T.green;
    pct = 100;
  } else if (run) {
    const failedIdx = run.steps.filter((s) => s.cmd.trim()).findIndex((s) => s.state === 'ko');
    title = run.phase === 'cancelled' ? `${run.kind === 'rollback' ? 'Rollback' : 'Déploiement'} annulé` : `Échec du ${what}`;
    summary = `${run.phase === 'cancelled' ? 'Arrêté' : 'Échec'} à l’étape ${failedIdx + 1} · ${run.error?.step ?? ''}`;
    sumColor = T.red;
    pct = (done / total) * 100 + 4;
  }

  const at = `${run?.id}:${run?.current}`;
  const logIdx = view?.at === at ? view.i : run ? run.current : null;
  const logStep = logIdx != null ? shownSteps[logIdx] : null;
  const failed = run && (run.phase === 'ko' || run.phase === 'cancelled');

  return (
    <TabletScreen>
      <View style={[{ flexGrow: 1, flexShrink: 1, flexBasis: 320, minWidth: 0, paddingVertical: 16, paddingHorizontal: 20, gap: 14 }, vline]}>
        <View style={{ gap: 6 }}>
          <Tx w={700} style={{ fontSize: 26 }}>
            {title}
          </Tx>
          <View style={[st.row, { gap: 8 }]}>
            <EnvTag env={server.env} />
            <Tx mono style={{ fontSize: 13, color: T.muted, flexShrink: 1 }} numberOfLines={1}>
              {server.name} · {run ? `${run.to.version} · ${run.to.sha}` : plan ? `${plan.target.version} · ${plan.target.sha}` : planError ? 'version inconnue' : '…'}
            </Tx>
          </View>
        </View>

        <View style={[card, { paddingVertical: 12, paddingHorizontal: 14, gap: 8 }]}>
          <View style={[st.row, { justifyContent: 'space-between' }]}>
            <Tx style={{ fontSize: 13.5, color: sumColor, flexShrink: 1 }} numberOfLines={1}>
              {summary}
            </Tx>
            <Tx mono style={{ fontSize: 13.5, color: T.muted }}>
              {run ? clock(elapsed) : ''}
            </Tx>
          </View>
          <Meter pct={pct} color={sumColor} height={6} />
        </View>

        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 6 }}>
          {shownSteps.map((s, i) => (
            <StepRow key={i} s={s} selected={logIdx === i && !!run} onPress={run ? () => setView({ at, i }) : undefined} />
          ))}
          {!run && (
            <Pressable onPress={() => setConfiguring(true)} style={{ alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 2 }}>
              <Tx w={600} style={{ fontSize: 13, color: T.blue }}>
                Configurer le pipeline · {repo}
              </Tx>
            </Pressable>
          )}
        </ScrollView>

        <View style={{ flex: 1 }} />
        {planError && !run && (
          <Tx mono style={{ fontSize: 12, color: T.red }}>
            {planError}
          </Tx>
        )}
        {otherRun && !run && <Tx style={{ fontSize: 12.5, color: T.orange }}>Un déploiement est déjà en cours sur un autre serveur.</Tx>}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {!run && (
            <Btn
              title={plan ? (plan.commits ? `Déployer ${plan.target.version}` : `Redéployer ${plan.version}`) : 'Déployer'}
              height={52}
              radius={15}
              textStyle={{ fontSize: 15 }}
              style={{ flex: 1 }}
              disabled={!plan || !!otherRun}
              onPress={() => plan && ask({ kind: 'deploy', to: plan.target })}
            />
          )}
          {running && <Btn title={isCancelling() ? 'Annulation…' : `Annuler le ${what}`} kind="outline" height={52} radius={15} textStyle={{ fontSize: 15, color: T.text2 }} style={{ flex: 1 }} disabled={isCancelling()} onPress={cancel} />}
          {run && !running && (
            <>
              <Btn title="Ouvrir un terminal" kind={failed ? 'primary' : 'ghost'} height={52} radius={15} textStyle={{ fontSize: 15 }} style={{ flex: 1 }} onPress={() => router.navigate('/terminal')} />
              <Btn title={failed ? 'Relancer' : 'Terminé'} kind={failed ? 'ghost' : 'primary'} height={52} radius={15} textStyle={{ fontSize: 15 }} style={{ flex: 1 }} onPress={dismiss} />
            </>
          )}
        </View>
      </View>

      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 340, minWidth: 0, paddingVertical: 16, paddingHorizontal: 20, gap: 14 }}>
        <View style={[st.row, { justifyContent: 'space-between' }]}>
          <Label>{logStep ? `LOGS · ${logStep.name.toUpperCase()}${logStep.state === 'run' ? ' (EN DIRECT)' : ''}` : 'LOGS'}</Label>
          {!!logStep?.log.length && (
            <Pressable onPress={() => Clipboard.setStringAsync(logStep.log.join('\n'))} hitSlop={8}>
              <Tx style={{ fontSize: 12, color: T.muted }}>Copier</Tx>
            </Pressable>
          )}
        </View>
        {failed && run.error && <FailureBox run={run} />}
        <LogBox step={logStep} />

        <Label>HISTORIQUE</Label>
        <View style={card}>
          {hist.slice(0, 4).map((h) => {
            const [icon, c] = h.status !== 'ok' ? ['✕', T.red] : h.kind === 'rollback' ? ['↺', T.orange] : ['✓', T.green];
            return (
              <View key={h.id} style={[st.row, { minHeight: 50, gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: T.cardLine }]}>
                <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c, 0.15) }}>
                  <Tx w={700} style={{ fontSize: 12, color: c }}>
                    {icon}
                  </Tx>
                </View>
                <Tx w={600} style={{ fontSize: 14 }} numberOfLines={1}>
                  {h.version}
                </Tx>
                <Tx mono style={{ fontSize: 11.5, color: T.orange }}>
                  {h.sha}
                </Tx>
                <Tx style={{ flex: 1, fontSize: 12, color: T.dim, textAlign: 'right' }} numberOfLines={1}>
                  {when(h.startedAt)} · {fmtDuration(h.durationMs)}
                </Tx>
              </View>
            );
          })}
          {!hist.length && (
            <View style={{ minHeight: 50, justifyContent: 'center', paddingHorizontal: 14, borderBottomWidth: 1, borderColor: T.cardLine }}>
              <Tx style={{ fontSize: 13, color: T.dim }}>Aucun déploiement depuis cet appareil.</Tx>
            </View>
          )}
          <Pressable
            disabled={!rollbackTo || running || !!otherRun}
            onPress={() => rollbackTo && ask({ kind: 'rollback', to: { version: rollbackTo.version, sha: rollbackTo.sha } })}
            style={({ pressed }) => ({ height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? T.field : 'transparent', opacity: rollbackTo && !running ? 1 : 0.45 })}>
            <Tx w={600} style={{ fontSize: 14 }}>
              {rollbackTo ? `↺ Rollback vers ${rollbackTo.version}` : '↺ Rollback (aucune version précédente)'}
            </Tx>
          </Pressable>
        </View>
      </View>

      {confirm && plan && <ConfirmModal server={server} plan={plan} target={confirm} onCancel={() => setConfirm(null)} onConfirm={() => go(confirm)} />}
      {configuring && (
        <ConfigModal
          repo={repo}
          steps={steps}
          onClose={() => setConfiguring(false)}
          onSave={(next) => {
            saveSteps(server.id, next);
            setStepsState(next);
            setConfiguring(false);
          }}
        />
      )}
    </TabletScreen>
  );
}

function StepRow({ s, selected, onPress }: { s: RunStep; selected: boolean; onPress?: () => void }) {
  const state: StepState = s.state;
  const bg = state === 'run' ? alpha(T.orange, 0.08) : state === 'ko' ? alpha(T.red, 0.08) : T.card;
  const bd = state === 'run' ? alpha(T.orange, 0.4) : state === 'ko' ? alpha(T.red, 0.5) : selected ? T.btnLine : T.cardLine;
  const tc = state === 'wait' || state === 'skip' ? T.dim : state === 'ko' ? T.red : T.text;
  const dc = state === 'run' ? T.orange : state === 'ko' ? T.red : T.dim;
  const d = state === 'ok' || state === 'ko' ? (s.durMs != null ? fmtDuration(s.durMs) : '') : state === 'run' ? clock(s.durMs ?? 0) : state === 'skip' ? 'ignorée' : '—';
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[st.row, { minHeight: 58, borderRadius: 14, gap: 12, paddingHorizontal: 14, backgroundColor: bg, borderWidth: 1, borderColor: bd }]}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: state === 'ok' ? T.green : state === 'ko' ? T.red : 'transparent',
          borderWidth: state === 'run' ? 3 : state === 'ok' || state === 'ko' ? 0 : 2,
          borderColor: state === 'run' ? T.orange : T.ring,
        }}>
        {state === 'run' ? (
          <ActivityIndicator size="small" color={T.orange} style={{ transform: [{ scale: 0.6 }] }} />
        ) : (
          <Tx w={700} style={{ fontSize: 12, color: T.ink }}>
            {state === 'ok' ? '✓' : state === 'ko' ? '✕' : ''}
          </Tx>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Tx w={600} style={{ fontSize: 15, color: tc }}>
          {s.name}
        </Tx>
        <Tx mono style={{ fontSize: 11.5, color: T.dim }} numberOfLines={1}>
          {s.cmd.trim() || 'aucune commande'}
        </Tx>
      </View>
      <Tx mono style={{ fontSize: 12, color: dc }}>
        {d}
      </Tx>
    </Pressable>
  );
}

function LogBox({ step }: { step: RunStep | null }) {
  const ref = useRef<ScrollViewInstance>(null);
  return (
    <ScrollView ref={ref} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200, minHeight: 0, backgroundColor: T.term, borderRadius: 14 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingVertical: 12, paddingHorizontal: 14 }} onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}>
      {!step && <Tx style={{ fontSize: 12.5, color: T.dim }}>Les logs de chaque étape s’affichent ici pendant le déploiement.</Tx>}
      {step && !step.log.length && (
        <Tx mono style={{ fontSize: 12, color: T.dim }}>
          {step.state === 'run' ? '$ ' + step.cmd : step.state === 'skip' ? 'Étape ignorée.' : 'Aucune sortie.'}
        </Tx>
      )}
      {step?.log.map((l, i) => (
        <Tx key={i} mono selectable style={{ fontSize: 12, lineHeight: 19.8, color: /^\s*(✓|ok\b|done\b)/i.test(l) ? T.green : /^\s*(✕|✗|error|err!|fatal)/i.test(l) ? T.red : T.soft }}>
          {l}
        </Tx>
      ))}
    </ScrollView>
  );
}

function FailureBox({ run }: { run: Run }) {
  const e = run.error!;
  return (
    <>
      <View style={{ borderWidth: 1.5, borderColor: T.red, backgroundColor: alpha(T.red, 0.1), borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}>
        <Tx mono style={{ fontSize: 12.5, lineHeight: 20, color: '#F2DCD8' }}>
          {e.text}
        </Tx>
        <Tx mono style={{ fontSize: 12.5, lineHeight: 20, color: T.soft }}>
          étape {e.step}
          {e.exit != null && e.exit >= 0 ? ` · exit ${e.exit}` : ''}
        </Tx>
      </View>
      {run.touchedService ? (
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: alpha(T.orange, 0.1), borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 }}>
          <Tx w={700} style={{ fontSize: 13, color: T.orange }}>
            !
          </Tx>
          <Tx style={{ flex: 1, fontSize: 13 }}>
            <Tx w={600} style={{ fontSize: 13 }}>
              Service peut-être affecté.
            </Tx>{' '}
            Le redémarrage a été lancé : vérifie l’application ou fais un rollback.
          </Tx>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: alpha(T.green, 0.1), borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 }}>
          <Tx w={700} style={{ fontSize: 13, color: T.green }}>
            ✓
          </Tx>
          <Tx style={{ flex: 1, fontSize: 13 }}>
            <Tx w={600} style={{ fontSize: 13 }}>
              Service non redémarré.
            </Tx>{' '}
            {run.from.version} toujours en service.
          </Tx>
        </View>
      )}
    </>
  );
}

function ConfirmModal({ server, plan, target, onCancel, onConfirm }: { server: Server; plan: Plan; target: Target; onCancel: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState('');
  const prod = server.env === 'prod';
  const tone = prod ? T.red : T.orange;
  const ok = !prod || typed.trim() === server.name;
  const rollback = target.kind === 'rollback';

  async function faceId() {
    if (await confirmBiometric(`${rollback ? 'Rollback' : 'Déployer'} ${target.to.version} sur ${server.name}`)) onConfirm();
  }

  return (
    <Modal transparent animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ width: '100%', maxWidth: 520, backgroundColor: T.card, borderWidth: 1.5, borderColor: alpha(tone, 0.6), borderRadius: 24, overflow: 'hidden' }}>
          <View style={{ height: 6, backgroundColor: tone }} />
          <View style={{ padding: 24, gap: 18 }}>
            <View style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 7, backgroundColor: tone }}>
              <Tx mono w={700} style={{ fontSize: 12, letterSpacing: 1.7, color: '#140606' }}>
                {prod ? 'PRODUCTION' : server.env.toUpperCase()}
              </Tx>
            </View>
            <Tx w={700} style={{ fontSize: 26, lineHeight: 31 }}>
              {rollback ? 'Revenir à ' : 'Déployer '}
              {target.to.version} sur{' '}
              <Tx mono w={600} style={{ fontSize: 26, color: tone }}>
                {server.name}
              </Tx>{' '}
              ?
            </Tx>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, backgroundColor: T.bg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 3 }}>
                <Tx style={{ fontSize: 12, color: T.muted }}>{rollback ? 'Retour depuis' : 'Changements'}</Tx>
                <Tx style={{ fontSize: 13.5 }}>{rollback ? `${plan.version} · ${plan.sha}` : `${plan.commits} commit${plan.commits > 1 ? 's' : ''} · ${plan.files} fichier${plan.files > 1 ? 's' : ''}`}</Tx>
              </View>
              <View style={{ flex: 1, backgroundColor: T.bg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 3 }}>
                <Tx style={{ fontSize: 12, color: T.muted }}>Migrations</Tx>
                <Tx w={rollback || plan.migrations ? 600 : 400} style={{ fontSize: 13.5, color: rollback || plan.migrations ? T.orange : T.text }}>
                  {rollback ? 'non annulées' : plan.migrations ? `${plan.migrations} en attente` : 'aucune nouvelle'}
                </Tx>
              </View>
            </View>
            {prod && (
              <View style={{ gap: 8 }}>
                <Tx style={{ fontSize: 14, color: T.text2 }}>
                  Tapez{' '}
                  <Tx mono w={600} style={{ fontSize: 14 }}>
                    {server.name}
                  </Tx>{' '}
                  pour confirmer
                </Tx>
                <TextInput value={typed} onChangeText={setTyped} autoFocus autoCapitalize="none" autoCorrect={false} spellCheck={false} selectionColor={T.red} style={[{ height: 54, borderRadius: 14, backgroundColor: T.term, borderWidth: 1.5, borderColor: T.dashed, paddingHorizontal: 16, fontSize: 16, color: T.text }, monoF(400)]} />
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={onConfirm} disabled={!ok} style={({ pressed }) => ({ flex: 1, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: ok ? tone : T.field, opacity: pressed ? 0.8 : 1 })}>
                <Tx w={600} style={{ fontSize: 15, color: ok ? '#140606' : T.faint }}>
                  {rollback ? 'Rollback' : 'Déployer'}
                </Tx>
              </Pressable>
              {prod && (
                <Pressable onPress={faceId} style={({ pressed }) => [st.row, { flex: 1, height: 56, borderRadius: 16, justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: T.btnLine, opacity: pressed ? 0.8 : 1 }]}>
                  <View style={{ width: 20, height: 20, borderWidth: 2, borderColor: T.text, borderRadius: 6 }} />
                  <Tx w={600} style={{ fontSize: 15 }}>
                    Face ID
                  </Tx>
                </Pressable>
              )}
            </View>
            <Pressable onPress={onCancel} style={{ alignItems: 'center' }} hitSlop={10}>
              <Tx style={{ fontSize: 14, color: T.muted }}>Annuler</Tx>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ConfigModal({ repo, steps, onClose, onSave }: { repo: string; steps: StepDef[]; onClose: () => void; onSave: (s: StepDef[]) => void }) {
  const [draft, setDraft] = useState(steps);
  return (
    <Modal transparent animationType="fade" supportedOrientations={['portrait', 'landscape']} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <View style={{ width: '100%', maxWidth: 620, maxHeight: '100%', backgroundColor: T.card, borderWidth: 1, borderColor: T.chip, borderRadius: 24, overflow: 'hidden' }}>
          <View style={[st.row, { height: 60, justifyContent: 'space-between', paddingHorizontal: 22, borderBottomWidth: 1, borderColor: T.cardLine }]}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Tx style={{ fontSize: 16, color: T.muted }}>Annuler</Tx>
            </Pressable>
            <Tx w={600} style={{ fontSize: 17 }}>
              Pipeline
            </Tx>
            <Pressable onPress={() => onSave(draft)} hitSlop={10}>
              <Tx w={600} style={{ fontSize: 16, color: T.blue }}>
                Enregistrer
              </Tx>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 22, gap: 14 }} keyboardShouldPersistTaps="handled">
            <Tx style={{ fontSize: 13, color: T.soft }}>
              Chaque commande s’exécute dans <Tx mono style={{ fontSize: 13 }}>{repo}</Tx> via un shell de connexion (bash -l). Laisse un champ vide pour ignorer l’étape. Un rollback remplace le pull par un retour au commit choisi et saute les migrations.
            </Tx>
            {draft.map((s, i) => (
              <View key={s.name} style={{ gap: 6 }}>
                <Tx style={{ fontSize: 13, color: T.muted }}>
                  {i + 1}. {s.name}
                </Tx>
                <TextInput
                  value={s.cmd}
                  onChangeText={(cmd) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, cmd } : x)))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  placeholder="(étape ignorée)"
                  placeholderTextColor={T.faint}
                  style={[{ height: 50, borderRadius: 12, backgroundColor: T.bg, borderWidth: 1, borderColor: T.chip, paddingHorizontal: 14, fontSize: 14, color: T.text }, monoF(400)]}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
