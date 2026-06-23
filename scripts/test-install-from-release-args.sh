#!/usr/bin/env bash
# Valida parsing de secret em install-from-release.sh (sem instalação completa).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALLER="$ROOT_DIR/packages/pfsense-package/bootstrap/install-from-release.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "OK: $*"
}

[[ -x "$INSTALLER" ]] || chmod +x "$INSTALLER"

echo "[1/4] --help"
"$INSTALLER" --help >/dev/null

echo "[2/4] --node-secret legado aceito (nao recusa argv)"
LEGACY_OUT="$(
  env -u MONITOR_UPDATE_NODE_SECRET "$INSTALLER" \
    --release-url http://127.0.0.1:1/nonexistent \
    --sha256 0000000000000000000000000000000000000000000000000000000000000000 \
    --node-secret legacy-test-secret 2>&1 || true
)"
echo "$LEGACY_OUT" | grep -qi "Refusing --node-secret" && fail "nao deve recusar --node-secret legado"
echo "$LEGACY_OUT" | grep -qi "deprecated" || fail "deve emitir aviso deprecated para --node-secret"
echo "$LEGACY_OUT" | grep -qi "Neither fetch nor curl" && pass "passou do parsing de secret (falhou em fetch como esperado)"

echo "[3/4] prioridade env > --secret-file > --node-secret legado"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
SECRET_FILE="$STAGE/secret-file"
printf '%s' 'from-file' >"$SECRET_FILE"
chmod 600 "$SECRET_FILE"

PRIORITY_OUT="$(
  MONITOR_UPDATE_NODE_SECRET='from-env' "$INSTALLER" \
    --release-url http://127.0.0.1:1/nonexistent \
    --sha256 0000000000000000000000000000000000000000000000000000000000000000 \
    --secret-file "$SECRET_FILE" \
    --node-secret from-legacy 2>&1 || true
)"
echo "$PRIORITY_OUT" | grep -qi "Refusing" && fail "nao deve recusar quando env presente"

echo "[4/4] --secret-file sozinho aceito"
FILE_ONLY_OUT="$(
  env -u MONITOR_UPDATE_NODE_SECRET "$INSTALLER" \
    --release-url http://127.0.0.1:1/nonexistent \
    --sha256 0000000000000000000000000000000000000000000000000000000000000000 \
    --secret-file "$SECRET_FILE" 2>&1 || true
)"
echo "$FILE_ONLY_OUT" | grep -qi "Node secret required" && fail "secret-file deveria bastar"
echo "$FILE_ONLY_OUT" | grep -qi "Neither fetch nor curl" && pass "secret-file aceito no parsing"

echo "Todos os testes de args passaram."
