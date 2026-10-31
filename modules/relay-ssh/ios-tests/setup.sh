#!/usr/bin/env bash
# Starts a throwaway sshd on 127.0.0.1:${SSH_TEST_PORT:-2222} and the key files the tests read.
# Linux, as root (creates the test user). Usage: sudo ./setup.sh  then  swift run (see README.md).
set -euo pipefail
cd "$(dirname "$0")"
T="${SSH_TEST_DIR:-$PWD/.sshtest}"
PORT="${SSH_TEST_PORT:-2222}"
USER_NAME="${SSH_TEST_USER:-hoptest}"
PASSWORD="${SSH_TEST_PASSWORD:-s3cret-pass}"

[ -f "$T/sshd.pid" ] && kill "$(cat "$T/sshd.pid")" 2>/dev/null || true
rm -rf "$T"; mkdir -p "$T/keys"
ssh-keygen -q -t ed25519 -N '' -f "$T/host_ed25519" -C host
ssh-keygen -lf "$T/host_ed25519.pub" > "$T/host.fp"
cat > "$T/sshd_config" <<CONF
Port $PORT
ListenAddress 127.0.0.1
HostKey $T/host_ed25519
PidFile $T/sshd.pid
PasswordAuthentication yes
KbdInteractiveAuthentication no
PubkeyAuthentication yes
UsePAM yes
CONF

id "$USER_NAME" >/dev/null 2>&1 || useradd -m -s /bin/bash "$USER_NAME"
echo "$USER_NAME:$PASSWORD" | chpasswd

cd "$T/keys"
ssh-keygen -q -t ed25519 -N '' -f ed25519 -C plain
ssh-keygen -q -t ed25519 -N 'pa ss' -f ed25519_enc -C enc
ssh-keygen -q -t ed25519 -N 'r' -a 4 -Z aes128-ctr -f ed25519_aes128
ssh-keygen -q -t ecdsa -b 256 -N '' -f p256
ssh-keygen -q -t ecdsa -b 384 -N 'x' -f p384_enc
ssh-keygen -q -t ecdsa -b 521 -N '' -f p521
ssh-keygen -q -t ecdsa -b 256 -N '' -m PEM -f p256_pem
ssh-keygen -q -t rsa -b 2048 -N '' -f rsa
for k in *.pub; do ssh-keygen -lf "$k" > "${k%.pub}.fp"; done

HOME_DIR=$(getent passwd "$USER_NAME" | cut -d: -f6)
install -d -o "$USER_NAME" -m 700 "$HOME_DIR/.ssh"
cat *.pub > "$HOME_DIR/.ssh/authorized_keys"
chown "$USER_NAME" "$HOME_DIR/.ssh/authorized_keys"; chmod 600 "$HOME_DIR/.ssh/authorized_keys"

mkdir -p /run/sshd
/usr/sbin/sshd -f "$T/sshd_config"
echo "sshd on 127.0.0.1:$PORT, fixtures in $T"
