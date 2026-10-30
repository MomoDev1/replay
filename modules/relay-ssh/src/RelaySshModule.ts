import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { AuthOptions, ConnectOptions, ConnectResult, GeneratedKey, KeyInfo, RelaySshModuleEvents } from './RelaySsh.types';

declare class RelaySshModule extends NativeModule<RelaySshModuleEvents> {
  connect(opts: ConnectOptions): Promise<ConnectResult>;
  authenticate(sessionId: string, opts: AuthOptions): Promise<void>;
  startShell(sessionId: string, cols: number, rows: number): Promise<void>;
  /** `data` is base64. */
  write(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  disconnect(sessionId: string): Promise<void>;
  generateKey(comment: string): Promise<GeneratedKey>;
  inspectKey(privateKey: string, passphrase: string | null): Promise<KeyInfo>;
}

// Only implemented on Android for now; null elsewhere so the app still boots.
export default requireOptionalNativeModule<RelaySshModule>('RelaySsh');
