#!/usr/bin/env bash

set -euo pipefail

# 0.4.0: o "release do agente" passou a ser entregue pelo package nativo do pfSense
# (packages/pfsense-package). O tarball legado packages/pfsense-agent foi marcado
# DEPRECATED (item B7) e nao incorpora o contrato de seguranca B1, entao este smoke
# valida o instalador REAL do 0.4.0:
#   - artefato + checksum do package
#   - pin obrigatorio --sha256
#   - contrato B1 do segredo: MONITOR_UPDATE_NODE_SECRET > --secret-file > --node-secret (legado)
#   - ciclo install/uninstall em INSTALL_ROOT temporario
#   - runtime do agente le o segredo de NODE_SECRET_FILE (0600), nao de texto no .conf

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist/pfsense-package"
PACKAGE_DIR="$ROOT_DIR/packages/pfsense-package"
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
  VERSION="$(read_env_value PACKAGE_RELEASE_VERSION "$ROOT_DIR/config/package-release.env" 2>/dev/null || true)"
fi

if [[ -z "$VERSION" ]]; then
  VERSION="$(read_env_value PACKAGE_RELEASE_VERSION 2>/dev/null || true)"
fi

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

ARTIFACT_NAME="monitor-pfsense-package-v${VERSION}.tar.gz"
ARTIFACT_PATH="$DIST_DIR/$ARTIFACT_NAME"
CHECKSUM_PATH="$DIST_DIR/${ARTIFACT_NAME}.sha256"
INSTALLER_SOURCE="$PACKAGE_DIR/bootstrap/install-from-release.sh"
UNINSTALL_SOURCE="$PACKAGE_DIR/bootstrap/uninstall.sh"

STAGE_DIR="$(mktemp -d)"
INSTALL_ROOT="$(mktemp -d)"
SERVER_LOG="$(mktemp)"
STDERR_LOG="$(mktemp)"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$STAGE_DIR" "$INSTALL_ROOT"
  rm -f "$SERVER_LOG" "$STDERR_LOG"
}

trap cleanup EXIT

echo "[1/9] Garantindo artefato local do package"
if [[ ! -f "$ARTIFACT_PATH" || ! -f "$CHECKSUM_PATH" ]]; then
  "$ROOT_DIR/scripts/build-pfsense-package-artifact.sh" "$VERSION"
fi

echo "[2/9] Validando arquivos de release e checksum"
[[ -f "$ARTIFACT_PATH" ]]
[[ -f "$CHECKSUM_PATH" ]]
[[ -f "$INSTALLER_SOURCE" ]]
[[ -f "$UNINSTALL_SOURCE" ]]

EXPECTED_SHA256="$(awk '{print $1}' "$CHECKSUM_PATH")"
ACTUAL_SHA256="$(sha256sum "$ARTIFACT_PATH" | awk '{print $1}')"
[[ "$EXPECTED_SHA256" == "$ACTUAL_SHA256" ]]

echo "[3/9] Publicando release por HTTP local temporario"
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

echo "[4/9] Baixando instalador one-shot"
DOWNLOADED_INSTALLER="$STAGE_DIR/install-from-release.downloaded.sh"
curl -fsSL "$RELEASE_BASE_URL/install-from-release.sh" -o "$DOWNLOADED_INSTALLER"
chmod +x "$DOWNLOADED_INSTALLER"

SECRET_FILE="$STAGE_DIR/update-secret"
printf '%s' 'release-smoke-secret' >"$SECRET_FILE"
chmod 600 "$SECRET_FILE"

echo "[5/9] Pin obrigatorio: instalador recusa release sem --sha256"
set +e
env -u MONITOR_UPDATE_NODE_SECRET INSTALL_ROOT="$INSTALL_ROOT" "$DOWNLOADED_INSTALLER" \
  --release-url "$RELEASE_URL" \
  --secret-file "$SECRET_FILE" \
  >/dev/null 2>"$STDERR_LOG"
NO_SHA_STATUS=$?
set -e
[[ "$NO_SHA_STATUS" -ne 0 ]]
grep -q -- '--sha256' "$STDERR_LOG"

echo "[6/9] Contrato B1: instalador exige segredo (sem env/--secret-file/--node-secret)"
set +e
env -u MONITOR_UPDATE_NODE_SECRET INSTALL_ROOT="$INSTALL_ROOT" "$DOWNLOADED_INSTALLER" \
  --release-url "$RELEASE_URL" \
  --sha256 "$EXPECTED_SHA256" \
  >/dev/null 2>"$STDERR_LOG"
NO_SECRET_STATUS=$?
set -e
[[ "$NO_SECRET_STATUS" -ne 0 ]]
grep -qi 'secret' "$STDERR_LOG"

