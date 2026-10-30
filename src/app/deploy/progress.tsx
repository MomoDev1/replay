import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, EnvBadge, Mono, s } from '@/components/ui';
import { pipeline } from '@/data/mock';
import { C } from '@/theme';

type Phase = 'running' | 'success' | 'failed';

// Démo : la 1re exécution échoue aux migrations, la suivante réussit.
let attempts = 0;

export default function DeployProgress() {
  const failAt = attempts === 0 ? 3 : -1;
  const [step, setStep] = useState(2);
  const [open, setOpen] = useState<number | null>(2);
  const [phase, setPhase] = useState<Phase>('running');

  useEffect(() => {
    if (phase !== 'running') return;
    const t = setTimeout(() => {
      if (step === failAt) {
        attempts++;
        setPhase('failed');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (step === pipeline.length - 1) {
        setPhase('success');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setStep((n) => n + 1);
        setOpen(step + 1);
      }
    }, 1400);
    return () => clearTimeout(t);
  }, [step, phase, failAt]);

  if (phase === 'success') {
    return (
      <SafeAreaView style={[s.screen, { padding: 20, justifyContent: 'center' }]}>
        <View style={{ alignSelf: 'center', width: 84, height: 84, borderRadius: 42, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
            <Check size={32} color="#0B0B0D" strokeWidth={3} />
          </View>
        </View>
        <Text style={[s.h1, { fontSize: 26, textAlign: 'center', marginTop: 20 }]}>Déploiement réussi</Text>
        <Mono style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 6 }}>api-prod-01 · v2.14.0 · 1 min 10 s</Mono>
        <Card style={[s.row, { marginTop: 24, borderColor: C.green + '66', justifyContent: 'space-between' }]}>
          <View>
            <Mono style={{ fontSize: 12 }}>GET /health</Mono>
            <Text style={[s.muted, { fontSize: 11 }]}>version 2.14.0 en ligne</Text>
          </View>
          <Mono style={{ color: C.green, fontSize: 12 }}>200 · 84 ms</Mono>
        </Card>
        <Button title="Voir le monitoring" style={{ marginTop: 20 }} onPress={() => router.replace('/monitoring')} />
        <Button title="Terminer" variant="ghost" style={{ marginTop: 8 }} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  if (phase === 'failed') {
    return (
      <SafeAreaView style={s.screen}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={[s.row, { gap: 12 }]}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' }}>
              <X size={22} color="#fff" />
            </View>
            <View>
              <Text style={s.h2}>Échec du déploiement</Text>
              <Text style={[s.muted, { fontSize: 12 }]}>
                Étape 4 sur 6 · <Text style={{ color: C.red }}>Migrations</Text> · 1 min 05 s
              </Text>
            </View>
          </View>
          <Card style={{ marginTop: 20, borderColor: C.red, backgroundColor: C.redBg }}>
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
              <Mono style={{ color: C.red, fontSize: 12, fontWeight: '700' }}>npm run migrate</Mono>
              <Mono style={{ color: C.red, fontSize: 11 }}>exit 1</Mono>
            </View>
            <Mono style={{ fontSize: 11, lineHeight: 16 }}>
              SQLSTATE[42701]: column &quot;archived_at&quot; of relation &quot;invoices&quot; already exists{'\n'}  at 2026_10_29_add_archived_at.ts:14{'\n'}  Batch 42 rolled back (0/2 applied)
            </Mono>
          </Card>
          <View style={{ backgroundColor: C.greenBg, borderRadius: 10, padding: 12, marginTop: 12 }}>
            <Text style={{ color: C.text, fontSize: 12 }}>
              <Text style={{ color: C.green, fontWeight: '700' }}>Production intacte. </Text>v2.13.4 continue de tourner, aucun redémarrage effectué.
            </Text>
          </View>
          <Button title="Relancer le déploiement" style={{ marginTop: 20 }} onPress={() => { setStep(2); setOpen(2); setPhase('running'); }} />
          <Button title="Ouvrir un terminal" variant="ghost" style={{ marginTop: 8 }} onPress={() => router.replace('/terminal')} />
          <Button title="Fermer" variant="ghost" style={{ marginTop: 8 }} onPress={() => router.back()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const pct = ((step + 0.5) / pipeline.length) * 100;

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={[s.h1, { fontSize: 26 }]}>Déploiement en cours</Text>
        <View style={[s.row, { gap: 6, marginTop: 4 }]}>
          <EnvBadge env="prod" />
          <Mono style={{ color: C.muted, fontSize: 11 }}>api-prod-01 · v2.14.0 · d7e03b8</Mono>
        </View>
        <Card style={{ marginTop: 14 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: C.text, fontSize: 12 }}>
              Étape {step + 1} sur {pipeline.length} · <Text style={{ color: C.orange }}>{pipeline[step].name}</Text>
            </Text>
            <Mono style={{ fontSize: 11, color: C.muted }}>en cours</Mono>
          </View>
          <View style={{ height: 4, backgroundColor: C.surface2, borderRadius: 2, marginTop: 10 }}>
            <View style={{ width: `${pct}%`, height: 4, backgroundColor: C.orange, borderRadius: 2 }} />
          </View>
        </Card>
        <View style={{ marginTop: 16 }}>
          {pipeline.map((p, i) => {
            const st = i < step ? 'done' : i === step ? 'running' : 'pending';
            const expanded = open === i && 'logs' in p;
            return (
              <View key={p.name} style={{ marginBottom: 14 }}>
                <Pressable onPress={() => setOpen(open === i ? null : i)} style={[s.row, { gap: 12 }]}>
                  {st === 'done' ? (
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={13} color="#0B0B0D" strokeWidth={3} />
                    </View>
                  ) : st === 'running' ? (
                    <ActivityIndicator size="small" color={C.orange} style={{ width: 22 }} />
                  ) : (
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.dim }} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: st === 'pending' ? C.muted : C.text, fontWeight: '600' }}>{p.name}</Text>
                    <Mono style={{ fontSize: 11, color: C.dim }}>{p.cmd}</Mono>
                  </View>
                  <Text style={{ fontSize: 11, color: st === 'running' ? C.orange : C.muted }}>{st === 'done' ? ('time' in p ? p.time : '') : st === 'running' ? 'en cours' : ''}</Text>
                  {expanded ? <ChevronUp size={14} color={C.muted} /> : <ChevronDown size={14} color={C.dim} />}
                </Pressable>
                {expanded && 'logs' in p && (
                  <View style={{ marginLeft: 34, marginTop: 8, backgroundColor: C.surface, borderRadius: 8, padding: 10 }}>
                    {p.logs.map((l) => (
                      <Mono key={l} style={{ fontSize: 11, color: C.muted, lineHeight: 16 }}>
                        {l}
                      </Mono>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <Text style={[s.muted, { textAlign: 'center', fontSize: 12 }]}>Vous serez notifié à la fin, même app fermée.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
