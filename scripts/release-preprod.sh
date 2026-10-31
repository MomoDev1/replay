#!/usr/bin/env bash
# Release pré-prod : bump de version → commit + tag → push → build Android (profil preview)
# → GitHub pre-release avec l'APK attaché.
#
# Usage : scripts/release-preprod.sh [patch|minor|major] [--expo|--local] [--dry-run]
#         scripts/release-preprod.sh --resume [vX.Y.Z]
#   --expo   build sur les serveurs EAS (défaut hors terminal interactif)
#   --local  build sur cette machine (eas build --local : Java 17 + Android SDK requis)
#   --resume reprend une release interrompue (script tué pendant l'attente du build EAS) :
#            retrouve le build EAS du tag (défaut : dernier tag), attend la fin et crée la release.
#   sans --expo/--local dans un terminal, le script demande.
set -euo pipefail

usage() { echo "Usage : $0 [patch|minor|major] [--expo|--local] [--dry-run] | --resume [vX.Y.Z]" >&2; exit 1; }

BUMP=patch
DRY=0
MODE=
RESUME=
for arg in "$@"; do
  case "$arg" in
    patch|minor|major) BUMP=$arg ;;
    --expo) MODE=expo ;;
    --local) MODE=local ;;
    --dry-run) DRY=1 ;;
    --resume) RESUME=latest ;;
    v[0-9]*.[0-9]*.[0-9]*) [ -n "$RESUME" ] || usage; RESUME=$arg ;;
    *) usage ;;
  esac
done

cd "$(dirname "$0")/.."
EAS="npx --yes eas-cli@latest"
PROFILE=preview
BRANCH=main

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Champ d'un JSON passé en argument : json_get "$JSON" 'b => b.status'
json_get() { node -e 'const f = eval(process.argv[2]); const v = f(JSON.parse(process.argv[1])); console.log(v ?? "")' "$1" "$2"; }

# Attend la fin du build EAS $1 (sondage via build:view : une coupure réseau ou un terminal
# fermé ne perd plus le build, et --resume peut reprendre), télécharge l'APK et crée la release.
finish_eas_release() {
  local build_id=$1 tag=$2 version=$3 json status apk_url apk tmp
  step "Attente du build EAS $build_id — compte ~10-20 min"
  echo "Logs : https://expo.dev/accounts/$(node -p "require('./app.json').expo.owner")/projects/relay/builds/$build_id"
  echo "Si le script est interrompu : scripts/release-preprod.sh --resume $tag"
  while :; do
    json=$($EAS build:view "$build_id" --json 2>/dev/null) || { sleep 30; continue; }
    status=$(json_get "$json" 'b => b.status') || { sleep 30; continue; }
    case "$status" in
      FINISHED) break ;;
      ERRORED|CANCELED) die "Build EAS $status : $(json_get "$json" 'b => b.error?.message')" ;;
      *) printf '.'; sleep 30 ;;
    esac
  done
  echo
  apk_url=$(json_get "$json" 'b => b.artifacts?.buildUrl ?? b.artifacts?.applicationArchiveUrl')
  [ -n "$apk_url" ] || die "Build terminé sans APK — voir https://expo.dev (build $build_id)"
  tmp=$(mktemp -d)
  apk="$tmp/relay-$version-preprod.apk"
  curl -fsSL --retry 3 -o "$apk" "$apk_url"
  create_release "$tag" "$version" "$apk" "Build EAS : https://expo.dev/accounts/$(node -p "require('./app.json').expo.owner")/projects/relay/builds/$build_id"
  rm -rf "$tmp"
}

create_release() {
  local tag=$1 version=$2 apk=$3 notes=$4
  step "GitHub pre-release $tag"
  if gh release view "$tag" >/dev/null 2>&1; then
    gh release upload "$tag" "$apk" --clobber
  else
    gh release create "$tag" "$apk" \
      --verify-tag \
      --prerelease \
      --title "Relay $version (pré-prod)" \
      --generate-notes \
      --notes "$notes"
  fi
  step "Terminé ✓"
  echo "Release : $(gh release view "$tag" --json url -q .url)"
}

