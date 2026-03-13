#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist/pfsense-agent"
PACKAGE_DIR="$ROOT_DIR/packages/pfsense-agent"
VERSION="${1:-}"

read_env_value() {
  local key="$1"
  local env_file="${2:-$ROOT_DIR/.env.api}"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "$env_file"
}

if [[ -z "$VERSION" ]]; then
  VERSION="$(read_env_value SYSTEM_VERSION 2>/dev/null || true)"
fi

if [[ -z "$VERSION" ]]; then
  VERSION="0.1.0"
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for smoke-agent-release.sh" >&2
  exit 1
fi

ARTIFACT_NAME="monitor-pfsense-agent-v${VERSION}.tar.gz"
ARTIFACT_PATH="$DIST_DIR/$ARTIFACT_NAME"
CHECKSUM_PATH="$DIST_DIR/${ARTIFACT_NAME}.sha256"
MANIFEST_PATH="$DIST_DIR/SHA256SUMS"
INSTALLER_SOURCE="$PACKAGE_DIR/bootstrap/install-from-release.sh"
UNINSTALL_SOURCE="$PACKAGE_DIR/bootstrap/uninstall.sh"

STAGE_DIR="$(mktemp -d)"
INSTALL_ROOT="$(mktemp -d)"
SERVER_LOG="$(mktemp)"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$STAGE_DIR" "$INSTALL_ROOT"
  rm -f "$SERVER_LOG"
}

trap cleanup EXIT

echo "[1/8] Garantindo artefato local do agente"
if [[ ! -f "$ARTIFACT_PATH" || ! -f "$CHECKSUM_PATH" || ! -f "$MANIFEST_PATH" ]]; then
  "$ROOT_DIR/scripts/build-pfsense-agent-artifact.sh" "$VERSION"
fi

echo "[2/8] Validando arquivos de release e checksums"
[[ -f "$ARTIFACT_PATH" ]]
[[ -f "$CHECKSUM_PATH" ]]
[[ -f "$MANIFEST_PATH" ]]
[[ -f "$INSTALLER_SOURCE" ]]
[[ -f "$UNINSTALL_SOURCE" ]]

EXPECTED_SHA256="$(awk '{print $1}' "$CHECKSUM_PATH")"
ACTUAL_SHA256="$(sha256sum "$ARTIFACT_PATH" | awk '{print $1}')"
[[ "$EXPECTED_SHA256" == "$ACTUAL_SHA256" ]]
grep -q "$ARTIFACT_NAME" "$MANIFEST_PATH"

echo "[3/8] Publicando release por HTTP local temporario"
cp "$ARTIFACT_PATH" "$STAGE_DIR/$ARTIFACT_NAME"
cp "$CHECKSUM_PATH" "$STAGE_DIR/${ARTIFACT_NAME}.sha256"
cp "$INSTALLER_SOURCE" "$STAGE_DIR/install-from-release.sh"

PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$STAGE_DIR" >"$SERVER_LOG" 2>&1 &
SERVER_PID="$!"
sleep 1

RELEASE_BASE_URL="http://127.0.0.1:$PORT"
RELEASE_URL="$RELEASE_BASE_URL/$ARTIFACT_NAME"

curl -fsSL "$RELEASE_URL" -o /dev/null
curl -fsSL "$RELEASE_BASE_URL/install-from-release.sh" -o /dev/null

echo "[4/8] Executando instalador one-shot contra INSTALL_ROOT temporario"
DOWNLOADED_INSTALLER="$STAGE_DIR/install-from-release.downloaded.sh"
curl -fsSL "$RELEASE_BASE_URL/install-from-release.sh" -o "$DOWNLOADED_INSTALLER"
chmod +x "$DOWNLOADED_INSTALLER"

INSTALL_ROOT="$INSTALL_ROOT" "$DOWNLOADED_INSTALLER" \
  --release-url "$RELEASE_URL" \
  --sha256 "$EXPECTED_SHA256" \
  --controller-url "https://pfs-monitor.systemup.inf.br" \
  --node-uid "release-smoke-node" \
  --node-secret "release-smoke-secret" \
  --customer-code "REL-SMOKE" \
  --hostname-override "release-smoke-host" \
  --pfsense-version-override "2.8.1" \
  --interval-seconds "45" \
  --services "unbound,openvpn" \
  --no-start

echo "[5/8] Validando arquivos instalados"
CONFIG_FILE="$INSTALL_ROOT/usr/local/etc/monitor-pfsense-agent.conf"
AGENT_FILE="$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh"
LOOP_FILE="$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh"
RC_FILE="$INSTALL_ROOT/usr/local/etc/rc.d/monitor_pfsense_agent"

[[ -f "$CONFIG_FILE" ]]
[[ -x "$AGENT_FILE" ]]
[[ -x "$LOOP_FILE" ]]
[[ -x "$RC_FILE" ]]

grep -q 'CONTROLLER_URL="https://pfs-monitor.systemup.inf.br"' "$CONFIG_FILE"
grep -q 'NODE_UID="release-smoke-node"' "$CONFIG_FILE"
grep -q 'NODE_SECRET="release-smoke-secret"' "$CONFIG_FILE"
grep -q 'CUSTOMER_CODE="REL-SMOKE"' "$CONFIG_FILE"
grep -q 'MONITOR_AGENT_INTERVAL_SECONDS="45"' "$CONFIG_FILE"
grep -q 'MONITOR_AGENT_SERVICES="unbound,openvpn"' "$CONFIG_FILE"

echo "[6/8] Validando leitura da configuracao instalada"
PRINT_CONFIG_OUTPUT="$(
  MONITOR_AGENT_CONFIG="$CONFIG_FILE" \
    "$AGENT_FILE" print-config
)"
grep -q 'release-smoke-node' <<<"$PRINT_CONFIG_OUTPUT"
grep -q 'REL-SMOKE' <<<"$PRINT_CONFIG_OUTPUT"

echo "[7/8] Executando uninstall no INSTALL_ROOT temporario"
INSTALL_ROOT="$INSTALL_ROOT" "$UNINSTALL_SOURCE"
[[ ! -e "$CONFIG_FILE" ]]
[[ ! -e "$AGENT_FILE" ]]
[[ ! -e "$RC_FILE" ]]

echo "[8/8] Release do agente validado localmente"
echo "Smoke agent release OK: artefato, checksum, instalador HTTP e ciclo install/uninstall validados."
