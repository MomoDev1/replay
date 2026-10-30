export type SshErrorCode = 'DNS' | 'TIMEOUT' | 'REFUSED' | 'AUTH_FAILED' | 'HOST_KEY_MISMATCH' | 'BAD_KEY' | 'NO_SESSION' | 'NO_SHELL' | 'UNSUPPORTED' | 'SSH';

export type ConnectOptions = { host: string; port: number; knownFingerprint?: string | null; timeoutMs?: number };
export type ConnectResult = { sessionId: string; fingerprint: string; latencyMs: number };
export type AuthOptions = { user: string; password?: string; privateKey?: string; passphrase?: string };
export type GeneratedKey = { privateKey: string; publicKey: string; fingerprint: string };
export type KeyInfo = { type: string; publicKey: string; fingerprint: string };

export type RelaySshModuleEvents = {
  onData: (e: { sessionId: string; data: string }) => void;
  onClose: (e: { sessionId: string; reason: string | null }) => void;
};
