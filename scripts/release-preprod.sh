#!/usr/bin/env bash
# Release pré-prod : bump de version → commit + tag → push → build Android (profil preview)
# → GitHub pre-release avec l'APK attaché.
#
# Usage : scripts/release-preprod.sh [patch|minor|major] [--expo|--local] [--dry-run]
#   --expo   build sur les serveurs EAS (défaut hors terminal interactif)
#   --local  build sur cette machine (eas build --local : Java 17 + Android SDK requis)
#   sans --expo/--local dans un terminal, le script demande.
set -euo pipefail

usage() { echo "Usage : $0 [patch|minor|major] [--expo|--local] [--dry-run]" >&2; exit 1; }

BUMP=patch
DRY=0
MODE=
for arg in "$@"; do
  case "$arg" in
    patch|minor|major) BUMP=$arg ;;
    --expo) MODE=expo ;;
    --local) MODE=local ;;
    --dry-run) DRY=1 ;;
    *) usage ;;
  esac
done

cd "$(dirname "$0")/.."
EAS="npx --yes eas-cli@latest"
PROFILE=preview
BRANCH=main

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -z "$MODE" ]; then
  if [ -t 0 ]; then
    printf 'Où builder ?\n  1) Expo (serveurs EAS)\n  2) Local (cette machine)\n> '
    read -r choice
    case "$choice" in
      1|expo|"") MODE=expo ;;
      2|local) MODE=local ;;
      *) usage ;;
    esac
  else
    MODE=expo
  fi
fi

# --- Vérifications -----------------------------------------------------------
step "Vérifications (build : $MODE)"
for bin in git node gh curl; do command -v "$bin" >/dev/null || die "$bin introuvable"; done
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || die "Il faut être sur la branche $BRANCH"
[ -z "$(git status --porcelain)" ] || die "Des modifications ne sont pas commitées — commit ou stash d'abord"
gh auth status >/dev/null 2>&1 || die "gh n'est pas connecté (gh auth login)"
$EAS whoami >/dev/null 2>&1 || die "EAS n'est pas connecté (npx eas-cli@latest login)"
if [ "$MODE" = local ]; then
  # Vérifié avant le bump : un build local impossible ne doit rien pousser
  command -v java >/dev/null || die "Java introuvable (build local : installe un JDK 17)"
  [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME" ] || die "ANDROID_HOME non défini (build local : installe le SDK Android)"
fi

git fetch --tags --quiet origin
git pull --ff-only --quiet origin "$BRANCH"

# --- Dernière version : max(dernier tag vX.Y.Z, app.json) --------------------
step "Recherche de la dernière version"
TAG_VER=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1 | sed 's/^v//; s/-.*//')
APP_VER=$(node -p "require('./app.json').expo.version")
CURRENT=$(printf '%s\n%s\n' "${TAG_VER:-0.0.0}" "$APP_VER" | sort -V | tail -1)

IFS=. read -r MA MI PA <<<"$CURRENT"
case "$BUMP" in
  major) MA=$((MA + 1)); MI=0; PA=0 ;;
  minor) MI=$((MI + 1)); PA=0 ;;
  patch) PA=$((PA + 1)) ;;
esac
NEXT="$MA.$MI.$PA"
TAG="v$NEXT"
echo "Dernier tag : ${TAG_VER:-aucun} · app.json : $APP_VER → nouvelle version : $NEXT ($BUMP)"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "Le tag $TAG existe déjà"

if [ "$DRY" = 1 ]; then
  echo "(dry-run) Rien n'est modifié, poussé ni buildé."
  exit 0
fi

# --- Qualité -----------------------------------------------------------------
step "Lint + typecheck"
npx expo lint
npx tsc --noEmit

# --- Bump, commit, tag, push -------------------------------------------------
step "Version $NEXT"
node -e '
const fs = require("fs");
const v = process.argv[1];
for (const [file, set] of [["app.json", (j) => (j.expo.version = v)], ["package.json", (j) => (j.version = v)]]) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  set(j);
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
}' "$NEXT"

git add app.json package.json
git commit -m "chore(release): $TAG (pré-prod)"
git tag -a "$TAG" -m "Pré-prod $TAG"
git push origin "$BRANCH" "$TAG"

# --- Build -------------------------------------------------------------------
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
APK="$TMP/relay-$NEXT-preprod.apk"

if [ "$MODE" = local ]; then
  step "Build local Android (profil $PROFILE)"
  $EAS build --platform android --profile "$PROFILE" --non-interactive --local --output "$APK"
  [ -f "$APK" ] || die "Build local terminé sans APK"
  NOTES="Build local (eas build --local)"
else
  step "Build EAS Android (profil $PROFILE) — compte ~10-20 min"
  BUILD_JSON=$($EAS build --platform android --profile "$PROFILE" --non-interactive --wait --json)
  APK_URL=$(node -e 'const b = JSON.parse(process.argv[1])[0]; console.log(b.artifacts?.buildUrl ?? b.artifacts?.applicationArchiveUrl ?? "")' "$BUILD_JSON")
  BUILD_ID=$(node -e 'console.log(JSON.parse(process.argv[1])[0].id)' "$BUILD_JSON")
  [ -n "$APK_URL" ] || die "Build terminé sans APK — voir https://expo.dev (build $BUILD_ID)"
  curl -fsSL -o "$APK" "$APK_URL"
  NOTES="Build EAS : https://expo.dev/accounts/$(node -p "require('./app.json').expo.owner")/projects/relay/builds/$BUILD_ID"
fi

# --- GitHub pre-release ------------------------------------------------------
step "GitHub pre-release $TAG"
gh release create "$TAG" "$APK" \
  --prerelease \
  --title "Relay $NEXT (pré-prod)" \
  --generate-notes \
  --notes "$NOTES"

step "Terminé ✓"
echo "Release : $(gh release view "$TAG" --json url -q .url)"
