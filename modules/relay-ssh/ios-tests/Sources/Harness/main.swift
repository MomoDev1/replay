import Foundation
setvbuf(stdout, nil, _IONBF, 0)

// End-to-end checks of SshCore / SshKeys against a real OpenSSH server and ssh-keygen output.
let env = ProcessInfo.processInfo.environment
// Prepared by setup.sh: keys/, host.fp, a user with a password and an authorized_keys file.
let T = env["SSH_TEST_DIR"] ?? FileManager.default.currentDirectoryPath + "/.sshtest"
let port = Int(env["SSH_TEST_PORT"] ?? "2222")!
let user = env["SSH_TEST_USER"] ?? "hoptest"
let password = env["SSH_TEST_PASSWORD"] ?? "s3cret-pass"
let authorizedKeys = env["SSH_TEST_AUTHORIZED_KEYS"] ?? "/home/\(user)/.ssh/authorized_keys"
var failures = 0

func check(_ ok: Bool, _ what: String) {
  print(ok ? "  ok   \(what)" : "  FAIL \(what)")
  if !ok { failures += 1 }
}

func read(_ path: String) -> String { (try? String(contentsOfFile: path, encoding: .utf8)) ?? "" }
func hex(_ s: String) -> [UInt8] {
  var out: [UInt8] = []
  var i = s.startIndex
  while i < s.endIndex {
    let j = s.index(i, offsetBy: 2)
    out.append(UInt8(s[i..<j], radix: 16)!)
    i = j
  }
  return out
}

func code(_ body: () async throws -> Void) async -> String? {
  do {
    try await body()
    return nil
  } catch let f as SshFailure {
    return f.code
  } catch {
    return "OTHER(\(error))"
  }
}

func msg(_ body: () async throws -> Void) async -> String {
  do { try await body(); return "" } catch let f as SshFailure { return f.message } catch { return "\(error)" }
}

final class Events: @unchecked Sendable {
  let lock = NSLock()
  var data: [String: String] = [:]
  var closes: [String: [String?]] = [:]
  func output(_ id: String) -> String { lock.lock(); defer { lock.unlock() }; return data[id] ?? "" }
  func closed(_ id: String) -> [String?] { lock.lock(); defer { lock.unlock() }; return closes[id] ?? [] }
}

func waitFor(_ seconds: Double, _ cond: () -> Bool) async -> Bool {
  let end = Date().addingTimeInterval(seconds)
  while Date() < end {
    if cond() { return true }
    try? await Task.sleep(nanoseconds: 50_000_000)
  }
  return cond()
}

print("bcrypt_pbkdf vs python bcrypt.kdf")
for line in read(FileManager.default.currentDirectoryPath + "/bcrypt-vectors.txt").split(separator: "\n") {
  let f = line.split(separator: " ").map(String.init)
  let out = BcryptPbkdf.derive(password: hex(f[0]), salt: hex(f[1]), keyLength: Int(f[2])!, rounds: Int(f[3])!)
  check(out == hex(f[4]), "kdf len=\(f[2]) rounds=\(f[3])")
}

print("AES-CTR (NIST SP 800-38A F.5.1)")
let ctr = try AesCtr.crypt(key: hex("2b7e151628aed2a6abf7158809cf4f3c"), iv: hex("f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff"), hex("6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e51"))
check(ctr == hex("874d6191b620e3261bef6864990db6ce9806f66b7970fdff8617187bb9fffdff"), "aes128-ctr two blocks")
let wrap = try AesCtr.crypt(key: [UInt8](repeating: 1, count: 16), iv: [UInt8](repeating: 0xff, count: 16), [UInt8](repeating: 0, count: 40))
let wrapRef = try AesCtr.crypt(key: [UInt8](repeating: 1, count: 16), iv: [UInt8](repeating: 0, count: 16), [UInt8](repeating: 0, count: 24))
check(Array(wrap[16..<40]) == wrapRef, "counter wraps around 2^128")

let core = SshCore()
let ev = Events()
core.onData = { id, b64 in
  let s = String(decoding: Data(base64Encoded: b64)!, as: UTF8.self)
  ev.lock.lock(); ev.data[id, default: ""] += s; ev.lock.unlock()
}
core.onClose = { id, reason in ev.lock.lock(); ev.closes[id, default: []].append(reason); ev.lock.unlock() }