# --- Reprise d'une release interrompue ---------------------------------------
if [ -n "$RESUME" ]; then
  for bin in git node gh curl; do command -v "$bin" >/dev/null || die "$bin introuvable"; done
  gh auth status >/dev/null 2>&1 || die "gh n'est pas connecté (gh auth login)"
  git fetch --tags --quiet origin
  TAG=$RESUME
  [ "$TAG" = latest ] && TAG=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -1)
  [ -n "$TAG" ] || die "Aucun tag vX.Y.Z"
  SHA=$(git rev-parse "$TAG^{commit}") || die "Tag $TAG introuvable"
  step "Reprise de $TAG ($SHA)"
  LIST=$($EAS build:list --platform android --limit 30 --non-interactive --json 2>/dev/null) || die "eas build:list a échoué (npx eas-cli@latest login ?)"
  BUILD_ID=$(json_get "$LIST" "l => l.find((b) => b.gitCommitHash === '$SHA' && b.buildProfile === '$PROFILE' && !['ERRORED','CANCELED'].includes(b.status))?.id")
  [ -n "$BUILD_ID" ] || die "Aucun build EAS valide pour $TAG — relance un build : git checkout $TAG && $EAS build -p android --profile $PROFILE"
  finish_eas_release "$BUILD_ID" "$TAG" "${TAG#v}"
  exit 0
fi

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
  # SDK Android : celui installé par Homebrew (android-commandlinetools) si ANDROID_HOME n'est pas défini.
  if [ -z "${ANDROID_HOME:-}" ] && [ -d /opt/homebrew/share/android-commandlinetools ]; then
    export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
  fi
  # Vérifié avant le bump : un build local impossible ne doit rien pousser
  java -version >/dev/null 2>&1 || die "Java introuvable (build local : installe un JDK 17)"
  [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME" ] || die "ANDROID_HOME non défini (build local : installe le SDK Android)"
fi

git fetch --tags --quiet origin
git pull --ff-only --quiet origin "$BRANCH"

# Le pull peut amener de nouvelles dépendances (package-lock.json) : node_modules doit suivre,
# sinon lint/typecheck/bundle échouent sur des modules introuvables.
step "Installation des dépendances (npm ci)"
npm ci --no-audit --no-fund

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
npx expo lint --no-cache # le cache garde des erreurs « module introuvable » périmées
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
if [ "$MODE" = local ]; then
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  APK="$TMP/relay-$NEXT-preprod.apk"
  step "Build local Android (profil $PROFILE)"
  # Le cache Metro (dans $TMPDIR) garde le chemin absolu des composants 'use dom' : un build précédent
  # le fait pointer vers un autre dossier et le bundle du terminal (xterm.tsx) échoue.
  rm -rf "${TMPDIR:-/tmp}"/metro-* "${TMPDIR:-/tmp}"/haste-map-* 2>/dev/null || echo "Cache Metro occupé (autre build en cours ?) : nettoyage partiel"
  $EAS build --platform android --profile "$PROFILE" --non-interactive --local --output "$APK"
  [ -f "$APK" ] || die "Build local terminé sans APK"
  create_release "$TAG" "$NEXT" "$APK" "Build local (eas build --local)"
else
  step "Lancement du build EAS Android (profil $PROFILE)"
  BUILD_JSON=$($EAS build --platform android --profile "$PROFILE" --non-interactive --no-wait --json)
  BUILD_ID=$(json_get "$BUILD_JSON" 'l => l[0].id')
  [ -n "$BUILD_ID" ] || die "Impossible de lire l'id du build EAS"
  finish_eas_release "$BUILD_ID" "$TAG" "$NEXT"
fi
