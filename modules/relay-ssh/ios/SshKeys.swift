import Foundation
import NIOSSH
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif
#if canImport(CommonCrypto)
import CommonCrypto
#else
import CryptoExtras
#endif

/// A private key ready for authentication, plus its OpenSSH public form.
struct LoadedKey {
  let privateKey: NIOSSHPrivateKey
  /// e.g. "ssh-ed25519"
  let type: String
  /// SSH wire-format public key blob
  let publicBlob: [UInt8]
}

/// Reads and writes the key formats the app handles: `openssh-key-v1` (plain or bcrypt + AES-CTR),
/// PEM EC keys (SEC1 / PKCS#8). RSA is rejected because SwiftNIO SSH cannot sign with it.
enum SshKeys {
  static func fingerprint(blob: [UInt8]) -> String {
    let digest = Data(SHA256.hash(data: blob)).base64EncodedString()
    return "SHA256:" + digest.replacingOccurrences(of: "=", with: "")
  }

  static func blob(of key: NIOSSHPublicKey) -> [UInt8] {
    let parts = String(openSSHPublicKey: key).split(separator: " ")
    return parts.count >= 2 ? Array(Data(base64Encoded: String(parts[1])) ?? Data()) : []
  }

  static func openSSHPublicKey(type: String, blob: [UInt8]) -> String {
    "\(type) \(Data(blob).base64EncodedString())"
  }

  // MARK: Generation

  struct Generated {
    let privateKeyPEM: String
    let publicKey: String
    let fingerprint: String
  }

  static func generateEd25519(comment: String) -> Generated {
    let key = Curve25519.Signing.PrivateKey()
    let pub = Array(key.publicKey.rawRepresentation)
    var pubBlob = SshWriter()
    pubBlob.string("ssh-ed25519")
    pubBlob.string(pub)

    var priv = SshWriter()
    let check = UInt32.random(in: .min ... .max)
    priv.uint32(check)
    priv.uint32(check)
    priv.string("ssh-ed25519")
    priv.string(pub)
    priv.string(Array(key.rawRepresentation) + pub)
    priv.string(comment)
    var pad: UInt8 = 1
    while priv.bytes.count % 8 != 0 {
      priv.bytes.append(pad)
      pad += 1
    }

    var file = SshWriter()
    file.bytes += Array("openssh-key-v1".utf8) + [0]
    file.string("none")
    file.string("none")
    file.string([UInt8]())
    file.uint32(1)
    file.string(pubBlob.bytes)
    file.string(priv.bytes)

    return Generated(
      privateKeyPEM: pem(label: "OPENSSH PRIVATE KEY", file.bytes),
      publicKey: "ssh-ed25519 \(Data(pubBlob.bytes).base64EncodedString()) \(comment)",
      fingerprint: fingerprint(blob: pubBlob.bytes)
    )
  }

  static func pem(label: String, _ data: [UInt8]) -> String {
    let b64 = Data(data).base64EncodedString()
    var lines: [Substring] = []
    var i = b64.startIndex
    while i < b64.endIndex {
      let end = b64.index(i, offsetBy: 70, limitedBy: b64.endIndex) ?? b64.endIndex
      lines.append(b64[i..<end])
      i = end
    }
    return "-----BEGIN \(label)-----\n\(lines.joined(separator: "\n"))\n-----END \(label)-----\n"
  }

  // MARK: Parsing

  static func load(_ text: String, passphrase: String?) throws -> LoadedKey {
    guard let (label, headers, body) = parsePEM(text) else {
      throw SshFailure("BAD_KEY", "Clé privée illisible : format PEM attendu (-----BEGIN … PRIVATE KEY-----)")
    }
    switch label {
    case "OPENSSH PRIVATE KEY":
      return try loadOpenSSH(body, passphrase: passphrase)
    case "EC PRIVATE KEY", "PRIVATE KEY":
      if headers["Proc-Type"]?.contains("ENCRYPTED") == true {
        throw unsupportedEncryptedPEM
      }
      return try loadPEMEC(text)
    case "ENCRYPTED PRIVATE KEY":
      throw unsupportedEncryptedPEM
    case "RSA PRIVATE KEY":
      throw unsupportedRSA
    default:
      throw SshFailure("BAD_KEY", "Clé privée illisible : type « \(label) » non pris en charge")
    }
  }

  static let unsupportedRSA = SshFailure("BAD_KEY", "Les clés RSA ne sont pas encore prises en charge sur iPhone. Utilise une clé ed25519 ou ECDSA (ssh-keygen -t ed25519).")
  static let unsupportedEncryptedPEM = SshFailure("BAD_KEY", "Clé PEM chiffrée non prise en charge sur iPhone. Convertis-la au format OpenSSH : ssh-keygen -p -f <clé>")

