#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"
NODE_ID="${1:-}"
RELEASE_BASE_URL_OVERRIDE="${2:-}"
CONTROLLER_URL_OVERRIDE="${3:-}"
AUTO_STAGE_RELEASE="${AUTO_STAGE_RELEASE:-0}"
SERVER_PID=""
SERVER_LOG=""
STAGE_DIR=""

usage() {
  cat <<'EOF'
Uso:
  scripts/run-bootstrap-preflight.sh <node_id> [release_base_url] [controller_url]

Exemplos:
  scripts/run-bootstrap-preflight.sh clz123
  BASE_URL="https://pfs-monitor.systemup.inf.br" \
    AUTH_EMAIL="admin@systemup.inf.br" \
    AUTH_PASSWORD="***" \
    scripts/run-bootstrap-preflight.sh clz123 \
    "https://downloads.systemup.inf.br/monitor-pfsense" \
    "https://pfs-monitor.systemup.inf.br"

Fluxo:
  1. valida localmente o release versionado do agente
  2. valida o bootstrap-command do node informado
  3. valida artifact/checksum/installer publicados

Variaveis suportadas:
  AUTO_STAGE_RELEASE=1  publica temporariamente o release local por HTTP e usa
                        esse URL como override quando release_base_url nao e informado
EOF
}

if [[ -z "$NODE_ID" || "$NODE_ID" == "-h" || "$NODE_ID" == "--help" ]]; then
  usage
  exit 0
fi

read_env_value() {
  local key="$1"
  local env_file="${2:-$ROOT_DIR/.env.api}"
  [[ ! -f "$env_file" ]] && return 1
  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "$env_file"
}

# Modo package: PACKAGE_RELEASE_VERSION configurado = fluxo package homologado
PACKAGE_VERSION="$(read_env_value PACKAGE_RELEASE_VERSION 2>/dev/null || true)"
MODE_PACKAGE=""
if [[ -n "$PACKAGE_VERSION" ]]; then
  MODE_PACKAGE=1
fi

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi

  rm -rf "$STAGE_DIR"
  rm -f "$SERVER_LOG"
}

stage_local_release() {
  local version artifact_name artifact_path checksum_path installer_source port

  version="$(
    awk -F= '$1 == "SYSTEM_VERSION" { sub(/^[^=]*=/, ""); print; exit }' "$ROOT_DIR/.env.api" 2>/dev/null
  )"
  if [[ -z "$version" ]]; then
    version="0.1.0"
  fi

  artifact_name="monitor-pfsense-agent-v${version}.tar.gz"
  artifact_path="$ROOT_DIR/dist/pfsense-agent/$artifact_name"
  checksum_path="$ROOT_DIR/dist/pfsense-agent/${artifact_name}.sha256"
  installer_source="$ROOT_DIR/packages/pfsense-agent/bootstrap/install-from-release.sh"

  if [[ ! -f "$artifact_path" || ! -f "$checksum_path" ]]; then
    "$SCRIPTS_DIR/build-pfsense-agent-artifact.sh" "$version"
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required for AUTO_STAGE_RELEASE=1" >&2
    exit 1
  fi

  STAGE_DIR="$(mktemp -d)"
  SERVER_LOG="$(mktemp)"

  cp "$artifact_path" "$STAGE_DIR/$artifact_name"
  cp "$checksum_path" "$STAGE_DIR/${artifact_name}.sha256"
  cp "$installer_source" "$STAGE_DIR/install-from-release.sh"

  port="$(
    python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
  )"

  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$STAGE_DIR" >"$SERVER_LOG" 2>&1 &
  SERVER_PID="$!"
  sleep 1

  RELEASE_BASE_URL_OVERRIDE="http://127.0.0.1:$port"
  echo "[auto-stage] Release local publicada em $RELEASE_BASE_URL_OVERRIDE"
}

trap cleanup EXIT

SMOKE_RELEASE="$SCRIPTS_DIR/smoke-agent-release.sh"
VERIFY_BOOTSTRAP="$SCRIPTS_DIR/verify-bootstrap-release.sh"

if [[ ! -x "$SMOKE_RELEASE" ]]; then
  chmod +x "$SMOKE_RELEASE"
fi

if [[ ! -x "$VERIFY_BOOTSTRAP" ]]; then
  chmod +x "$VERIFY_BOOTSTRAP"
fi

if [[ -n "$MODE_PACKAGE" ]]; then
  echo "[modo package] PACKAGE_RELEASE_VERSION=$PACKAGE_VERSION - pulando smoke-agent-release"
  echo "[1/1] Validando bootstrap do node $NODE_ID (fluxo package)"
else
  echo "[1/2] Validando release local do agente"
  BASE_URL="${BASE_URL:-http://127.0.0.1:8088}" \
    AUTH_EMAIL="${AUTH_EMAIL:-}" \
    AUTH_PASSWORD="${AUTH_PASSWORD:-}" \
    "$SMOKE_RELEASE"

  if [[ -z "$RELEASE_BASE_URL_OVERRIDE" && "$AUTO_STAGE_RELEASE" == "1" ]]; then
    stage_local_release
  fi
  echo
  echo "[2/2] Validando bootstrap do node $NODE_ID"
fi
BASE_URL="${BASE_URL:-http://127.0.0.1:8088}" \
  AUTH_EMAIL="${AUTH_EMAIL:-}" \
  AUTH_PASSWORD="${AUTH_PASSWORD:-}" \
  "$VERIFY_BOOTSTRAP" "$NODE_ID" "$RELEASE_BASE_URL_OVERRIDE" "$CONTROLLER_URL_OVERRIDE"
