import { router } from 'expo-router';
import { ArrowUp, Check, ChevronDown, RotateCcw, X } from 'lucide-react-native';
import { Fragment } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Dot, EnvBadge, Mono, s, SectionLabel } from '@/components/ui';
import { deployHistory } from '@/data/mock';
import { C } from '@/theme';

const STEPS = ['pull', 'install', 'build', 'migrate', 'restart', 'verify'];

export default function DeployScreen() {
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.h1}>Déployer</Text>
        <Card style={{ marginTop: 12 }}>
          <View style={[s.row, { gap: 8 }]}>
            <Dot color={C.green} />
            <Text style={{ color: C.text, fontWeight: '700', flex: 1 }}>api-prod-01</Text>
            <EnvBadge env="prod" />
            <ChevronDown size={14} color={C.muted} />
          </View>
          <Mono style={{ marginTop: 8, fontSize: 12 }}>
            main @ <Text style={{ color: C.orange }}>d7e03b8</Text>
          </Mono>
          <Text style={[s.muted, { fontSize: 11, marginTop: 2 }]}>7 commits depuis v2.13.4 · 2 migrations en attente</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 4, marginTop: 10 }]}>
            {STEPS.map((st, i) => (
              <Fragment key={st}>
                <View style={{ backgroundColor: C.surface2, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Mono style={{ fontSize: 10, color: C.muted }}>{st}</Mono>
                </View>
                {i < STEPS.length - 1 && <Text style={{ color: C.dim, fontSize: 10 }}>→</Text>}
              </Fragment>
            ))}
          </View>
          <Button title="Déployer en production" variant="danger" icon={<ArrowUp size={16} color="#fff" />} style={{ marginTop: 14 }} onPress={() => router.push('/deploy/confirm')} />
        </Card>

        <Card style={{ marginTop: 12 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.section}>EN PRODUCTION</Text>
            <Text style={{ color: C.green, fontSize: 11 }}>● Sain · 84 ms</Text>
          </View>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginTop: 6 }}>
            v2.13.4 <Mono style={{ color: C.orange, fontSize: 13 }}>9c1e7b0</Mono>
          </Text>
          <Text style={[s.muted, { fontSize: 12 }]}>Déployée hier à 17:58 par Sarah K.</Text>
          <Button title="Rollback vers v2.13.3" variant="ghost" icon={<RotateCcw size={14} color={C.text} />} style={{ marginTop: 12, paddingVertical: 10 }} />
        </Card>

        <SectionLabel>Historique</SectionLabel>
        <Card style={{ padding: 0 }}>
          {deployHistory.map((d, i) => (
            <View key={i} style={[s.row, { gap: 12, padding: 12, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: d.ok ? C.greenBg : C.redBg }}>
                {d.ok ? <Check size={13} color={C.green} /> : <X size={13} color={C.red} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '700' }}>
                  {d.v} <Mono style={{ color: C.orange, fontSize: 11 }}>{d.sha}</Mono>
                </Text>
                <Text style={{ color: C.text, fontSize: 12 }}>{d.msg}</Text>
                <Text style={{ color: C.dim, fontSize: 11 }}>{d.meta}</Text>
              </View>
              <Text style={{ color: d.ok ? C.green : C.red, fontSize: 11 }}>{d.ok ? 'Réussi' : 'Échec'}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
