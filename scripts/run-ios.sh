#!/usr/bin/env bash
# Lance l'app iOS sur l'iPhone branché ou sur le simulateur.
#
# Usage : scripts/run-ios.sh [--device|--sim] [--metro]
#   --device  iPhone branché (USB ou même Wi-Fi), signé avec appleTeamId d'app.json
#   --sim     simulateur ($IOS_SIMULATOR, défaut « iPhone 17 »)
#             sans --device/--sim : l'iPhone s'il est disponible, sinon le simulateur.
#   --metro   build Debug qui charge le JS depuis Metro (rechargement à chaud, Mac requis)
#             sans --metro : build Release avec le JS embarqué, comme l'app réelle.
set -euo pipefail

usage() { echo "Usage : $0 [--device|--sim] [--metro]" >&2; exit 1; }

TARGET=
METRO=0
for arg in "$@"; do
  case "$arg" in
    --device) TARGET=device ;;
    --sim) TARGET=sim ;;
    --metro) METRO=1 ;;
    *) usage ;;
  esac
done

cd "$(dirname "$0")/.."
SIMULATOR=${IOS_SIMULATOR:-iPhone 17}
CONFIG=Release
[ "$METRO" = 1 ] && CONFIG=Debug

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# UDID du premier iPhone physique disponible (vide sinon).
find_device() {
  local json
  json=$(mktemp)
  xcrun devicectl list devices --json-output "$json" >/dev/null 2>&1 || true
  python3 -I - "$json" <<'EOF'
import json, sys
try:
    devices = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception:
    devices = []
for d in devices:
    hw = d.get("hardwareProperties", {})
    if hw.get("reality") == "physical" and hw.get("platform") == "iOS" \
            and d.get("connectionProperties", {}).get("tunnelState") != "unavailable":
        print(hw.get("udid", ""))
        break
EOF
  rm -f "$json"
}

DEVICE=$(find_device)
if [ -z "$TARGET" ]; then
  TARGET=sim
  [ -n "$DEVICE" ] && TARGET=device
fi

if [ "$TARGET" = sim ]; then
  step "Simulateur « $SIMULATOR » — $CONFIG"
  args=(-d "$SIMULATOR" --configuration "$CONFIG")
  [ "$METRO" = 0 ] && args+=(--no-bundler)
  exec npx expo run:ios "${args[@]}"
fi

[ -n "$DEVICE" ] || die "Aucun iPhone disponible : branche-le en USB et déverrouille-le."

[ -d ios ] || { step "Prebuild iOS"; npx expo prebuild -p ios; }

# xcodebuild direct plutôt que `expo run:ios` : -allowProvisioningUpdates laisse Xcode
# créer le profil de provisionnement, ce que expo run:ios ne fait pas.
step "Build $CONFIG pour l'iPhone ($DEVICE)"
DERIVED=ios/build/dd
LOG=.expo/xcodebuild-device.log
mkdir -p .expo
if ! xcodebuild -workspace ios/Hop.xcworkspace -scheme Hop -configuration "$CONFIG" \
    -destination "id=$DEVICE" -derivedDataPath "$DERIVED" -allowProvisioningUpdates \
    COMPILER_INDEX_STORE_ENABLE=NO >"$LOG" 2>&1; then
  grep -E "error:|errSec" "$LOG" | head -20 >&2 || true
  die "Build échoué — log complet : $LOG"
fi

APP="$DERIVED/Build/Products/$CONFIG-iphoneos/Hop.app"
BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")

step "Installation de $BUNDLE_ID"
xcrun devicectl device install app --device "$DEVICE" "$APP"

step "Lancement"
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing "$BUNDLE_ID" \
  || echo "Lancement impossible (iPhone verrouillé ou certificat non approuvé : Réglages → Général → VPN et gestion de l'appareil)."

if [ "$METRO" = 1 ]; then
  step "Metro (l'iPhone doit être sur le même réseau que le Mac)"
  exec npx expo start
fi
