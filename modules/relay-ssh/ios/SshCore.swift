import Foundation
import NIOCore
import NIOSSH
#if canImport(Network)
import Network
import NIOTransportServices
#else
import NIOPosix
#endif

/// Error surfaced to JavaScript as `{ code, message }` (same codes as the Android module).
struct SshFailure: Error, CustomStringConvertible {
  let code: String
  let message: String
  init(_ code: String, _ message: String) {
    self.code = code
    self.message = message
  }
  var description: String { "\(code): \(message)" }
}

private let maxExecOutput = 2 * 1024 * 1024

/// SSH client used by the Expo module. Free of any Expo/React Native dependency so it can be tested
/// against a real sshd with SwiftPM on Linux. Mirrors the Android module (sshj) call for call:
/// `connect` stops after the key exchange so the app can ask the user to trust the host key, and
/// credentials are only sent by `authenticate`.
final class SshCore: @unchecked Sendable {
  struct ConnectResult {
    let sessionId: String
    let fingerprint: String
    let latencyMs: Int
  }

  struct ExecResult {
    let stdout: String
    let stderr: String
    let exitCode: Int
  }

  /// Shell output, base64-encoded.
  var onData: ((_ sessionId: String, _ base64: String) -> Void)?
  var onClose: ((_ sessionId: String, _ reason: String?) -> Void)?

  #if canImport(Network)
  // Network.framework, unlike BSD sockets, brings up the cellular radio and on-demand VPNs.
  private let group: EventLoopGroup = NIOTSEventLoopGroup.singleton
  #else
  private let group: EventLoopGroup = MultiThreadedEventLoopGroup.singleton
  #endif

  private let lock = NSLock()
  private var conns: [String: Connection] = [:]

  private func conn(_ id: String) throws -> Connection {
    lock.lock()
    defer { lock.unlock() }
    guard let c = conns[id] else { throw SshFailure("NO_SESSION", "Session inconnue : \(id)") }
    return c
  }

  // MARK: Connection

  func connect(host: String, port: Int, knownFingerprint: String?, timeoutMs: Int) async throws -> ConnectResult {
    let started = DispatchTime.now()
    let loop = group.next()
    let hostKey = HostKeyCheck(known: knownFingerprint, promise: loop.makePromise())
    let auth = DeferredAuth()
    let watcher = ConnectionWatcher(hostKey: hostKey.promise, authenticated: loop.makePromise())
    let initializer: @Sendable (Channel) -> EventLoopFuture<Void> = { channel in
      channel.eventLoop.makeCompletedFuture {
        let config = SSHClientConfiguration(userAuthDelegate: auth, serverAuthDelegate: hostKey)
        try channel.pipeline.syncOperations.addHandlers(
          NIOSSHHandler(role: .client(config), allocator: channel.allocator, inboundChildChannelInitializer: nil),
          watcher
        )
      }
    }

    let channel: Channel
    do {
      channel = try await bootstrap(timeoutMs: timeoutMs, initializer: initializer).connect(host: host, port: port).get()
    } catch {
      // The pipeline may never have been set up: settle its promises so they are not leaked.
      hostKey.promise.fail(error)
      watcher.authenticated.fail(error)
      throw SshCore.mapConnectError(error, host: host, port: port)
    }

    // Covers a server that accepts TCP but never finishes the key exchange.
    let deadline = loop.scheduleTask(in: .milliseconds(Int64(timeoutMs))) {
      hostKey.promise.fail(SshFailure("TIMEOUT", "ssh: connect to host \(host) port \(port): Connection timed out"))
    }
    let fingerprint: String
    do {
      fingerprint = try await hostKey.promise.futureResult.get()
      deadline.cancel()
    } catch {
      deadline.cancel()
      channel.close(promise: nil)
      throw SshCore.mapError(error, host: host, port: port)
    }

    let id = UUID().uuidString.lowercased()
    let c = Connection(channel: channel, auth: auth, watcher: watcher)
    lock.withLock { conns[id] = c }
    channel.closeFuture.whenComplete { [weak self] _ in
      self?.close(id, reason: watcher.closeReason)
    }
    let elapsed = Int((DispatchTime.now().uptimeNanoseconds - started.uptimeNanoseconds) / 1_000_000)
    return ConnectResult(sessionId: id, fingerprint: fingerprint, latencyMs: elapsed)
  }

