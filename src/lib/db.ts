import type { SQLiteDatabase } from 'expo-sqlite';

import type { Server, Snippet, SshKey } from '@/lib/types';

export const DB_NAME = 'relay.db';
const VERSION = 2;

const SEED_SNIPPETS: [string, string][] = [
  ['Redémarrer un service', 'sudo systemctl restart {service:api|worker|nginx|redis}'],
  ['Logs d’un service', 'journalctl -u {service:api|worker|nginx|redis} -n {lignes:50|200|1000} -f'],
  ['Vider le cache', 'php artisan cache:clear && php artisan config:cache'],
  ['État des conteneurs', 'docker compose ps'],
  ['Purger une file', 'redis-cli -n {db:0|1|2} DEL queue:{file}'],
  ['Recharger Nginx', 'sudo nginx -t && sudo systemctl reload nginx'],
];

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
  if (v < 2) {
    await db.execAsync(`
      CREATE TABLE snippets (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        title TEXT NOT NULL,
        cmd TEXT NOT NULL,
        fav INTEGER NOT NULL DEFAULT 0,
        last_vars TEXT,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL
      );
    `);
    const now = Date.now();
    for (const [i, [title, cmd]] of SEED_SNIPPETS.entries()) {
      await db.runAsync('INSERT INTO snippets (id, server_id, title, cmd, fav, created_at) VALUES (?, NULL, ?, ?, ?, ?)', `seed-${i}`, title, cmd, i === 4 ? 0 : 1, now + i);
    }
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

type SnippetRow = { id: string; server_id: string | null; title: string; cmd: string; fav: number; last_vars: string | null; last_used_at: number | null; created_at: number };

export const toSnippet = (r: SnippetRow): Snippet => ({
  id: r.id,
  serverId: r.server_id,
  title: r.title,
  cmd: r.cmd,
  fav: !!r.fav,
  lastVars: r.last_vars ? JSON.parse(r.last_vars) : {},
  lastUsedAt: r.last_used_at,
  createdAt: r.created_at,
});

export const listSnippets = async (db: SQLiteDatabase) => (await db.getAllAsync<SnippetRow>('SELECT * FROM snippets ORDER BY created_at')).map(toSnippet);
