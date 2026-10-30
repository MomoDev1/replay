import type { Env } from '@/theme';

export type ServerStatus = 'online' | 'offline' | 'unknown';
export type AuthMethod = 'key' | 'password';

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  env: Env;
  auth: AuthMethod;
  keyId: string | null;
  path: string;
  status: ServerStatus;
  lastError: string | null;
  lastConnectedAt: number | null;
  createdAt: number;
}

export type ServerInput = Pick<Server, 'name' | 'host' | 'port' | 'user' | 'env' | 'auth' | 'keyId' | 'path'>;

export interface SshKey {
  id: string;
  name: string;
  type: string;
  fingerprint: string;
  publicKey: string;
  createdAt: number;
}
