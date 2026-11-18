import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert } from 'react-native';

import { getKnownHost, setKnownHost } from '@/lib/db';
import { asSshError, credentialsFor, ssh } from '@/lib/ssh';
import { asciiPunct } from '@/lib/text';
import type { AuthMethod } from '@/lib/types';
import { useServer, useServers } from '@/store/servers';
import type { Env } from '@/theme';

/** State and actions of the add / edit server form, shared by the phone and tablet layouts. */
export type Test = { state: 'running' } | { state: 'ok'; latencyMs: number; fingerprint: string } | { state: 'error'; message: string };

export function useServerForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useServer(id);
  const { keys, saveServer, generateKey } = useServers();
  const db = useSQLiteContext();

  const [name, setName] = useState(existing?.name ?? '');
  const [host, setHost] = useState(existing?.host ?? '');
  const [port, setPort] = useState(String(existing?.port ?? 22));
  const [user, setUser] = useState(existing?.user ?? '');
  const [auth, setAuth] = useState<AuthMethod>(existing?.auth ?? 'key');
  const [pickedKey, setKeyId] = useState<string | null>(existing?.keyId ?? null);
  const keyId = pickedKey ?? keys[0]?.id ?? null;
  const [password, setPassword] = useState('');
  const [env, setEnv] = useState<Env>(existing?.env ?? 'dev');
  const [path, setPath] = useState(existing?.path ?? '');
  const [test, setTest] = useState<Test | null>(null);
  const [busy, setBusy] = useState(false);

  const portNum = Number(port);
  const problems = [
    !host.trim() && 'Hôte requis',
    !user.trim() && 'Utilisateur requis',
    !(Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535) && 'Port invalide (1–65535)',
    auth === 'key' && !keyId && 'Choisis ou génère une clé SSH',
    // An existing password server may keep its saved password; one switching from a key has none yet.
    auth === 'password' && existing?.auth !== 'password' && !password && 'Mot de passe requis',
  ].filter(Boolean) as string[];

  function input() {
    return { name: name.trim() || host.trim(), host: host.trim(), port: portNum, user: user.trim(), env, auth, keyId, path: asciiPunct(path.trim()) };
  }

  async function runTest() {
    if (test?.state === 'running') return;
    if (problems.length) return Alert.alert('Formulaire incomplet', problems.join('\n'));
    setTest({ state: 'running' });
    let sid: string | null = null;
    try {
      const creds = await credentialsFor({ id: existing?.id ?? '', user: user.trim(), auth, keyId }, auth === 'password' && password ? password : undefined);
      const r = await ssh().connect({ host: host.trim(), port: portNum, knownFingerprint: await getKnownHost(db, host.trim(), portNum) });
      sid = r.sessionId;
      await ssh().authenticate(sid, creds);
      setTest({ state: 'ok', latencyMs: r.latencyMs, fingerprint: r.fingerprint });
    } catch (e) {
      setTest({ state: 'error', message: asSshError(e).message });
    } finally {
      if (sid) ssh().disconnect(sid).catch(() => {});
    }
  }

  async function save() {
    if (problems.length) return Alert.alert('Formulaire incomplet', problems.join('\n'));
    setBusy(true);
    try {
      const data = input();
      await saveServer(data, { id: existing?.id, password: auth === 'password' ? password : undefined });
      // The user just saw this fingerprint while testing: treat it as trusted.
      if (test?.state === 'ok') await setKnownHost(db, data.host, data.port, test.fingerprint);
      router.back();
    } catch (e) {
      Alert.alert('Enregistrement impossible', asSshError(e).message);
    } finally {
      setBusy(false);
    }
  }

  async function newKey() {
    try {
      const k = await generateKey(`relay_ed25519${keys.length ? `_${keys.length + 1}` : ''}`);
      setKeyId(k.id);
      router.push(`/key/${k.id}`);
    } catch (e) {
      Alert.alert('Génération impossible', asSshError(e).message);
    }
  }

  return { existing, keys, keyId, setKeyId, name, setName, host, setHost, port, setPort, user, setUser, auth, setAuth, password, setPassword, env, setEnv, path, setPath, test, busy, problems, runTest, save, newKey };
}