print("Key files from ssh-keygen")
func fp(_ pub: String) -> String {
  // `ssh-keygen -lf` output was saved next to each key by the setup script.
  read(pub).split(separator: " ")[1].description
}
for (name, pass) in [("ed25519", nil), ("ed25519_enc", "pa ss"), ("ed25519_aes128", "r"), ("p256", nil), ("p384_enc", "x"), ("p521", nil), ("p256_pem", nil)] as [(String, String?)] {
  do {
    let info = try core.inspectKey(read("\(T)/keys/\(name)"), passphrase: pass)
    let pub = read("\(T)/keys/\(name).pub").split(separator: " ")
    check(info.publicKey == "\(pub[0]) \(pub[1])" && info.fingerprint == fp("\(T)/keys/\(name).fp"), "inspect \(name) (\(info.type))")
  } catch {
    check(false, "inspect \(name): \(error)")
  }
}
check(await code { _ = try core.inspectKey(read("\(T)/keys/ed25519_enc"), passphrase: "wrong") } == "BAD_KEY", "wrong passphrase -> BAD_KEY")
check(await msg { _ = try core.inspectKey(read("\(T)/keys/ed25519_enc"), passphrase: "wrong") } == "Phrase de passe incorrecte", "wrong passphrase message")
check(await code { _ = try core.inspectKey(read("\(T)/keys/ed25519_enc"), passphrase: nil) } == "BAD_KEY", "missing passphrase -> BAD_KEY")
check(await msg { _ = try core.inspectKey(read("\(T)/keys/rsa"), passphrase: nil) }.contains("RSA"), "rsa -> explicit unsupported message")
check(await code { _ = try core.inspectKey("hello", passphrase: nil) } == "BAD_KEY", "garbage -> BAD_KEY")

print("Key generation")
let g = core.generateKey(comment: "test@relay")
try g.privateKeyPEM.write(toFile: "\(T)/gen", atomically: true, encoding: .utf8)
try g.publicKey.write(toFile: "\(T)/gen.pub", atomically: true, encoding: .utf8)
check(g.publicKey.hasPrefix("ssh-ed25519 ") && g.publicKey.hasSuffix(" test@relay"), "public key format")
let regen = try core.inspectKey(g.privateKeyPEM, passphrase: nil)
check(g.publicKey.hasPrefix(regen.publicKey) && regen.fingerprint == g.fingerprint, "generated key re-reads with the same fingerprint")
print("GEN_FINGERPRINT \(g.fingerprint)")
let ak = FileHandle(forWritingAtPath: authorizedKeys)!
ak.seekToEndOfFile(); ak.write(Data((g.publicKey + "\n").utf8)); ak.closeFile()

print("Connection errors")
check(await code { _ = try await core.connect(host: "127.0.0.1", port: 2299, knownFingerprint: nil, timeoutMs: 3000) } == "REFUSED", "closed port -> REFUSED")
check(await code { _ = try await core.connect(host: "no-such-host.invalid", port: 22, knownFingerprint: nil, timeoutMs: 3000) } == "DNS", "unknown host -> DNS")
check(await code { _ = try await core.connect(host: "10.255.255.1", port: 22, knownFingerprint: nil, timeoutMs: 1500) } == "TIMEOUT", "unroutable -> TIMEOUT")
check(await code { _ = try await core.connect(host: "127.0.0.1", port: port, knownFingerprint: "SHA256:nope", timeoutMs: 3000) } == "HOST_KEY_MISMATCH", "wrong fingerprint -> HOST_KEY_MISMATCH")

print("Password auth")
let hostFp = fp("\(T)/host.fp")
let c1 = try await core.connect(host: "127.0.0.1", port: port, knownFingerprint: nil, timeoutMs: 5000)
check(c1.fingerprint == hostFp, "fingerprint matches ssh-keygen -lf (\(c1.fingerprint))")
check(await code { try await core.authenticate(c1.sessionId, user: user, password: "bad", privateKey: nil, passphrase: nil) } == "AUTH_FAILED", "bad password -> AUTH_FAILED")
check(await code { try await core.exec(c1.sessionId, command: "true", timeoutMs: nil) } == "NO_SESSION", "session dropped after failed auth")

// Wait longer than Citadel's 10 s handshake limit, as a user reading the fingerprint would.
let c2 = try await core.connect(host: "127.0.0.1", port: port, knownFingerprint: hostFp, timeoutMs: 5000)
try await Task.sleep(nanoseconds: 12_000_000_000)
check(await code { try await core.authenticate(c2.sessionId, user: user, password: password, privateKey: nil, passphrase: nil) } == nil, "password auth after 12 s pause")

