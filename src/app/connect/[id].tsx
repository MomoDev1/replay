import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Check, ShieldQuestion, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Dot, Mono, s, SectionLabel } from '@/components/ui';
import { forgetKnownHost, getKnownHost, setKnownHost } from '@/lib/db';
import { asSshError, credentialsFor, ssh, type SshError } from '@/lib/ssh';
import type { Server } from '@/lib/types';
import { openSession } from '@/store/session';
import { useServer, useServers } from '@/store/servers';
import { C } from '@/theme';

const STEPS = ['Connexion au serveur', 'Vérification de l’empreinte', 'Authentification', 'Ouverture du shell'];

type Pending = { sessionId: string; fingerprint: string; latencyMs: number };

const isPrivate = (host: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host) || host.endsWith('.local');

function hints(err: SshError, sv: Server): [string, string][] {
  switch (err.code) {
    case 'TIMEOUT':
      return [
        ...(isPrivate(sv.host) ? ([[C.orange, 'Adresse privée : le VPN de l’équipe est-il actif ?']] as [string, string][]) : []),
        [C.dim, `Port ${sv.port} filtré par le pare-feu ?`],
        [C.dim, 'Le serveur est-il allumé et joignable depuis ce réseau ?'],
      ];
    case 'REFUSED':
      return [[C.orange, `Aucun service SSH n’écoute sur le port ${sv.port}.`], [C.dim, 'sshd est-il démarré ? (systemctl status ssh)']];
    case 'DNS':
      return [[C.orange, `Le nom « ${sv.host} » ne se résout pas.`], [C.dim, 'Vérifie l’orthographe ou utilise l’adresse IP.']];
    case 'AUTH_FAILED':
      return sv.auth === 'key'
        ? [[C.orange, `La clé publique est-elle dans ~/.ssh/authorized_keys de ${sv.user} ?`], [C.dim, 'Réglages → Clés SSH pour copier la clé publique.']]
        : [[C.orange, `Mot de passe ou utilisateur « ${sv.user} » incorrect ?`], [C.dim, 'PasswordAuthentication est peut-être désactivé côté serveur.']];
    case 'HOST_KEY_MISMATCH':
      return [[C.red, 'Le serveur a peut-être été réinstallé… ou la connexion est interceptée.'], [C.dim, 'Vérifie l’empreinte auprès de l’administrateur avant de continuer.']];
    case 'UNSUPPORTED':
      return [[C.orange, 'Installe le dev build de Hop (Expo Go ne contient pas le module SSH).']];
    default:
      return [];
  }
}

