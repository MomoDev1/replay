import ExpoModulesCore

struct ConnectOptions: Record {
  @Field var host: String = ""
  @Field var port: Int = 22
  @Field var knownFingerprint: String?
  @Field var timeoutMs: Int = 15000
}

struct AuthOptions: Record {
  @Field var user: String = ""
  @Field var password: String?
  @Field var privateKey: String?
  @Field var passphrase: String?
}

/// Same JS contract as the Android module (see src/RelaySshModule.ts); the work is done by SshCore.
public class RelaySshModule: Module {
  private let core = SshCore()

  public func definition() -> ModuleDefinition {
    Name("RelaySsh")

    Events("onData", "onClose")

    OnCreate {
      self.core.onData = { [weak self] id, data in
        self?.sendEvent("onData", ["sessionId": id, "data": data])
      }
      self.core.onClose = { [weak self] id, reason in
        self?.sendEvent("onClose", ["sessionId": id, "reason": reason])
      }
    }

    OnDestroy {
      self.core.closeAll()
    }

    // Opens the transport and returns the host key fingerprint. Credentials are only sent by `authenticate`,
    // so the caller can ask the user to trust an unknown fingerprint first.
    AsyncFunction("connect") { (opts: ConnectOptions) async throws -> [String: Any] in
      let r = try await bridged {
        try await self.core.connect(host: opts.host, port: opts.port, knownFingerprint: opts.knownFingerprint, timeoutMs: opts.timeoutMs)
      }
      return ["sessionId": r.sessionId, "fingerprint": r.fingerprint, "latencyMs": r.latencyMs]
    }

    AsyncFunction("authenticate") { (id: String, opts: AuthOptions) async throws in
      try await bridged {
        try await self.core.authenticate(id, user: opts.user, password: opts.password, privateKey: opts.privateKey, passphrase: opts.passphrase)
      }
    }

    AsyncFunction("startShell") { (id: String, cols: Int, rows: Int) async throws in
      try await bridged { try await self.core.startShell(id, cols: cols, rows: rows) }
    }

    AsyncFunction("write") { (id: String, data: String) async throws in
      try await bridged { try await self.core.write(id, base64: data) }
    }

    AsyncFunction("resize") { (id: String, cols: Int, rows: Int) async throws in
      try await bridged { try await self.core.resize(id, cols: cols, rows: rows) }
    }

    // Runs a one-off command on its own channel of the existing connection; the interactive shell is untouched.
    AsyncFunction("exec") { (id: String, command: String, timeoutMs: Int?) async throws -> [String: Any] in
      let r = try await bridged { try await self.core.exec(id, command: command, timeoutMs: timeoutMs) }
      return ["stdout": r.stdout, "stderr": r.stderr, "exitCode": r.exitCode]
    }

    AsyncFunction("disconnect") { (id: String) in
      self.core.disconnect(id)
    }

    AsyncFunction("generateKey") { (comment: String) -> [String: Any] in
      let g = self.core.generateKey(comment: comment)
      return ["privateKey": g.privateKeyPEM, "publicKey": g.publicKey, "fingerprint": g.fingerprint]
    }

    // Validates an imported private key and returns its public half.
    AsyncFunction("inspectKey") { (privateKey: String, passphrase: String?) async throws -> [String: Any] in
      let info = try await bridged { try self.core.inspectKey(privateKey, passphrase: passphrase) }
      return ["type": info.type, "publicKey": info.publicKey, "fingerprint": info.fingerprint]
    }
  }
}

/// Rethrows SshCore errors as coded exceptions, so JS sees the same `code` values as on Android.
private func bridged<T>(_ body: () async throws -> T) async throws -> T {
  do {
    return try await body()
  } catch let f as SshFailure {
    throw Exception(name: "SshError", description: f.message, code: f.code)
  } catch {
    throw Exception(name: "SshError", description: String(describing: error), code: "SSH")
  }
}
