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
SOURCE_BUILD=0
if [[ "${1:-}" == "--candidate" ]]; then
  SOURCE_BUILD=1
  shift
fi
if [[ "$#" -gt 1 ]]; then
  echo "Usage: $0 [--candidate] [version]" >&2
  exit 2
fi
VERSION="${1:-}"
SMOKE_CONTROLLER_URL='https://127.0.0.1:9'

read_env_value() {
  local key="$1"
  local env_file="${2:-$ROOT_DIR/.env.api}"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "$env_file"
}

if [[ -z "$VERSION" && "$SOURCE_BUILD" == "0" ]]; then
  VERSION="$(read_env_value PACKAGE_RELEASE_VERSION "$ROOT_DIR/config/package-release.env" 2>/dev/null || true)"
fi

if [[ -z "$VERSION" && "$SOURCE_BUILD" == "0" ]]; then
  VERSION="$(read_env_value PACKAGE_RELEASE_VERSION 2>/dev/null || true)"
fi

if [[ -z "$VERSION" ]]; then
  VERSION="$(awk -F= '$1 == "PORTVERSION" { sub(/^[^=]*=[[:space:]]*/, ""); print; exit }' "$PACKAGE_DIR/Makefile")"
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for smoke-agent-release.sh" >&2
  exit 1
fi

ARTIFACT_NAME="monitor-pfsense-package-v${VERSION}.tar.gz"
INSTALLER_SOURCE="$PACKAGE_DIR/bootstrap/install-from-release.sh"
UNINSTALL_SOURCE="$PACKAGE_DIR/bootstrap/uninstall.sh"

STAGE_DIR="$(mktemp -d)"
INSTALL_ROOT="$(mktemp -d)"
SERVER_LOG="$(mktemp)"
PORT_FILE="$(mktemp)"
STDERR_LOG="$(mktemp)"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$STAGE_DIR" "$INSTALL_ROOT"
  rm -f "$SERVER_LOG" "$PORT_FILE" "$STDERR_LOG"
}

trap cleanup EXIT

echo "[1/9] Garantindo artefato local do package"
if [[ "$SOURCE_BUILD" == "1" ]]; then
  DIST_DIR="$STAGE_DIR/candidate"
  "$ROOT_DIR/scripts/build-pfsense-package-artifact.sh" "$VERSION" --output-dir "$DIST_DIR"
fi
ARTIFACT_PATH="$DIST_DIR/$ARTIFACT_NAME"
CHECKSUM_PATH="$DIST_DIR/${ARTIFACT_NAME}.sha256"
if [[ "$SOURCE_BUILD" == "0" && ( ! -f "$ARTIFACT_PATH" || ! -f "$CHECKSUM_PATH" ) ]]; then
  "$ROOT_DIR/scripts/build-pfsense-package-artifact.sh" "$VERSION"
fi

echo "[2/9] Validando arquivos de release e checksum"
[[ -f "$ARTIFACT_PATH" ]]
[[ -f "$CHECKSUM_PATH" ]]
[[ -f "$INSTALLER_SOURCE" ]]
[[ -f "$UNINSTALL_SOURCE" ]]

EXPECTED_SHA256="$(awk '{print $1}' "$CHECKSUM_PATH")"
ACTUAL_SHA256="$(python3 - "$ARTIFACT_PATH" <<'PYTHON'
import hashlib
from pathlib import Path
import sys
print(hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest())
PYTHON
)"
[[ "$EXPECTED_SHA256" == "$ACTUAL_SHA256" ]]
python3 - "$ARTIFACT_PATH" "$VERSION" <<'PYTHON'
import sys
import tarfile

with tarfile.open(sys.argv[1], "r:gz") as archive:
    member = archive.extractfile("pfsense-package/VERSION")
    expected = f"v{sys.argv[2]}".encode("ascii")
    if member is None or member.read().strip() != expected:
        sys.exit("Artifact VERSION does not match the selected package release.")
PYTHON

echo "[3/9] Publicando release por HTTP local temporario"
cp "$ARTIFACT_PATH" "$STAGE_DIR/$ARTIFACT_NAME"
cp "$CHECKSUM_PATH" "$STAGE_DIR/${ARTIFACT_NAME}.sha256"
cp "$INSTALLER_SOURCE" "$STAGE_DIR/install-from-release.sh"