echo "[7/9] Instalando com --secret-file (caminho B1) e validando arquivos"
env -u MONITOR_UPDATE_NODE_SECRET INSTALL_ROOT="$INSTALL_ROOT" "$DOWNLOADED_INSTALLER" \
  --release-url "$RELEASE_URL" \
  --sha256 "$EXPECTED_SHA256" \
  --secret-file "$SECRET_FILE" \
  --controller-url "https://pfs-monitor.systemup.inf.br" \
  --node-uid "release-smoke-node" \
  --customer-code "REL-SMOKE" \
  --heartbeat-mode "normal"

AGENT_FILE="$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh"
LOOP_FILE="$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh"
RC_FILE="$INSTALL_ROOT/usr/local/etc/rc.d/monitor_pfsense_agent"
INC_FILE="$INSTALL_ROOT/usr/local/pkg/systemup_monitor.inc"
XML_FILE="$INSTALL_ROOT/usr/local/pkg/systemup_monitor.xml"
CLI_FILE="$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php"
WWW_STATUS="$INSTALL_ROOT/usr/local/www/status_systemup_monitor.php"

[[ -x "$AGENT_FILE" ]]
[[ -x "$LOOP_FILE" ]]
[[ -x "$RC_FILE" ]]
[[ -f "$INC_FILE" ]]
[[ -f "$XML_FILE" ]]
[[ -f "$CLI_FILE" ]]
[[ -f "$WWW_STATUS" ]]

# B1: o runtime instalado le o segredo de NODE_SECRET_FILE (0600), nao de texto no .conf.
grep -q 'NODE_SECRET_FILE' "$AGENT_FILE"

echo "[8/9] Validando leitura do segredo via NODE_SECRET_FILE (sem texto no .conf)"
SECRET_STORE="$INSTALL_ROOT/var/db/monitor-pfsense-agent/node_secret"
mkdir -p "$(dirname "$SECRET_STORE")"
printf '%s' 'release-smoke-secret' >"$SECRET_STORE"
chmod 600 "$SECRET_STORE"

CONFIG_FILE="$INSTALL_ROOT/usr/local/etc/monitor-pfsense-agent.conf"
cat >"$CONFIG_FILE" <<EOF
CONTROLLER_URL="https://pfs-monitor.systemup.inf.br"
NODE_UID="release-smoke-node"
CUSTOMER_CODE="REL-SMOKE"
NODE_SECRET_FILE="$SECRET_STORE"
AGENT_VERSION="$VERSION"
MONITOR_AGENT_INTERVAL_SECONDS="30"
MONITOR_AGENT_SERVICES="unbound,openvpn"
EOF

PRINT_CONFIG_OUTPUT="$(MONITOR_AGENT_CONFIG="$CONFIG_FILE" "$AGENT_FILE" print-config)"
grep -q 'release-smoke-node' <<<"$PRINT_CONFIG_OUTPUT"
grep -q "NODE_SECRET_FILE=\"$SECRET_STORE\"" <<<"$PRINT_CONFIG_OUTPUT"
# O segredo em texto nao deve estar no .conf (B1): apenas o ponteiro para o arquivo 0600.
! grep -q 'NODE_SECRET="release-smoke-secret"' <<<"$PRINT_CONFIG_OUTPUT"

echo "[9/9] Retrocompat --node-secret e ciclo uninstall"
env -u MONITOR_UPDATE_NODE_SECRET INSTALL_ROOT="$INSTALL_ROOT" "$DOWNLOADED_INSTALLER" \
  --release-url "$RELEASE_URL" \
  --sha256 "$EXPECTED_SHA256" \
  --node-secret "release-smoke-secret" \
  --controller-url "https://pfs-monitor.systemup.inf.br" \
  --node-uid "release-smoke-node" \
  --customer-code "REL-SMOKE" \
  >/dev/null 2>"$STDERR_LOG"
# Retrocompat mantida, mas com aviso de depreciacao no stderr (B1).
grep -qi 'deprecated' "$STDERR_LOG"

INSTALL_ROOT="$INSTALL_ROOT" "$UNINSTALL_SOURCE" >/dev/null
[[ ! -e "$AGENT_FILE" ]]
[[ ! -e "$RC_FILE" ]]
[[ ! -e "$INC_FILE" ]]
[[ ! -e "$INSTALL_ROOT/var/db/monitor-pfsense-agent" ]]

echo "Smoke agent release OK: package 0.4.0, pin --sha256, contrato B1 do segredo (env/--secret-file/--node-secret) e ciclo install/uninstall validados."
