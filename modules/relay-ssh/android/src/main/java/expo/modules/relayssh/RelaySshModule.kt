package expo.modules.relayssh

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.schmizz.sshj.DefaultConfig
import net.schmizz.sshj.SSHClient
import net.schmizz.sshj.common.Buffer
import net.schmizz.sshj.connection.channel.direct.Session
import net.schmizz.sshj.transport.TransportException
import net.schmizz.sshj.transport.verification.HostKeyVerifier
import net.schmizz.sshj.userauth.UserAuthException
import net.schmizz.sshj.userauth.password.PasswordFinder
import net.schmizz.sshj.userauth.password.Resource
import org.bouncycastle.crypto.generators.Ed25519KeyPairGenerator
import org.bouncycastle.crypto.params.Ed25519KeyGenerationParameters
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.util.OpenSSHPrivateKeyUtil
import org.bouncycastle.crypto.util.OpenSSHPublicKeyUtil
import org.bouncycastle.jce.provider.BouncyCastleProvider
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.MessageDigest
import java.security.PublicKey
import java.security.SecureRandom
import java.security.Security
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class SshError(code: String, message: String, cause: Throwable? = null) : CodedException(code, message, cause)

class ConnectOptions : Record {
  @Field val host: String = ""
  @Field val port: Int = 22
  @Field val knownFingerprint: String? = null
  @Field val timeoutMs: Int = 15000
}

class AuthOptions : Record {
  @Field val user: String = ""
  @Field val password: String? = null
  @Field val privateKey: String? = null
  @Field val passphrase: String? = null
}

private class Conn(val client: SSHClient) {
  var session: Session? = null
  var shell: Session.Shell? = null
}

private fun sha256Fingerprint(blob: ByteArray): String {
  val digest = MessageDigest.getInstance("SHA-256").digest(blob)
  return "SHA256:" + Base64.encodeToString(digest, Base64.NO_WRAP or Base64.NO_PADDING)
}

private fun fingerprint(key: PublicKey): String = sha256Fingerprint(Buffer.PlainBuffer().putPublicKey(key).compactData)

private fun pem(label: String, data: ByteArray): String {
  val body = Base64.encodeToString(data, Base64.NO_WRAP).chunked(70).joinToString("\n")
  return "-----BEGIN $label-----\n$body\n-----END $label-----\n"
}

private fun mapError(e: Throwable, host: String, port: Int): SshError = when (e) {
  is SshError -> e
  is UnknownHostException -> SshError("DNS", "Hôte introuvable : $host", e)
  is SocketTimeoutException, is NoRouteToHostException -> SshError("TIMEOUT", "ssh: connect to host $host port $port: Connection timed out", e)
  is ConnectException ->
    if (e.message?.contains("refused", true) == true) SshError("REFUSED", "ssh: connect to host $host port $port: Connection refused", e)
    else SshError("TIMEOUT", "ssh: connect to host $host port $port: ${e.message}", e)
  is UserAuthException -> SshError("AUTH_FAILED", "Authentification refusée", e)
  else -> SshError("SSH", e.message ?: e.javaClass.simpleName, e)
}

class RelaySshModule : Module() {
  private val conns = ConcurrentHashMap<String, Conn>()

  private fun conn(id: String) = conns[id] ?: throw SshError("NO_SESSION", "Session inconnue : $id")

  private fun close(id: String, reason: String?) {
    val c = conns.remove(id) ?: return
    runCatching { c.shell?.close() }
    runCatching { c.session?.close() }
    runCatching { c.client.disconnect() }
    sendEvent("onClose", mapOf("sessionId" to id, "reason" to reason))
  }