  private func bootstrap(timeoutMs: Int, initializer: @escaping @Sendable (Channel) -> EventLoopFuture<Void>) -> NIOClientTCPBootstrapProtocol {
    #if canImport(Network)
    let tcp = NWProtocolTCP.Options()
    tcp.noDelay = true
    tcp.enableKeepalive = true
    tcp.keepaliveIdle = 30
    tcp.keepaliveInterval = 10
    tcp.keepaliveCount = 3
    tcp.connectionTimeout = max(1, timeoutMs / 1000)
    return NIOTSConnectionBootstrap(group: group)
      .connectTimeout(.milliseconds(Int64(timeoutMs)))
      // Fail right away (refused, DNS…) instead of waiting for the network path to change.
      .channelOption(NIOTSChannelOptions.waitForActivity, value: false)
      .tcpOptions(tcp)
      .channelInitializer(initializer)
    #else
    return ClientBootstrap(group: group)
      .connectTimeout(.milliseconds(Int64(timeoutMs)))
      .channelOption(ChannelOptions.tcpOption(.tcp_nodelay), value: 1)
      .channelOption(ChannelOptions.socketOption(.so_keepalive), value: 1)
      .channelInitializer(initializer)
    #endif
  }

  func authenticate(_ id: String, user: String, password: String?, privateKey: String?, passphrase: String?) async throws {
    let c = try conn(id)
    let offer: NIOSSHUserAuthenticationOffer.Offer
    if let privateKey {
      do {
        offer = .privateKey(.init(privateKey: try SshKeys.load(privateKey, passphrase: passphrase).privateKey))
      } catch {
        close(id, reason: nil)
        throw error
      }
    } else {
      offer = .password(.init(password: password ?? ""))
    }
    c.channel.eventLoop.execute { c.auth.provide(user: user, offer: offer) }
    do {
      try await c.watcher.authenticated.futureResult.get()
    } catch {
      close(id, reason: nil)
      throw SshCore.mapError(error, host: "", port: 0)
    }
  }

  // MARK: Shell

  func startShell(_ id: String, cols: Int, rows: Int) async throws {
    let c = try conn(id)
    let ready = c.channel.eventLoop.makePromise(of: Void.self)
    let handler = ShellHandler(ready: ready, onData: { [weak self] buffer in
      self?.onData?(id, Data(buffer.readableBytesView).base64EncodedString())
    })
    let shell: Channel
    do {
      shell = try await c.openChannel { $0.pipeline.addHandler(handler) }
    } catch {
      ready.fail(error)
      throw SshCore.mapError(error, host: "", port: 0)
    }
    shell.triggerUserOutboundEvent(SSHChannelRequestEvent.PseudoTerminalRequest(
      wantReply: false,
      term: "xterm-256color",
      terminalCharacterWidth: cols,
      terminalRowHeight: rows,
      terminalPixelWidth: 0,
      terminalPixelHeight: 0,
      terminalModes: SSHTerminalModes([:])
    ), promise: nil)
    shell.triggerUserOutboundEvent(SSHChannelRequestEvent.ShellRequest(wantReply: true), promise: nil)
    do {
      try await ready.futureResult.get()
    } catch {
      shell.close(promise: nil)
      throw error
    }
    c.setShell(shell)
    // As on Android, the connection goes away with its shell.
    shell.closeFuture.whenComplete { _ in c.channel.close(promise: nil) }
  }

  func write(_ id: String, base64: String) async throws {
    let c = try conn(id)
    guard let shell = c.shell else { throw SshFailure("NO_SHELL", "Aucun shell ouvert") }
    guard let bytes = Data(base64Encoded: base64) else { throw SshFailure("SSH", "Données base64 invalides") }
    let buffer = shell.allocator.buffer(bytes: bytes)
    try await shell.writeAndFlush(SSHChannelData(type: .channel, data: .byteBuffer(buffer))).get()
  }

  func resize(_ id: String, cols: Int, rows: Int) async throws {
    guard let shell = try conn(id).shell else { return }
    try await shell.triggerUserOutboundEvent(SSHChannelRequestEvent.WindowChangeRequest(
      terminalCharacterWidth: cols,
      terminalRowHeight: rows,
      terminalPixelWidth: 0,
      terminalPixelHeight: 0
    )).get()
  }

  // MARK: Exec