python3 - "$STAGE_DIR" "$PORT_FILE" >"$SERVER_LOG" 2>&1 <<'PYTHON' &
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import hmac
from pathlib import Path
import sys

class SmokeRequestHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        timestamp = self.headers.get("X-Timestamp")
        signature = self.headers.get("X-Signature", "")
        if (
            self.path != "/api/v1/ingest/test-connection"
            or self.headers.get("X-Node-Uid") != "release-smoke-node"
            or self.headers.get("Content-Length", "0") != "0"
            or not timestamp
        ):
            self.send_error(400)
            return
        expected = hmac.new(b"release-smoke-secret", (timestamp + "\n").encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            self.send_error(401)
            return
        payload = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

handler = partial(SmokeRequestHandler, directory=sys.argv[1])
with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
    Path(sys.argv[2]).write_text(str(server.server_port), encoding="ascii")
    server.serve_forever()
PYTHON
SERVER_PID=$!
for attempt in {1..40}; do
  [[ -s "$PORT_FILE" ]] && break
  kill -0 "$SERVER_PID" 2>/dev/null || break
  sleep 0.05
done
if [[ ! -s "$PORT_FILE" ]]; then
  echo 'Servidor temporário do package não iniciou.' >&2
  cat "$SERVER_LOG" >&2
  exit 1
fi
PORT="$(cat "$PORT_FILE")"

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
  --controller-url "$SMOKE_CONTROLLER_URL" \
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
grep -Fq "define(\"SYSTEMUP_MONITOR_AGENT_VERSION\", \"$VERSION\")" "$INC_FILE"

# B1: o runtime instalado le o segredo de NODE_SECRET_FILE (0600), nao de texto no .conf.
grep -q 'NODE_SECRET_FILE' "$AGENT_FILE"

echo "[8/9] Validando leitura do segredo via NODE_SECRET_FILE (sem texto no .conf)"
SECRET_STORE="$INSTALL_ROOT/var/db/monitor-pfsense-agent/node_secret"
mkdir -p "$(dirname "$SECRET_STORE")"
printf '%s' 'release-smoke-secret' >"$SECRET_STORE"
chmod 600 "$SECRET_STORE"

CONFIG_FILE="$INSTALL_ROOT/usr/local/etc/monitor-pfsense-agent.conf"
cat >"$CONFIG_FILE" <<EOF
CONTROLLER_URL="$RELEASE_BASE_URL"
NODE_UID="release-smoke-node"
CUSTOMER_CODE="REL-SMOKE"
NODE_SECRET_FILE="$SECRET_STORE"
AGENT_VERSION="$VERSION"
MONITOR_AGENT_INTERVAL_SECONDS="30"
MONITOR_AGENT_SERVICES="unbound,openvpn"
EOF

PRINT_CONFIG_OUTPUT="$(env -u NODE_SECRET MONITOR_AGENT_CONFIG="$CONFIG_FILE" "$AGENT_FILE" print-config)"
grep -q 'release-smoke-node' <<<"$PRINT_CONFIG_OUTPUT"
grep -Fq "NODE_SECRET_FILE=\"$SECRET_STORE\"" <<<"$PRINT_CONFIG_OUTPUT"
# O segredo em texto nao deve estar no .conf (B1): apenas o ponteiro para o arquivo 0600.
if grep -Fq 'release-smoke-secret' <<<"$PRINT_CONFIG_OUTPUT"; then
  echo 'O segredo apareceu em print-config.' >&2
  exit 1
fi
CONNECTION_OUTPUT="$(env -u NODE_SECRET MONITOR_AGENT_CONFIG="$CONFIG_FILE" "$AGENT_FILE" test-connection)"
python3 -c 'import json, sys; assert json.loads(sys.argv[1]) == {"ok": True}' "$CONNECTION_OUTPUT"

echo "[9/9] Retrocompat --node-secret e ciclo uninstall"
env -u MONITOR_UPDATE_NODE_SECRET INSTALL_ROOT="$INSTALL_ROOT" "$DOWNLOADED_INSTALLER" \
  --release-url "$RELEASE_URL" \
  --sha256 "$EXPECTED_SHA256" \
  --node-secret "release-smoke-secret" \
  --controller-url "$SMOKE_CONTROLLER_URL" \
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

echo "Smoke agent release OK: package $VERSION, pin --sha256, opções --secret-file/--node-secret e ciclo install/uninstall validados."
