import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { listKeys, listServers } from '@/lib/db';
import { deletePassword, deletePrivateKey, setPassword, setPrivateKey } from '@/lib/secrets';
import { ssh } from '@/lib/ssh';
import type { Server, ServerInput, ServerStatus, SshKey } from '@/lib/types';

type Store = {
  servers: Server[];
  keys: SshKey[];
  ready: boolean;
  saveServer: (input: ServerInput, opts: { id?: string; password?: string }) => Promise<string>;
  deleteServer: (id: string) => Promise<void>;
  setStatus: (id: string, status: ServerStatus, error?: string | null) => Promise<void>;
  generateKey: (name: string) => Promise<SshKey>;
  importKey: (name: string, privateKey: string, passphrase?: string) => Promise<SshKey>;
  deleteKey: (id: string) => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function ServersProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [servers, setServers] = useState<Server[]>([]);
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const [sv, k] = await Promise.all([listServers(db), listKeys(db)]);
    setServers(sv);
    setKeys(k);
    setReady(true);
  }, [db]);

  useEffect(() => {
    let live = true;
    Promise.all([listServers(db), listKeys(db)]).then(([sv, k]) => {
      if (!live) return;
      setServers(sv);
      setKeys(k);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [db]);

  const store = useMemo<Store>(() => {
    async function insertKey(name: string, type: string, fingerprint: string, publicKey: string) {
      const key: SshKey = { id: randomUUID(), name, type, fingerprint, publicKey, createdAt: Date.now() };
      await db.runAsync(
        'INSERT INTO ssh_keys (id, name, type, fingerprint, public_key, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        key.id, key.name, key.type, key.fingerprint, key.publicKey, key.createdAt,
      );
      return key;
    }

    return {
      servers,
      keys,
      ready,
      async saveServer(input, { id, password }) {
        const sid = id ?? randomUUID();
        const vals = [input.name, input.host, input.port, input.user, input.env, input.auth, input.auth === 'key' ? input.keyId : null, input.path];
        if (id) {
          await db.runAsync('UPDATE servers SET name = ?, host = ?, port = ?, user = ?, env = ?, auth = ?, key_id = ?, path = ? WHERE id = ?', ...vals, sid);
        } else {
          await db.runAsync('INSERT INTO servers (name, host, port, user, env, auth, key_id, path, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ...vals, sid, Date.now());
        }
        if (input.auth === 'password' && password) await setPassword(sid, password);
        if (input.auth === 'key') await deletePassword(sid);
        await reload();
        return sid;
      },
      async deleteServer(id) {
        await db.runAsync('DELETE FROM servers WHERE id = ?', id);
        await db.runAsync('DELETE FROM snippets WHERE server_id = ?', id);
        await deletePassword(id);
        await reload();
      },
      async setStatus(id, status, error = null) {
        if (status === 'online') await db.runAsync('UPDATE servers SET status = ?, last_error = NULL, last_connected_at = ? WHERE id = ?', status, Date.now(), id);
        else await db.runAsync('UPDATE servers SET status = ?, last_error = ? WHERE id = ?', status, error, id);
        await reload();
      },
      async generateKey(name) {
        const g = await ssh().generateKey(`${name}@relay`);
        const key = await insertKey(name, 'ssh-ed25519', g.fingerprint, g.publicKey);
        await setPrivateKey(key.id, g.privateKey);
        await reload();
        return key;
      },
      async importKey(name, privateKey, passphrase) {
        const info = await ssh().inspectKey(privateKey, passphrase || null);
        const key = await insertKey(name, info.type, info.fingerprint, info.publicKey);
        await setPrivateKey(key.id, privateKey, passphrase);
        await reload();
        return key;
      },
      async deleteKey(id) {
        await db.runAsync('DELETE FROM ssh_keys WHERE id = ?', id);
        await db.runAsync('UPDATE servers SET key_id = NULL WHERE key_id = ?', id);
        await deletePrivateKey(id);
        await reload();
      },
    };
  }, [db, servers, keys, ready, reload]);

  return <Ctx value={store}>{children}</Ctx>;
}

export function useServers() {
  const s = use(Ctx);
  if (!s) throw new Error('useServers must be used inside <ServersProvider>');
  return s;
}

export function useServer(id: string | undefined) {
  const { servers } = useServers();
  return servers.find((sv) => sv.id === id);
}