  /// Runs a one-off command on its own channel of the existing connection; the shell is untouched.
  func exec(_ id: String, command: String, timeoutMs: Int?) async throws -> ExecResult {
    let c = try conn(id)
    let done = c.channel.eventLoop.makePromise(of: ExecResult.self)
    let handler = ExecHandler(done: done)
    let channel: Channel
    do {
      channel = try await c.openChannel { ch in
        ch.setOption(ChannelOptions.allowRemoteHalfClosure, value: true).flatMap { ch.pipeline.addHandler(handler) }
      }
    } catch {
      done.fail(error)
      throw SshCore.mapError(error, host: "", port: 0)
    }
    let timeout = channel.eventLoop.scheduleTask(in: .milliseconds(Int64(timeoutMs ?? 120_000))) {
      done.fail(SshFailure("TIMEOUT", "Commande interrompue (délai dépassé)"))
      channel.close(promise: nil)
    }
    channel.triggerUserOutboundEvent(SSHChannelRequestEvent.ExecRequest(command: command, wantReply: true), promise: nil)
    defer { timeout.cancel() }
    return try await done.futureResult.get()
  }

  // MARK: Lifecycle

  func disconnect(_ id: String) {
    close(id, reason: nil)
  }

  func closeAll() {
    lock.lock()
    let ids = Array(conns.keys)
    lock.unlock()
    ids.forEach { close($0, reason: nil) }
  }

  private func close(_ id: String, reason: String?) {
    lock.lock()
    let c = conns.removeValue(forKey: id)
    lock.unlock()
    guard let c else { return }
    c.channel.close(promise: nil)
    onClose?(id, reason)
  }

  // MARK: Keys

  func generateKey(comment: String) -> SshKeys.Generated {
    SshKeys.generateEd25519(comment: comment)
  }

  func inspectKey(_ privateKey: String, passphrase: String?) throws -> (type: String, publicKey: String, fingerprint: String) {
    let key = try SshKeys.load(privateKey, passphrase: passphrase)
    return (key.type, SshKeys.openSSHPublicKey(type: key.type, blob: key.publicBlob), SshKeys.fingerprint(blob: key.publicBlob))
  }

  // MARK: Errors

  static func mapConnectError(_ error: Error, host: String, port: Int) -> SshFailure {
    if let f = error as? SshFailure { return f }
    let timeout = SshFailure("TIMEOUT", "ssh: connect to host \(host) port \(port): Connection timed out")
    let refused = SshFailure("REFUSED", "ssh: connect to host \(host) port \(port): Connection refused")
    let dns = SshFailure("DNS", "Hôte introuvable : \(host)")
    if case ChannelError.connectTimeout = error { return timeout }
    #if canImport(Network)
    if let nw = error as? NWError {
      switch nw {
      case .dns: return dns
      case .posix(let code):
        switch code {
        case .ECONNREFUSED: return refused
        case .ETIMEDOUT, .EHOSTUNREACH, .ENETUNREACH, .EHOSTDOWN, .ENETDOWN: return timeout
        default: return SshFailure("TIMEOUT", "ssh: connect to host \(host) port \(port): \(nw.localizedDescription)")
        }
      default: return SshFailure("SSH", nw.localizedDescription)
      }
    }
    #else
    // NIOPosix path, only used by the Linux test harness.
    if let e = error as? NIOConnectionError {
      if e.connectionErrors.isEmpty { return dns }
      let refusedAll = e.connectionErrors.allSatisfy { ($0.error as? IOError)?.errnoCode == ECONNREFUSED }
      return refusedAll ? refused : timeout
    }
    #endif
    return SshFailure("SSH", String(describing: error))
  }

  static func mapError(_ error: Error, host: String, port: Int) -> SshFailure {
    if let f = error as? SshFailure { return f }
    if case ChannelError.connectTimeout = error { return mapConnectError(error, host: host, port: port) }
    if error is ChannelError || error is ConnectionClosed {
      return SshFailure("SSH", "Connexion fermée par le serveur")
    }
    if let e = error as? NIOSSHError {
      switch e.type {
      case .keyExchangeNegotiationFailure:
        return SshFailure("SSH", "Aucun algorithme commun avec le serveur (clé hôte RSA uniquement ou chiffrement ancien ?)")
      case .tcpShutdown:
        return SshFailure("SSH", "Connexion fermée par le serveur")
      default:
        return SshFailure("SSH", "Erreur SSH : \(e.type)")
      }
    }
    return SshFailure("SSH", String(describing: error))
  }
}

struct ConnectionClosed: Error {}

// MARK: - Connection state

private final class Connection: @unchecked Sendable {
  let channel: Channel
  let auth: DeferredAuth
  let watcher: ConnectionWatcher
  private let lock = NSLock()
  private var _shell: Channel?

  init(channel: Channel, auth: DeferredAuth, watcher: ConnectionWatcher) {
    self.channel = channel
    self.auth = auth
    self.watcher = watcher
  }

  var shell: Channel? {
    lock.lock()
    defer { lock.unlock() }
    return _shell
  }