export default function Connect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const server = useServer(id);
  const { setStatus } = useServers();
  const db = useSQLiteContext();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<SshError | null>(null);
  const [trust, setTrust] = useState<Pending | null>(null);
  const pending = useRef<string | null>(null);
  const alive = useRef(true);

  async function abort() {
    if (pending.current) await ssh().disconnect(pending.current).catch(() => {});
    pending.current = null;
  }

  function fail(e: unknown) {
    if (!alive.current || !server) return;
    const err = asSshError(e);
    pending.current = null;
    setError(err);
    const unreachable = err.code === 'TIMEOUT' || err.code === 'REFUSED' || err.code === 'DNS';
    setStatus(server.id, unreachable ? 'offline' : server.status, err.message);
  }

  async function authAndShell(p: Pending) {
    if (!server) return;
    setStep(2);
    await ssh().authenticate(p.sessionId, await credentialsFor(server));
    if (!alive.current) return abort();
    setStep(3);
    await ssh().startShell(p.sessionId, 80, 24);
    if (!alive.current) return abort();
    pending.current = null;
    openSession(p.sessionId, server, p.latencyMs);
    await setStatus(server.id, 'online');
    router.replace('/terminal');
  }

  async function run() {
    if (!server) return;
    setError(null);
    setTrust(null);
    setStep(0);
    try {
      const known = await getKnownHost(db, server.host, server.port);
      const r = await ssh().connect({ host: server.host, port: server.port, knownFingerprint: known });
      pending.current = r.sessionId;
      if (!alive.current) return abort();
      setStep(1);
      if (!known) return setTrust(r);
      await authAndShell(r);
    } catch (e) {
      fail(e);
    }
  }

  async function accept() {
    if (!trust || !server) return;
    const p = trust;
    setTrust(null);
    try {
      await setKnownHost(db, server.host, server.port, p.fingerprint);
      await authAndShell(p);
    } catch (e) {
      fail(e);
    }
  }

  useEffect(() => {
    alive.current = true;
    queueMicrotask(run);
    return () => {
      alive.current = false;
      abort();
    };
    // Connect once per mount; retries go through run().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!server) {
    return (
      <SafeAreaView style={[s.screen, { padding: 20, justifyContent: 'center' }]}>
        <Text style={[s.h2, { textAlign: 'center' }]}>Serveur introuvable</Text>
        <Button title="Retour" variant="ghost" style={{ marginTop: 20 }} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const addr = `${server.user}@${server.host}:${server.port}`;

  if (error) {
    return (
      <SafeAreaView style={s.screen}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
          <View style={{ alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: C.redBg, alignItems: 'center', justifyContent: 'center' }}>
            <X size={28} color={C.red} />
          </View>
          <Text style={[s.h2, { textAlign: 'center', marginTop: 16 }]}>{error.code === 'HOST_KEY_MISMATCH' ? 'Empreinte modifiée' : error.code === 'AUTH_FAILED' ? 'Authentification refusée' : 'Connexion impossible'}</Text>
          <Mono style={{ color: C.muted, textAlign: 'center', fontSize: 12, marginTop: 6 }}>
            {server.name} · {addr}
          </Mono>
          <Card style={{ marginTop: 20, borderColor: C.red + '66', backgroundColor: C.redBg }}>
            <Mono style={{ fontSize: 12 }}>{error.message}</Mono>
            <Mono style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{error.code}</Mono>
          </Card>
          {hints(error, server).length > 0 && <SectionLabel>Pistes</SectionLabel>}
          {hints(error, server).map(([c, t]) => (
            <View key={t} style={[s.row, { gap: 10, marginBottom: 8, alignItems: 'flex-start' }]}>
              <View style={{ marginTop: 5 }}>
                <Dot color={c} size={6} />
              </View>
              <Text style={{ color: C.text, fontSize: 13, flex: 1 }}>{t}</Text>
            </View>
          ))}
          {error.code === 'HOST_KEY_MISMATCH' ? (
            <Button
              title="Oublier l’ancienne empreinte"
              variant="outlineDanger"
              style={{ marginTop: 16 }}
              onPress={async () => {
                await forgetKnownHost(db, server.host, server.port);
                run();
              }}
            />
          ) : (
            <Button title="Réessayer" style={{ marginTop: 16 }} onPress={run} />
          )}
          <View style={[s.row, { gap: 8, marginTop: 8 }]}>
            <Button title="Modifier" variant="ghost" style={{ flex: 1 }} onPress={() => router.replace({ pathname: '/server/new', params: { id: server.id } })} />
            <Button title="Retour" variant="ghost" style={{ flex: 1 }} onPress={() => router.back()} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (trust) {
    return (
      <SafeAreaView style={[s.screen, { padding: 20, justifyContent: 'center' }]}>
        <View style={{ alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: C.orangeBg, alignItems: 'center', justifyContent: 'center' }}>
          <ShieldQuestion size={28} color={C.orange} />
        </View>
        <Text style={[s.h2, { textAlign: 'center', marginTop: 16 }]}>Nouveau serveur</Text>
        <Text style={[s.muted, { textAlign: 'center', marginTop: 6 }]}>Première connexion à {server.host}. Vérifie que l’empreinte correspond à celle du serveur.</Text>
        <Card style={{ marginTop: 20 }}>
          <Text style={[s.muted, { fontSize: 11 }]}>Empreinte de la clé hôte</Text>
          <Mono style={{ marginTop: 6, fontSize: 12 }} selectable>
            {trust.fingerprint}
          </Mono>
        </Card>
        <Button title="Faire confiance et continuer" style={{ marginTop: 20 }} onPress={accept} />
        <Button
          title="Annuler"
          variant="ghost"
          style={{ marginTop: 8 }}
          onPress={async () => {
            await abort();
            router.back();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.screen, { padding: 20, justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={C.orange} />
      <Text style={[s.h2, { textAlign: 'center', marginTop: 16 }]}>Connexion à {server.name}</Text>
      <Mono style={{ color: C.muted, textAlign: 'center', fontSize: 12, marginTop: 6 }}>{addr}</Mono>
      <Card style={{ marginTop: 24, padding: 0 }}>
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <View key={label} style={[s.row, { padding: 14, gap: 10, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
              {done ? <Check size={14} color={C.green} /> : <Dot color={active ? C.orange : C.dim} size={6} />}
              <Text style={{ flex: 1, color: done || active ? C.text : C.dim }}>{label}</Text>
              {i === 2 && (done || active) && <Mono style={{ fontSize: 11, color: C.muted }}>{server.auth === 'key' ? 'clé' : 'mot de passe'}</Mono>}
            </View>
          );
        })}
      </Card>
      <Button
        title="Annuler"
        variant="ghost"
        style={{ marginTop: 20 }}
        onPress={async () => {
          alive.current = false;
          await abort();
          router.back();
        }}
      />
    </SafeAreaView>
  );
}
