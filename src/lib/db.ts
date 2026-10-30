import type { SQLiteDatabase } from 'expo-sqlite';

import type { Server, SshKey } from '@/lib/types';

export const DB_NAME = 'relay.db';
const VERSION = 1;

export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const v = row?.user_version ?? 0;
  if (v >= VERSION) return;
  if (v === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE servers (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 22,
        user TEXT NOT NULL,
        env TEXT NOT NULL DEFAULT 'dev',
        auth TEXT NOT NULL DEFAULT 'key',
        key_id TEXT,
        path TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'unknown',
        last_error TEXT,
        last_connected_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE ssh_keys (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        public_key TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE known_hosts (
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        PRIMARY KEY (host, port)
      );
    `);
  }
  await db.execAsync(`PRAGMA user_version = ${VERSION}`);
}

type ServerRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  env: Server['env'];
  auth: Server['auth'];
  key_id: string | null;
  path: string;
  status: Server['status'];
  last_error: string | null;
  last_connected_at: number | null;
  created_at: number;
};

export const toServer = (r: ServerRow): Server => ({
  id: r.id,
  name: r.name,
  host: r.host,
  port: r.port,
  user: r.user,
  env: r.env,
  auth: r.auth,
  keyId: r.key_id,
  path: r.path,
  status: r.status,
  lastError: r.last_error,
  lastConnectedAt: r.last_connected_at,
  createdAt: r.created_at,
});

type KeyRow = { id: string; name: string; type: string; fingerprint: string; public_key: string; created_at: number };

export const toKey = (r: KeyRow): SshKey => ({
  id: r.id,
  name: r.name,
  type: r.type,
  fingerprint: r.fingerprint,
  publicKey: r.public_key,
  createdAt: r.created_at,
});

export const listServers = async (db: SQLiteDatabase) => (await db.getAllAsync<ServerRow>('SELECT * FROM servers ORDER BY name')).map(toServer);
export const listKeys = async (db: SQLiteDatabase) => (await db.getAllAsync<KeyRow>('SELECT * FROM ssh_keys ORDER BY created_at')).map(toKey);

export async function getKnownHost(db: SQLiteDatabase, host: string, port: number) {
  const r = await db.getFirstAsync<{ fingerprint: string }>('SELECT fingerprint FROM known_hosts WHERE host = ? AND port = ?', host, port);
  return r?.fingerprint ?? null;
}

export const setKnownHost = (db: SQLiteDatabase, host: string, port: number, fingerprint: string) =>
  db.runAsync('INSERT OR REPLACE INTO known_hosts (host, port, fingerprint) VALUES (?, ?, ?)', host, port, fingerprint);

export const forgetKnownHost = (db: SQLiteDatabase, host: string, port: number) => db.runAsync('DELETE FROM known_hosts WHERE host = ? AND port = ?', host, port);