  func setShell(_ c: Channel) {
    lock.lock()
    _shell = c
    lock.unlock()
  }

  func openChannel(_ setup: @escaping (Channel) -> EventLoopFuture<Void>) async throws -> Channel {
    let channel = self.channel
    return try await channel.eventLoop.flatSubmit { () -> EventLoopFuture<Channel> in
      let promise = channel.eventLoop.makePromise(of: Channel.self)
      channel.pipeline.handler(type: NIOSSHHandler.self).whenComplete { result in
        switch result {
        case .success(let ssh):
          ssh.createChannel(promise, channelType: .session) { child, _ in setup(child) }
        case .failure(let error):
          promise.fail(error)
        }
      }
      return promise.futureResult
    }.get()
  }
}

/// Records the host key fingerprint and rejects a key that differs from the trusted one.
private final class HostKeyCheck: NIOSSHClientServerAuthenticationDelegate, @unchecked Sendable {
  let known: String?
  let promise: EventLoopPromise<String>

  init(known: String?, promise: EventLoopPromise<String>) {
    self.known = known
    self.promise = promise
  }

  func validateHostKey(hostKey: NIOSSHPublicKey, validationCompletePromise: EventLoopPromise<Void>) {
    let seen = SshKeys.fingerprint(blob: SshKeys.blob(of: hostKey))
    if let known, known != seen {
      let failure = SshFailure("HOST_KEY_MISMATCH", "L’empreinte du serveur a changé : \(seen)")
      promise.fail(failure)
      validationCompletePromise.fail(failure)
    } else {
      promise.succeed(seen)
      validationCompletePromise.succeed(())
    }
  }
}

/// Holds the server's authentication request until `authenticate` supplies the credentials.
/// Only touched on the connection's event loop.
private final class DeferredAuth: NIOSSHClientUserAuthenticationDelegate, @unchecked Sendable {
  private var pending: EventLoopPromise<NIOSSHUserAuthenticationOffer?>?
  private var available: NIOSSHAvailableUserAuthenticationMethods = []
  private var offer: NIOSSHUserAuthenticationOffer?
  private var attempted = false

  func nextAuthenticationType(availableMethods: NIOSSHAvailableUserAuthenticationMethods, nextChallengePromise: EventLoopPromise<NIOSSHUserAuthenticationOffer?>) {
    if attempted {
      // The server turned down the one method we offer.
      nextChallengePromise.fail(SshFailure("AUTH_FAILED", "Authentification refusée"))
      return
    }
    pending = nextChallengePromise
    available = availableMethods
    fulfil()
  }

  func provide(user: String, offer: NIOSSHUserAuthenticationOffer.Offer) {
    self.offer = NIOSSHUserAuthenticationOffer(username: user, serviceName: "", offer: offer)
    fulfil()
  }

  private func fulfil() {
    guard let promise = pending, let offer else { return }
    pending = nil
    attempted = true
    switch offer.offer {
    case .password where !available.contains(.password):
      promise.fail(SshFailure("AUTH_FAILED", "Authentification refusée : le serveur n’accepte pas les mots de passe"))
    case .privateKey where !available.contains(.publicKey):
      promise.fail(SshFailure("AUTH_FAILED", "Authentification refusée : le serveur n’accepte pas les clés"))
    default:
      promise.succeed(offer)
    }
  }
}

/// Last handler of the connection pipeline: turns authentication success, errors and closure into promises.
private final class ConnectionWatcher: ChannelInboundHandler, @unchecked Sendable {
  typealias InboundIn = Any

  let hostKey: EventLoopPromise<String>
  let authenticated: EventLoopPromise<Void>
  private let lock = NSLock()
  private var _closeReason: String?

  init(hostKey: EventLoopPromise<String>, authenticated: EventLoopPromise<Void>) {
    self.hostKey = hostKey
    self.authenticated = authenticated
  }

  var closeReason: String? {
    lock.lock()
    defer { lock.unlock() }
    return _closeReason
  }

  func userInboundEventTriggered(context: ChannelHandlerContext, event: Any) {
    if event is UserAuthSuccessEvent { authenticated.succeed(()) }
    context.fireUserInboundEventTriggered(event)
  }

  func errorCaught(context: ChannelHandlerContext, error: Error) {
    let failure = SshCore.mapError(error, host: "", port: 0)
    lock.lock()
    if _closeReason == nil { _closeReason = failure.message }
    lock.unlock()
    hostKey.fail(error)
    authenticated.fail(error)
    context.close(promise: nil)
  }

