# relay-ssh — tests du cœur iOS

`SshCore.swift`, `SshKeys.swift` et `BcryptPbkdf.swift` (dans `../ios`) ne dépendent ni d'Expo ni d'UIKit :
ce paquet SwiftPM les compile sous Linux (transport NIOPosix au lieu de Network.framework) et les
exerce contre un vrai `sshd` et des clés produites par `ssh-keygen`.

Couvert : bcrypt_pbkdf (vecteurs de `bcrypt.kdf` Python), AES-CTR (NIST SP 800-38A), lecture des
clés ed25519 / ECDSA P-256/384/521 (OpenSSH en clair ou chiffrées, PEM EC), refus explicite du RSA,
génération ed25519, erreurs REFUSED / DNS / TIMEOUT / HOST_KEY_MISMATCH / AUTH_FAILED, mot de passe
saisi 12 s après la connexion, exec (stdout/stderr/code, plafond 2 Mio, timeout, canaux parallèles),
shell PTY (taille, resize, sortie, fermeture), auth par clé, fermeture côté serveur.

Non couvert ici (à valider sur iPhone / simulateur) : `RelaySshModule.swift` (pont Expo) et le
transport Network.framework (`#if canImport(Network)` dans `SshCore.swift`).

```bash
sudo ./setup.sh          # Linux, root : sshd jetable sur 127.0.0.1:2222 + utilisateur de test
swift run -c release     # Swift ≥ 6.1 (ou: docker run --network host -v "$PWD/../..:/m" -w /m/relay-ssh/ios-tests swift:6.2-noble swift run)
```

Variables : `SSH_TEST_DIR`, `SSH_TEST_PORT`, `SSH_TEST_USER`, `SSH_TEST_PASSWORD`, `SSH_TEST_AUTHORIZED_KEYS`.
`bcrypt-vectors.txt` : `python3 -c "import bcrypt; print(bcrypt.kdf(pw, salt, n, rounds, ignore_few_rounds=True).hex())"`.