  override fun definition() = ModuleDefinition {
    Name("RelaySsh")

    Events("onData", "onClose")

    OnCreate {
      // Android ships a stripped-down "BC" provider; replace it with the full one so ed25519 / curve25519 work.
      Security.removeProvider("BC")
      Security.insertProviderAt(BouncyCastleProvider(), 1)
    }

    OnDestroy {
      conns.keys.toList().forEach { close(it, null) }
    }

    // Opens the transport and returns the host key fingerprint. Credentials are only sent by `authenticate`,
    // so the caller can ask the user to trust an unknown fingerprint first.
    AsyncFunction("connect") Coroutine { opts: ConnectOptions ->
      withContext(Dispatchers.IO) {
        var seen: String? = null
        val client = SSHClient(DefaultConfig())
        client.connectTimeout = opts.timeoutMs
        client.addHostKeyVerifier(object : HostKeyVerifier {
          override fun verify(hostname: String, port: Int, key: PublicKey): Boolean {
            seen = fingerprint(key)
            return opts.knownFingerprint == null || opts.knownFingerprint == seen
          }

          override fun findExistingAlgorithms(hostname: String, port: Int): List<String> = emptyList()
        })
        val started = System.nanoTime()
        try {
          client.connect(opts.host, opts.port)
        } catch (e: TransportException) {
          runCatching { client.disconnect() }
          if (seen != null && opts.knownFingerprint != null && seen != opts.knownFingerprint) {
            throw SshError("HOST_KEY_MISMATCH", "L’empreinte du serveur a changé : $seen", e)
          }
          throw mapError(e, opts.host, opts.port)
        } catch (e: Exception) {
          runCatching { client.disconnect() }
          throw mapError(e, opts.host, opts.port)
        }
        client.connection.keepAlive.keepAliveInterval = 30
        val id = UUID.randomUUID().toString()
        conns[id] = Conn(client)
        mapOf(
          "sessionId" to id,
          "fingerprint" to seen,
          "latencyMs" to (System.nanoTime() - started) / 1_000_000,
        )
      }
    }

    AsyncFunction("authenticate") Coroutine { id: String, opts: AuthOptions ->
      withContext(Dispatchers.IO) {
        val c = conn(id)
        try {
          if (opts.privateKey != null) {
            val finder = opts.passphrase?.let { p ->
              object : PasswordFinder {
                override fun reqPassword(resource: Resource<*>?) = p.toCharArray()
                override fun shouldRetry(resource: Resource<*>?) = false
              }
            }
            c.client.authPublickey(opts.user, c.client.loadKeys(opts.privateKey, null, finder))
          } else {
            c.client.authPassword(opts.user, opts.password ?: "")
          }
        } catch (e: Exception) {
          close(id, null)
          throw mapError(e, "", 0)
        }
      }
    }

    AsyncFunction("startShell") Coroutine { id: String, cols: Int, rows: Int ->
      withContext(Dispatchers.IO) {
        val c = conn(id)
        val session = c.client.startSession()
        session.allocatePTY("xterm-256color", cols, rows, 0, 0, emptyMap())
        val shell = session.startShell()
        c.session = session
        c.shell = shell
        Thread({
          val buf = ByteArray(8192)
          var reason: String? = null
          try {
            val input = shell.inputStream
            while (true) {
              val n = input.read(buf)
              if (n < 0) break
              sendEvent("onData", mapOf("sessionId" to id, "data" to Base64.encodeToString(buf, 0, n, Base64.NO_WRAP)))
            }
          } catch (e: Exception) {
            reason = e.message
          }
          close(id, reason)
        }, "relay-ssh-$id").apply { isDaemon = true }.start()
      }
    }

    AsyncFunction("write") Coroutine { id: String, data: String ->
      withContext(Dispatchers.IO) {
        val out = conn(id).shell?.outputStream ?: throw SshError("NO_SHELL", "Aucun shell ouvert")
        out.write(Base64.decode(data, Base64.NO_WRAP))
        out.flush()
      }
    }

    AsyncFunction("resize") Coroutine { id: String, cols: Int, rows: Int ->
      withContext(Dispatchers.IO) {
        conn(id).shell?.changeWindowDimensions(cols, rows, 0, 0)
        Unit
      }
    }

    AsyncFunction("disconnect") Coroutine { id: String ->
      withContext(Dispatchers.IO) { close(id, null) }
    }

    AsyncFunction("generateKey") Coroutine { comment: String ->
      withContext(Dispatchers.Default) {
        val gen = Ed25519KeyPairGenerator()
        gen.init(Ed25519KeyGenerationParameters(SecureRandom()))
        val pair = gen.generateKeyPair()
        val priv = pair.private as Ed25519PrivateKeyParameters
        val pubBlob = OpenSSHPublicKeyUtil.encodePublicKey(pair.public as Ed25519PublicKeyParameters)
        mapOf(
          "privateKey" to pem("OPENSSH PRIVATE KEY", OpenSSHPrivateKeyUtil.encodePrivateKey(priv)),
          "publicKey" to "ssh-ed25519 ${Base64.encodeToString(pubBlob, Base64.NO_WRAP)} $comment",
          "fingerprint" to sha256Fingerprint(pubBlob),
        )
      }
    }

    // Validates an imported private key and returns its public half.
    AsyncFunction("inspectKey") Coroutine { privateKey: String, passphrase: String? ->
      withContext(Dispatchers.Default) {
        val finder = passphrase?.let { p ->
          object : PasswordFinder {
            override fun reqPassword(resource: Resource<*>?) = p.toCharArray()
            override fun shouldRetry(resource: Resource<*>?) = false
          }
        }
        val pub = try {
          SSHClient(DefaultConfig()).loadKeys(privateKey, null, finder).public
        } catch (e: Exception) {
          throw SshError("BAD_KEY", "Clé privée illisible : ${e.message}", e)
        }
        val blob = Buffer.PlainBuffer().putPublicKey(pub).compactData
        val type = net.schmizz.sshj.common.KeyType.fromKey(pub).toString()
        mapOf(
          "type" to type,
          "publicKey" to "$type ${Base64.encodeToString(blob, Base64.NO_WRAP)}",
          "fingerprint" to sha256Fingerprint(blob),
        )
      }
    }
  }
}