  func channelInactive(context: ChannelHandlerContext) {
    hostKey.fail(ConnectionClosed())
    authenticated.fail(ConnectionClosed())
    context.fireChannelInactive()
  }

  // A channel closed before it became active never sees channelInactive.
  func handlerRemoved(context: ChannelHandlerContext) {
    hostKey.fail(ConnectionClosed())
    authenticated.fail(ConnectionClosed())
  }
}

// MARK: - Channel handlers

private final class ShellHandler: ChannelInboundHandler, @unchecked Sendable {
  typealias InboundIn = SSHChannelData

  private var ready: EventLoopPromise<Void>?
  private let onData: (ByteBuffer) -> Void

  init(ready: EventLoopPromise<Void>, onData: @escaping (ByteBuffer) -> Void) {
    self.ready = ready
    self.onData = onData
  }

  func channelRead(context: ChannelHandlerContext, data: NIOAny) {
    let msg = unwrapInboundIn(data)
    if case .byteBuffer(let buffer) = msg.data { onData(buffer) }
  }

  func userInboundEventTriggered(context: ChannelHandlerContext, event: Any) {
    switch event {
    case is ChannelSuccessEvent:
      ready?.succeed(())
      ready = nil
    case is ChannelFailureEvent:
      ready?.fail(SshFailure("NO_SHELL", "Le serveur a refusé d’ouvrir un shell"))
      ready = nil
    default:
      context.fireUserInboundEventTriggered(event)
    }
  }

  func channelInactive(context: ChannelHandlerContext) {
    ready?.fail(SshFailure("NO_SHELL", "Canal fermé avant l’ouverture du shell"))
    ready = nil
    context.fireChannelInactive()
  }

  func handlerRemoved(context: ChannelHandlerContext) {
    ready?.fail(SshFailure("NO_SHELL", "Canal fermé avant l’ouverture du shell"))
    ready = nil
  }
}

private final class ExecHandler: ChannelInboundHandler, @unchecked Sendable {
  typealias InboundIn = SSHChannelData

  private let done: EventLoopPromise<SshCore.ExecResult>
  private var stdout = ByteBuffer()
  private var stderr = ByteBuffer()
  private var exitCode: Int?
  private var signal: String?

  init(done: EventLoopPromise<SshCore.ExecResult>) {
    self.done = done
  }

  func channelRead(context: ChannelHandlerContext, data: NIOAny) {
    let msg = unwrapInboundIn(data)
    guard case .byteBuffer(var buffer) = msg.data else { return }
    // Keeps at most maxExecOutput bytes per stream, so a huge diff can't exhaust memory.
    switch msg.type {
    case .channel: append(&buffer, to: &stdout)
    case .stdErr: append(&buffer, to: &stderr)
    default: break
    }
  }

  private func append(_ buffer: inout ByteBuffer, to target: inout ByteBuffer) {
    let room = maxExecOutput - target.readableBytes
    guard room > 0 else { return }
    if let slice = buffer.readSlice(length: min(room, buffer.readableBytes)) {
      var s = slice
      target.writeBuffer(&s)
    }
  }

  func userInboundEventTriggered(context: ChannelHandlerContext, event: Any) {
    switch event {
    case let status as SSHChannelRequestEvent.ExitStatus:
      exitCode = status.exitStatus
    case let sig as SSHChannelRequestEvent.ExitSignal:
      signal = sig.signalName
    case is ChannelFailureEvent:
      done.fail(SshFailure("SSH", "Le serveur a refusé d’exécuter la commande"))
      context.close(promise: nil)
    case ChannelEvent.inputClosed:
      break
    default:
      context.fireUserInboundEventTriggered(event)
    }
  }

  func channelInactive(context: ChannelHandlerContext) {
    let out = String(decoding: stdout.readableBytesView, as: UTF8.self)
    var err = String(decoding: stderr.readableBytesView, as: UTF8.self)
    if let exitCode {
      done.succeed(.init(stdout: out, stderr: err, exitCode: exitCode))
    } else if let signal {
      // OpenSSH's client also reports 255 for a remote command killed by a signal.
      err += (err.isEmpty ? "" : "\n") + "Commande interrompue par le signal \(signal)"
      done.succeed(.init(stdout: out, stderr: err, exitCode: 255))
    } else {
      done.fail(SshFailure("SSH", "Commande terminée sans code de sortie"))
    }
    context.fireChannelInactive()
  }

  func handlerRemoved(context: ChannelHandlerContext) {
    done.fail(SshFailure("SSH", "Canal fermé"))
  }
}
