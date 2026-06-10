#!/usr/bin/env bash
#
# Release do package pfSense: build do artefato, atualização da versão/sha256
# no config versionado, commit e push para o GitHub.
#
# Uso: ./scripts/release-pfsense-package.sh [--no-push]
#
# - Lê PORTVERSION do Makefile do package (a versão deve ser incrementada manualmente
#   no Makefile quando houver alteração real no código do agente/package)
# - Roda build-pfsense-package-artifact.sh
# - Atualiza config/package-release.env (PACKAGE_RELEASE_VERSION, PACKAGE_RELEASE_SHA256, PACKAGE_RELEASE_REPO_RAW_BASE)
# - Faz commit e push (a menos que --no-push)
#
# Após o push, a API (ao ser reiniciada/redeploy) passa a servir o comando de
# bootstrap com a nova versão. Novos firewalls e os já cadastrados passam a
# receber o comando atualizado quando abrirem a tela do node ou de Instalação.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/pfsense-package"
DIST_DIR="$ROOT_DIR/dist/pfsense-package"
CONFIG_FILE="$ROOT_DIR/config/package-release.env"
NO_PUSH=false

for arg in "$@"; do
  case "$arg" in
    --no-push) NO_PUSH=true ;;
    -h|--help)
      echo "Uso: $0 [--no-push]"
      echo "  --no-push  Só faz build e atualiza config; não faz commit nem push"
      exit 0
      ;;
  esac
done

# Versão a partir do Makefile do package (incremente PORTVERSION no Makefile quando alterar o código do agente)
VERSION="$(grep -E '^PORTVERSION=' "$PACKAGE_DIR/Makefile" | sed 's/^PORTVERSION=[[:space:]]*//' | tr -d '\r')"
if [[ -z "$VERSION" ]]; then
  echo "Erro: não foi possível ler PORTVERSION de $PACKAGE_DIR/Makefile" >&2
  exit 1
fi

echo "Versão do package: $VERSION"
echo "Build do artefato..."
"$SCRIPT_DIR/build-pfsense-package-artifact.sh" "$VERSION"

ARTIFACT_NAME="monitor-pfsense-package-v${VERSION}.tar.gz"
SHA256_FILE="$DIST_DIR/${ARTIFACT_NAME}.sha256"
if [[ ! -f "$SHA256_FILE" ]]; then
  echo "Erro: checksum não encontrado: $SHA256_FILE" >&2
  exit 1
fi

SHA256_VALUE="$(awk '{print $1}' "$SHA256_FILE")"

# Repo raw base: .env.api ou derivado do git remote
REPO_RAW_BASE=""
if [[ -f "$ROOT_DIR/.env.api" ]]; then
  REPO_RAW_BASE="$(awk -F= -v key='PACKAGE_RELEASE_REPO_RAW_BASE' '$1==key { gsub(/^[^=]*=/, ""); print; exit }' "$ROOT_DIR/.env.api" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
fi
if [[ -z "$REPO_RAW_BASE" ]]; then
  REMOTE="$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null || true)"
  BRANCH="$(git -C "$ROOT_DIR" branch --show-current 2>/dev/null || echo "main")"
  if [[ "$REMOTE" =~ github\.com[:/](.+)/(.+)\.git ]]; then
    ORG_REPO="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    REPO_RAW_BASE="https://raw.githubusercontent.com/${ORG_REPO}/${BRANCH}"
  fi
fi
if [[ -z "$REPO_RAW_BASE" ]]; then
  REPO_RAW_BASE="https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main"
fi

mkdir -p "$(dirname "$CONFIG_FILE")"
cat > "$CONFIG_FILE" <<EOF
# Versão e checksum do package pfSense — atualizado pelo script scripts/release-pfsense-package.sh
# A API usa estes valores para montar o comando de bootstrap; o script generate-install-command.sh também.
PACKAGE_RELEASE_VERSION=$VERSION
PACKAGE_RELEASE_SHA256=$SHA256_VALUE
PACKAGE_RELEASE_REPO_RAW_BASE=$REPO_RAW_BASE
EOF

echo "Config atualizado: $CONFIG_FILE"
echo "  PACKAGE_RELEASE_VERSION=$VERSION"
echo "  PACKAGE_RELEASE_SHA256=$SHA256_VALUE"
echo "  PACKAGE_RELEASE_REPO_RAW_BASE=$REPO_RAW_BASE"

if [[ "$NO_PUSH" == true ]]; then
  echo "Opção --no-push: nenhum commit nem push."
  exit 0
fi

# Commit e push
git -C "$ROOT_DIR" add -f "$CONFIG_FILE" "$DIST_DIR/${ARTIFACT_NAME}" "$DIST_DIR/${ARTIFACT_NAME}.sha256"
if git -C "$ROOT_DIR" diff --staged --quiet; then
  echo "Nenhuma alteração para commit (config e artefato já estão em dia)."
  exit 0
fi

git -C "$ROOT_DIR" commit -m "Release pfsense package $VERSION"
echo "Commit feito. Fazendo push..."
git -C "$ROOT_DIR" push

echo "Concluído. Após o próximo deploy/restart da API, todos os comandos de bootstrap (novos e já gerados) usarão a versão $VERSION."