print("Exec")
let r1 = try await core.exec(c2.sessionId, command: "echo out; echo err >&2; exit 3", timeoutMs: nil)
check(r1.stdout == "out\n" && r1.stderr == "err\n" && r1.exitCode == 3, "stdout/stderr/exit code")
let big = try await core.exec(c2.sessionId, command: "head -c 3000000 /dev/zero | tr '\\0' a", timeoutMs: nil)
check(big.stdout.utf8.count == 2 * 1024 * 1024 && big.exitCode == 0, "output capped at 2 MiB (\(big.stdout.utf8.count))")
check(await code { _ = try await core.exec(c2.sessionId, command: "sleep 5", timeoutMs: 500) } == "TIMEOUT", "timeout -> TIMEOUT")
let sig = try await core.exec(c2.sessionId, command: "kill -9 $$", timeoutMs: nil)
check(sig.exitCode == 255 || sig.exitCode == 137, "killed command reports an exit code (\(sig.exitCode))")
async let p1 = core.exec(c2.sessionId, command: "sleep 0.3; echo a", timeoutMs: nil)
async let p2 = core.exec(c2.sessionId, command: "echo b", timeoutMs: nil)
let (a, b) = try await (p1, p2)
check(a.stdout == "a\n" && b.stdout == "b\n", "parallel exec channels")

print("Shell")
try await core.startShell(c2.sessionId, cols: 80, rows: 24)
try await core.write(c2.sessionId, base64: Data("stty size; echo HOP_$((40+2))\n".utf8).base64EncodedString())
check(await waitFor(5) { ev.output(c2.sessionId).contains("HOP_42") }, "shell echoes command output")
check(ev.output(c2.sessionId).contains("24 80"), "pty size 80x24")
try await core.resize(c2.sessionId, cols: 120, rows: 40)
try await Task.sleep(nanoseconds: 200_000_000)
try await core.write(c2.sessionId, base64: Data("stty size\n".utf8).base64EncodedString())
check(await waitFor(5) { ev.output(c2.sessionId).contains("40 120") }, "resize to 120x40")
let r2 = try await core.exec(c2.sessionId, command: "echo while-shell", timeoutMs: nil)
check(r2.stdout == "while-shell\n", "exec while the shell is open")
try await core.write(c2.sessionId, base64: Data("exit\n".utf8).base64EncodedString())
check(await waitFor(5) { ev.closed(c2.sessionId).count == 1 }, "exit closes the session once (onClose)")
check(await code { _ = try await core.exec(c2.sessionId, command: "true", timeoutMs: nil) } == "NO_SESSION", "closed session is gone")

print("Key auth")
for (name, pass) in [("ed25519_enc", "pa ss"), ("p384_enc", "x"), ("p256_pem", nil), ("gen", nil)] as [(String, String?)] {
  let c = try await core.connect(host: "127.0.0.1", port: port, knownFingerprint: hostFp, timeoutMs: 5000)
  let err = await msg { try await core.authenticate(c.sessionId, user: user, password: nil, privateKey: read("\(T)/\(name == "gen" ? "" : "keys/")\(name)"), passphrase: pass) }
  check(err.isEmpty, "publickey auth with \(name) \(err)")
  if err.isEmpty {
    let w = try await core.exec(c.sessionId, command: "whoami", timeoutMs: nil)
    check(w.stdout == user + "\n", "whoami over \(name)")
  }
  core.disconnect(c.sessionId)
  check(ev.closed(c.sessionId) == [nil], "disconnect emits onClose(nil) once")
}
let cr = try await core.connect(host: "127.0.0.1", port: port, knownFingerprint: hostFp, timeoutMs: 5000)
check(await code { try await core.authenticate(cr.sessionId, user: user, password: nil, privateKey: read("\(T)/keys/rsa"), passphrase: nil) } == "BAD_KEY", "rsa auth -> BAD_KEY")

print("Server-side close")
let c3 = try await core.connect(host: "127.0.0.1", port: port, knownFingerprint: hostFp, timeoutMs: 5000)
try await core.authenticate(c3.sessionId, user: user, password: password, privateKey: nil, passphrase: nil)
try await core.startShell(c3.sessionId, cols: 80, rows: 24)
_ = try? await core.exec(c3.sessionId, command: "pkill -KILL -u \(user) sshd", timeoutMs: 3000)
check(await waitFor(5) { ev.closed(c3.sessionId).count == 1 }, "killed server session emits onClose")

print(failures == 0 ? "ALL PASSED" : "\(failures) FAILURE(S)")
exit(failures == 0 ? 0 : 1)