  private static func parsePEM(_ text: String) -> (String, [String: String], [UInt8])? {
    let lines = text.replacingOccurrences(of: "\r", with: "").split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }
    guard let start = lines.firstIndex(where: { $0.hasPrefix("-----BEGIN ") && $0.hasSuffix("-----") }) else { return nil }
    let label = String(lines[start].dropFirst("-----BEGIN ".count).dropLast(5))
    guard let end = lines[(start + 1)...].firstIndex(of: "-----END \(label)-----") else { return nil }
    var headers: [String: String] = [:]
    var b64 = ""
    for line in lines[(start + 1)..<end] {
      if let colon = line.firstIndex(of: ":") {
        headers[String(line[..<colon])] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
      } else {
        b64 += line
      }
    }
    guard let data = Data(base64Encoded: b64) else { return nil }
    return (label, headers, Array(data))
  }

  private static func loadPEMEC(_ text: String) throws -> LoadedKey {
    if let k = try? P256.Signing.PrivateKey(pemRepresentation: text) {
      return LoadedKey(privateKey: NIOSSHPrivateKey(p256Key: k), type: "ecdsa-sha2-nistp256", publicBlob: ecdsaBlob("nistp256", Array(k.publicKey.x963Representation)))
    }
    if let k = try? P384.Signing.PrivateKey(pemRepresentation: text) {
      return LoadedKey(privateKey: NIOSSHPrivateKey(p384Key: k), type: "ecdsa-sha2-nistp384", publicBlob: ecdsaBlob("nistp384", Array(k.publicKey.x963Representation)))
    }
    if let k = try? P521.Signing.PrivateKey(pemRepresentation: text) {
      return LoadedKey(privateKey: NIOSSHPrivateKey(p521Key: k), type: "ecdsa-sha2-nistp521", publicBlob: ecdsaBlob("nistp521", Array(k.publicKey.x963Representation)))
    }
    // A PKCS#8 "PRIVATE KEY" is most often RSA.
    throw text.contains("BEGIN PRIVATE KEY") ? unsupportedRSA : SshFailure("BAD_KEY", "Clé privée illisible : clé EC invalide")
  }

  private static func ecdsaBlob(_ curve: String, _ q: [UInt8]) -> [UInt8] {
    var w = SshWriter()
    w.string("ecdsa-sha2-\(curve)")
    w.string(curve)
    w.string(q)
    return w.bytes
  }

  private static func loadOpenSSH(_ data: [UInt8], passphrase: String?) throws -> LoadedKey {
    let magic = Array("openssh-key-v1".utf8) + [0]
    guard data.starts(with: magic) else { throw SshFailure("BAD_KEY", "Clé privée illisible : en-tête openssh-key-v1 manquant") }
    var r = SshReader(Array(data[magic.count...]))
    let cipher = try r.text()
    let kdf = try r.text()
    var kdfOptions = SshReader(try r.string())
    guard try r.uint32() == 1 else { throw SshFailure("BAD_KEY", "Clé privée illisible : fichiers à plusieurs clés non pris en charge") }
    let publicBlob = try r.string()
    var section = try r.string()

    if cipher != "none" {
      guard let passphrase, !passphrase.isEmpty else { throw SshFailure("BAD_KEY", "Clé privée chiffrée : saisis sa phrase de passe") }
      guard kdf == "bcrypt" else { throw SshFailure("BAD_KEY", "Clé privée illisible : dérivation « \(kdf) » non prise en charge") }
      let keyLength: Int
      switch cipher {
      case "aes128-ctr": keyLength = 16
      case "aes192-ctr": keyLength = 24
      case "aes256-ctr": keyLength = 32
      default: throw SshFailure("BAD_KEY", "Clé privée illisible : chiffrement « \(cipher) » non pris en charge sur iPhone")
      }
      let salt = try kdfOptions.string()
      let rounds = Int(try kdfOptions.uint32())
      guard rounds >= 1 && rounds <= 1 << 16 && section.count % 16 == 0 else { throw SshFailure("BAD_KEY", "Clé privée illisible : paramètres de chiffrement invalides") }
      let derived = BcryptPbkdf.derive(password: Array(passphrase.utf8), salt: salt, keyLength: keyLength + 16, rounds: rounds)
      section = try AesCtr.crypt(key: Array(derived[..<keyLength]), iv: Array(derived[keyLength...]), section)
    }

    var p = SshReader(section)
    guard try p.uint32() == p.uint32() else {
      throw SshFailure("BAD_KEY", cipher == "none" ? "Clé privée illisible : données corrompues" : "Phrase de passe incorrecte")
    }
    let type = try p.text()
    let privateKey: NIOSSHPrivateKey
    switch type {
    case "ssh-ed25519":
      _ = try p.string()
      let secret = try p.string()
      guard secret.count == 64 else { throw SshFailure("BAD_KEY", "Clé privée illisible : clé ed25519 invalide") }
      privateKey = NIOSSHPrivateKey(ed25519Key: try Curve25519.Signing.PrivateKey(rawRepresentation: secret[..<32]))
    case "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521":
      _ = try p.string() // curve name
      _ = try p.string() // public point
      let d = try p.mpint()
      switch type {
      case "ecdsa-sha2-nistp256": privateKey = NIOSSHPrivateKey(p256Key: try P256.Signing.PrivateKey(rawRepresentation: leftPad(d, 32)))
      case "ecdsa-sha2-nistp384": privateKey = NIOSSHPrivateKey(p384Key: try P384.Signing.PrivateKey(rawRepresentation: leftPad(d, 48)))
      default: privateKey = NIOSSHPrivateKey(p521Key: try P521.Signing.PrivateKey(rawRepresentation: leftPad(d, 66)))
      }
    case "ssh-rsa":
      throw unsupportedRSA
    default:
      throw SshFailure("BAD_KEY", "Clé privée illisible : type « \(type) » non pris en charge")
    }
    // The public blob is stored in clear; make sure the decrypted private half matches it.
    guard blob(of: privateKey.publicKey) == publicBlob else { throw SshFailure("BAD_KEY", "Clé privée illisible : clé publique et privée ne correspondent pas") }
    return LoadedKey(privateKey: privateKey, type: type, publicBlob: publicBlob)
  }

  private static func leftPad(_ bytes: [UInt8], _ size: Int) throws -> [UInt8] {
    let trimmed = Array(bytes.drop(while: { $0 == 0 }))
    guard trimmed.count <= size else { throw SshFailure("BAD_KEY", "Clé privée illisible : scalaire ECDSA invalide") }
    return [UInt8](repeating: 0, count: size - trimmed.count) + trimmed
  }
}

