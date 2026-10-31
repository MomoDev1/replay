#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

/// bcrypt_pbkdf as used by OpenSSH to derive the key of passphrase-protected `openssh-key-v1` files.
/// Port of OpenBSD's bcrypt_pbkdf.c (Blowfish-based, SHA-512 for the salt and passphrase).
enum BcryptPbkdf {
  static func derive(password: [UInt8], salt: [UInt8], keyLength: Int, rounds: Int) -> [UInt8] {
    precondition(rounds >= 1 && keyLength > 0)
    let stride = (keyLength + 31) / 32
    let amount = (keyLength + stride - 1) / stride
    let sha2pass = Array(SHA512.hash(data: password))
    var key = [UInt8](repeating: 0, count: keyLength)
    var remaining = keyLength
    var count: UInt32 = 1
    while remaining > 0 {
      let countsalt = salt + [UInt8(count >> 24), UInt8((count >> 16) & 0xff), UInt8((count >> 8) & 0xff), UInt8(count & 0xff)]
      var tmp = hash(sha2pass: sha2pass, sha2salt: Array(SHA512.hash(data: countsalt)))
      var out = tmp
      if rounds > 1 {
        for _ in 1..<rounds {
          tmp = hash(sha2pass: sha2pass, sha2salt: Array(SHA512.hash(data: tmp)))
          for j in 0..<out.count { out[j] ^= tmp[j] }
        }
      }
      // Output bytes are spread across the key ("stride") so every derived byte needs all rounds.
      var written = 0
      for i in 0..<min(amount, remaining) {
        let dest = i * stride + Int(count - 1)
        if dest >= keyLength { break }
        key[dest] = out[i]
        written += 1
      }
      remaining -= written
      count += 1
    }
    return key
  }

  private static func hash(sha2pass: [UInt8], sha2salt: [UInt8]) -> [UInt8] {
    var bf = Blowfish()
    bf.expandState(data: sha2salt, key: sha2pass)
    for _ in 0..<64 {
      bf.expand0State(key: sha2salt)
      bf.expand0State(key: sha2pass)
    }
    let magic = Array("OxychromaticBlowfishSwatDynamite".utf8)
    var cdata = [UInt32](repeating: 0, count: 8)
    var j = 0
    for i in 0..<8 { cdata[i] = Blowfish.streamToWord(magic, &j) }
    for _ in 0..<64 {
      for b in 0..<4 {
        let (l, r) = bf.encipher(cdata[2 * b], cdata[2 * b + 1])
        cdata[2 * b] = l
        cdata[2 * b + 1] = r
      }
    }
    var out = [UInt8](repeating: 0, count: 32)
    for i in 0..<8 {
      out[4 * i + 3] = UInt8((cdata[i] >> 24) & 0xff)
      out[4 * i + 2] = UInt8((cdata[i] >> 16) & 0xff)
      out[4 * i + 1] = UInt8((cdata[i] >> 8) & 0xff)
      out[4 * i] = UInt8(cdata[i] & 0xff)
    }
    return out
  }
}

struct Blowfish {
  var p = BlowfishTables.p
  var s0 = BlowfishTables.s0
  var s1 = BlowfishTables.s1
  var s2 = BlowfishTables.s2
  var s3 = BlowfishTables.s3

  /// Reads 4 bytes big-endian, wrapping around `data`.
  static func streamToWord(_ data: [UInt8], _ j: inout Int) -> UInt32 {
    var w: UInt32 = 0
    for _ in 0..<4 {
      if j >= data.count { j = 0 }
      w = (w << 8) | UInt32(data[j])
      j += 1
    }
    return w
  }

  @inline(__always)
  private func f(_ x: UInt32) -> UInt32 {
    ((s0[Int(x >> 24)] &+ s1[Int((x >> 16) & 0xff)]) ^ s2[Int((x >> 8) & 0xff)]) &+ s3[Int(x & 0xff)]
  }

  func encipher(_ xl: UInt32, _ xr: UInt32) -> (UInt32, UInt32) {
    var l = xl ^ p[0]
    var r = xr
    var i = 1
    while i <= 16 {
      r ^= f(l) ^ p[i]
      l ^= f(r) ^ p[i + 1]
      i += 2
    }
    return (r ^ p[17], l)
  }

  private mutating func fill(_ next: (inout UInt32, inout UInt32) -> Void) {
    var l: UInt32 = 0
    var r: UInt32 = 0
    func step() -> (UInt32, UInt32) {
      next(&l, &r)
      (l, r) = encipher(l, r)
      return (l, r)
    }
    for i in Swift.stride(from: 0, to: 18, by: 2) { (p[i], p[i + 1]) = step() }
    for i in Swift.stride(from: 0, to: 256, by: 2) { (s0[i], s0[i + 1]) = step() }
    for i in Swift.stride(from: 0, to: 256, by: 2) { (s1[i], s1[i + 1]) = step() }
    for i in Swift.stride(from: 0, to: 256, by: 2) { (s2[i], s2[i + 1]) = step() }
    for i in Swift.stride(from: 0, to: 256, by: 2) { (s3[i], s3[i + 1]) = step() }
  }

  /// Blowfish_expandstate: key schedule salted with `data`.
  mutating func expandState(data: [UInt8], key: [UInt8]) {
    var j = 0
    for i in 0..<18 { p[i] ^= Blowfish.streamToWord(key, &j) }
    var k = 0
    fill { l, r in
      l ^= Blowfish.streamToWord(data, &k)
      r ^= Blowfish.streamToWord(data, &k)
    }
  }

  /// Blowfish_expand0state: plain key schedule.
  mutating func expand0State(key: [UInt8]) {
    var j = 0
    for i in 0..<18 { p[i] ^= Blowfish.streamToWord(key, &j) }
    fill { _, _ in }
  }
}
