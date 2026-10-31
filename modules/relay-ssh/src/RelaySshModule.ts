import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { AuthOptions, ConnectOptions, ConnectResult, ExecResult, GeneratedKey, KeyInfo, RelaySshModuleEvents } from './RelaySsh.types';

declare class RelaySshModule extends NativeModule<RelaySshModuleEvents> {
  connect(opts: ConnectOptions): Promise<ConnectResult>;
  authenticate(sessionId: string, opts: AuthOptions): Promise<void>;
  startShell(sessionId: string, cols: number, rows: number): Promise<void>;
  /** `data` is base64. */
  write(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  /** Runs a command on a separate channel of the connection and waits for it to exit. */
  exec(sessionId: string, command: string, timeoutMs: number | null): Promise<ExecResult>;
  disconnect(sessionId: string): Promise<void>;
  generateKey(comment: string): Promise<GeneratedKey>;
  inspectKey(privateKey: string, passphrase: string | null): Promise<KeyInfo>;
}

// Implemented on Android (sshj) and iOS (SwiftNIO SSH); null on web and in Expo Go so the app still boots.
export default requireOptionalNativeModule<RelaySshModule>('RelaySsh');
