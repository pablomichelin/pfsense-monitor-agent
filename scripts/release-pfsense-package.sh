#!/usr/bin/env bash
#
# Release do package pfSense: build do artefato, atualização da versão/sha256
# no config versionado, commit e push para o GitHub.
#
# Uso: ./scripts/release-pfsense-package.sh [--no-push | --publish-prepared]
#
# - Lê PORTVERSION do Makefile do package (a versão DEVE ser incrementada
#   manualmente no Makefile + SYSTEMUP_MONITOR_AGENT_VERSION no .inc antes
#   de republicar: a frota que já está nessa versão não reinstala)
# - Roda build-pfsense-package-artifact.sh
# - Atualiza config/package-release.env (PACKAGE_RELEASE_VERSION, PACKAGE_RELEASE_SHA256, PACKAGE_RELEASE_REPO_RAW_BASE)
# - Faz commit e push (a menos que --no-push)
#
# Após o pull no host com config/ montado, a API passa a oferecer a nova versão.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/pfsense-package"
DIST_DIR="$ROOT_DIR/dist/pfsense-package"
CONFIG_FILE="$ROOT_DIR/config/package-release.env"
NO_PUSH=false
PUBLISH_PREPARED=false

for arg in "$@"; do
  case "$arg" in
    --no-push) NO_PUSH=true ;;
    --publish-prepared) PUBLISH_PREPARED=true ;;
    -h|--help)
      echo "Uso: $0 [--no-push | --publish-prepared]"
      echo "  --no-push  Só faz build e atualiza config; não faz commit nem push"
      echo "  --publish-prepared  Publica os arquivos verificados de um build preparado"
      exit 0
      ;;
    *)
      printf 'Opção desconhecida: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

if [[ "$NO_PUSH" == true && "$PUBLISH_PREPARED" == true ]]; then
  echo "--no-push e --publish-prepared são mutuamente exclusivos." >&2
  exit 2
fi

# Versão a partir do Makefile do package (incremente PORTVERSION no Makefile quando alterar o código do agente)
VERSION="$(grep -E '^PORTVERSION=' "$PACKAGE_DIR/Makefile" | sed 's/^PORTVERSION=[[:space:]]*//' | tr -d '\r')"
if [[ -z "$VERSION" ]]; then
  echo "Erro: não foi possível ler PORTVERSION de $PACKAGE_DIR/Makefile" >&2
  exit 1
fi

INC_FILE="$PACKAGE_DIR/files/usr/local/pkg/systemup_monitor.inc"
INC_AGENT_VERSION="$(grep 'define("SYSTEMUP_MONITOR_AGENT_VERSION"' "$INC_FILE" | sed 's/.*"\([^"]*\)".*/\1/')"
if [[ "$INC_AGENT_VERSION" != "$VERSION" ]]; then
  echo "Erro: SYSTEMUP_MONITOR_AGENT_VERSION ($INC_AGENT_VERSION) != PORTVERSION ($VERSION) em $INC_FILE" >&2
  echo "Alinhe a constante com o Makefile antes de publicar o release." >&2
  exit 1
fi

echo "Versão do package: $VERSION"

ARTIFACT_NAME="monitor-pfsense-package-v${VERSION}.tar.gz"
ARTIFACT_PATH="$DIST_DIR/$ARTIFACT_NAME"
SHA256_FILE="$DIST_DIR/${ARTIFACT_NAME}.sha256"
if [[ "$PUBLISH_PREPARED" == true ]]; then
  python3 - "$ARTIFACT_PATH" "$SHA256_FILE" "$CONFIG_FILE" "$VERSION" <<'PYTHON'
import hashlib
from pathlib import Path
import re
import sys

archive, sidecar, config = map(Path, sys.argv[1:4])
version = sys.argv[4]
pending = sidecar.with_name(f".{sidecar.name}.pending")
if any(not path.is_file() or path.is_symlink() for path in (archive, sidecar, config)) or pending.exists():
    sys.exit("Release preparado incompleto. Conclua o build antes de publicar.")

digest = hashlib.sha256()
with archive.open("rb") as stream:
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
sha256 = digest.hexdigest()
if sidecar.read_text(encoding="ascii").split() != [sha256, archive.name]:
    sys.exit("Checksum do artefato preparado não confere.")
keys = {"PACKAGE_RELEASE_VERSION", "PACKAGE_RELEASE_SHA256", "PACKAGE_RELEASE_REPO_RAW_BASE"}
manifest = {}
for line in config.read_text(encoding="utf-8").splitlines():
    key, separator, value = line.partition("=")
    key = key.strip()
    if not separator or key not in keys:
        continue
    if key in manifest:
        sys.exit(f"Chave repetida no manifesto preparado: {key}")
    manifest[key] = re.sub(r"""^["']|["']$""", "", value.strip()).strip()
if (manifest.get("PACKAGE_RELEASE_VERSION") != version or
        manifest.get("PACKAGE_RELEASE_SHA256") != sha256):
    sys.exit("Versão ou checksum do manifesto preparado não confere.")
if not manifest.get("PACKAGE_RELEASE_REPO_RAW_BASE"):
    sys.exit("URL do repositório ausente no manifesto preparado.")

print(f"Artefato preparado verificado: {archive.name}")
PYTHON
else
  echo "Build do artefato..."
  "$SCRIPT_DIR/build-pfsense-package-artifact.sh" "$VERSION"
fi

if [[ "$PUBLISH_PREPARED" != true ]]; then
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
fi

if [[ "$NO_PUSH" == true ]]; then
  echo "Opção --no-push: nenhum commit nem push."
  exit 0
fi

# Commit e push
git -C "$ROOT_DIR" add -f -- "$CONFIG_FILE" "$ARTIFACT_PATH" "$SHA256_FILE"
RELEASE_COMMIT_MESSAGE="Release pfsense package $VERSION"
if git -C "$ROOT_DIR" diff --staged --quiet -- "$CONFIG_FILE" "$ARTIFACT_PATH" "$SHA256_FILE"; then
  if [[ "$PUBLISH_PREPARED" != true || "$(git -C "$ROOT_DIR" log -1 --format=%s)" != "$RELEASE_COMMIT_MESSAGE" ]]; then
    echo "Nenhuma alteração para commit nos arquivos do release."
    exit 0
  fi
  echo "Commit do release já está no HEAD. Tentando enviar novamente..."
else
  git -C "$ROOT_DIR" commit --only -m "$RELEASE_COMMIT_MESSAGE" -- "$CONFIG_FILE" "$ARTIFACT_PATH" "$SHA256_FILE"
  echo "Commit feito. Fazendo push..."
fi
git -C "$ROOT_DIR" push

echo "Concluído. Após o pull no host com config/ montado, o bootstrap oferecerá a versão $VERSION."