// MARK: - SSH wire format

struct SshReader {
  private let bytes: [UInt8]
  private var pos = 0
  init(_ bytes: [UInt8]) { self.bytes = bytes }

  private static let truncated = SshFailure("BAD_KEY", "Clé privée illisible : données tronquées")

  mutating func uint32() throws -> UInt32 {
    guard pos + 4 <= bytes.count else { throw SshReader.truncated }
    defer { pos += 4 }
    return bytes[pos..<pos + 4].reduce(0) { ($0 << 8) | UInt32($1) }
  }

  mutating func string() throws -> [UInt8] {
    let n = Int(try uint32())
    guard n <= bytes.count - pos else { throw SshReader.truncated }
    defer { pos += n }
    return Array(bytes[pos..<pos + n])
  }

  mutating func text() throws -> String { String(decoding: try string(), as: UTF8.self) }

  /// Unsigned big-endian magnitude of an SSH mpint.
  mutating func mpint() throws -> [UInt8] { try string() }
}

struct SshWriter {
  var bytes: [UInt8] = []

  mutating func uint32(_ v: UInt32) {
    bytes += [UInt8(v >> 24), UInt8((v >> 16) & 0xff), UInt8((v >> 8) & 0xff), UInt8(v & 0xff)]
  }

  mutating func string(_ s: [UInt8]) {
    uint32(UInt32(s.count))
    bytes += s
  }

  mutating func string(_ s: String) { string(Array(s.utf8)) }
}

// MARK: - AES-CTR (big-endian 128-bit counter, as used by OpenSSH)

enum AesCtr {
  static func crypt(key: [UInt8], iv: [UInt8], _ input: [UInt8]) throws -> [UInt8] {
    precondition(iv.count == 16)
    var counter = iv
    var out = [UInt8](repeating: 0, count: input.count)
    var offset = 0
    while offset < input.count {
      let stream = try encryptBlock(key: key, counter)
      for i in 0..<min(16, input.count - offset) { out[offset + i] = input[offset + i] ^ stream[i] }
      offset += 16
      var i = 15
      while i >= 0 {
        counter[i] &+= 1
        if counter[i] != 0 { break }
        i -= 1
      }
    }
    return out
  }

  /// Single-block AES encryption: CommonCrypto on Apple platforms, swift-crypto elsewhere (tests).
  private static func encryptBlock(key: [UInt8], _ block: [UInt8]) throws -> [UInt8] {
    #if canImport(CommonCrypto)
    var out = [UInt8](repeating: 0, count: 16 + kCCBlockSizeAES128)
    var moved = 0
    let status = CCCrypt(CCOperation(kCCEncrypt), CCAlgorithm(kCCAlgorithmAES), CCOptions(kCCOptionECBMode), key, key.count, nil, block, 16, &out, out.count, &moved)
    guard status == kCCSuccess, moved == 16 else { throw SshFailure("BAD_KEY", "Déchiffrement AES impossible (\(status))") }
    return Array(out[..<16])
    #else
    var b = block
    try AES.permute(&b, key: SymmetricKey(data: key))
    return b
    #endif
  }
}
