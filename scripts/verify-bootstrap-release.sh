#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"
NODE_ID="${1:-}"
RELEASE_BASE_URL_OVERRIDE="${2:-}"
CONTROLLER_URL_OVERRIDE="${3:-}"

read_env_value() {
  local key="$1"
  local env_file="${2:-$ROOT_DIR/.env.api}"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "$env_file"
}

AUTH_EMAIL="${AUTH_EMAIL:-$(read_env_value AUTH_BOOTSTRAP_EMAIL 2>/dev/null || true)}"
AUTH_PASSWORD="${AUTH_PASSWORD:-$(read_env_value AUTH_BOOTSTRAP_PASSWORD 2>/dev/null || true)}"

usage() {
  cat <<'EOF'
Uso:
  scripts/verify-bootstrap-release.sh <node_id> [release_base_url] [controller_url]

Exemplos:
  scripts/verify-bootstrap-release.sh clz123
  BASE_URL="https://pfs-monitor.systemup.inf.br" \
    AUTH_EMAIL="admin@systemup.inf.br" \
    AUTH_PASSWORD="***" \
    scripts/verify-bootstrap-release.sh clz123 \
    "https://downloads.systemup.inf.br/monitor-pfsense" \
    "https://pfs-monitor.systemup.inf.br"

Variaveis suportadas:
  BASE_URL       Base do painel/API. Padrao: http://127.0.0.1:8088
  AUTH_EMAIL     Login administrativo
  AUTH_PASSWORD  Senha administrativa
EOF
}

if [[ -z "$NODE_ID" || "${NODE_ID:-}" == "-h" || "${NODE_ID:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "$AUTH_EMAIL" || -z "$AUTH_PASSWORD" ]]; then
  echo "AUTH_EMAIL/AUTH_PASSWORD ausentes. Defina no ambiente ou em .env.api." >&2
  exit 1
fi

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

json_get() {
  local json="$1"
  local expression="$2"

  node -e '
const payload = JSON.parse(process.argv[1]);
const expression = process.argv[2].split(".");
let current = payload;
for (const part of expression) {
  if (/^\d+$/.test(part)) {
    current = current?.[Number(part)];
  } else {
    current = current?.[part];
  }
}
if (current === undefined || current === null) {
  process.exit(1);
}
if (typeof current === "object") {
  process.stdout.write(JSON.stringify(current));
} else {
  process.stdout.write(String(current));
}
' "$json" "$expression"
}

echo "[1/5] Login administrativo em $BASE_URL"
LOGIN_RESPONSE="$(curl -skS \
  -b "$COOKIE_JAR" \
  -c "$COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}")"
json_get "$LOGIN_RESPONSE" "ok" >/dev/null

QUERY_STRING=""
if [[ -n "$RELEASE_BASE_URL_OVERRIDE" || -n "$CONTROLLER_URL_OVERRIDE" ]]; then
  QUERY_STRING="$(
    node -e '
const params = new URLSearchParams();
if (process.argv[1]) params.set("release_base_url", process.argv[1]);
if (process.argv[2]) params.set("controller_url", process.argv[2]);
process.stdout.write(params.toString());
' "$RELEASE_BASE_URL_OVERRIDE" "$CONTROLLER_URL_OVERRIDE"
  )"
fi

BOOTSTRAP_URL="$BASE_URL/api/v1/admin/nodes/$NODE_ID/bootstrap-command"
if [[ -n "$QUERY_STRING" ]]; then
  BOOTSTRAP_URL="${BOOTSTRAP_URL}?${QUERY_STRING}"
fi

echo "[2/5] Lendo comando de bootstrap do node $NODE_ID"
BOOTSTRAP_RESPONSE="$(curl -skS -b "$COOKIE_JAR" "$BOOTSTRAP_URL")"

READY="$(json_get "$BOOTSTRAP_RESPONSE" "release.ready")"
VERSION="$(json_get "$BOOTSTRAP_RESPONSE" "release.version")"
NODE_UID="$(json_get "$BOOTSTRAP_RESPONSE" "node.node_uid")"
CONTROLLER_URL="$(json_get "$BOOTSTRAP_RESPONSE" "release.controller_url")"
RELEASE_BASE_URL="$(json_get "$BOOTSTRAP_RESPONSE" "release.release_base_url" || true)"
ARTIFACT_URL="$(json_get "$BOOTSTRAP_RESPONSE" "release.artifact_url" || true)"
CHECKSUM_URL="$(json_get "$BOOTSTRAP_RESPONSE" "release.checksum_url" || true)"
INSTALLER_URL="$(json_get "$BOOTSTRAP_RESPONSE" "release.installer_url" || true)"
COMMAND="$(json_get "$BOOTSTRAP_RESPONSE" "command" || true)"

echo "Node UID:        $NODE_UID"
echo "Versao release:  $VERSION"
echo "Controller URL:  $CONTROLLER_URL"
echo "Release base:    ${RELEASE_BASE_URL:-nao configurada}"

if [[ "$READY" != "true" ]]; then
  echo "Bootstrap nao esta pronto: release.ready=$READY" >&2
  exit 1
fi

if [[ -z "$ARTIFACT_URL" || -z "$CHECKSUM_URL" || -z "$INSTALLER_URL" || -z "$COMMAND" ]]; then
  echo "Bootstrap incompleto: artifact/checksum/installer/command ausentes." >&2
  exit 1
fi

echo "[3/5] Validando acessibilidade dos artefatos publicados"
curl -fsSIL "$ARTIFACT_URL" >/dev/null
curl -fsSIL "$CHECKSUM_URL" >/dev/null
curl -fsSIL "$INSTALLER_URL" >/dev/null

echo "[4/5] Validando formato do checksum publicado"
CHECKSUM_CONTENT="$(curl -fsSL "$CHECKSUM_URL")"
CHECKSUM_VALUE="$(awk 'NR==1 {print $1}' <<<"$CHECKSUM_CONTENT")"
if [[ ! "$CHECKSUM_VALUE" =~ ^[a-fA-F0-9]{64}$ ]]; then
  echo "Checksum invalido em $CHECKSUM_URL" >&2
  exit 1
fi

echo "[5/5] Conferindo conteudo do comando one-shot"
grep -q -- "$ARTIFACT_URL" <<<"$COMMAND"
grep -q -- "$CHECKSUM_URL" <<<"$COMMAND"
grep -q -- "$INSTALLER_URL" <<<"$COMMAND"
grep -q -- "--controller-url '" <<<"$COMMAND"
grep -q -- "--node-uid '" <<<"$COMMAND"
grep -q -- '--sha256 "$SHA256_VALUE"' <<<"$COMMAND"

echo
echo "Bootstrap release OK:"
echo "- node_id: $NODE_ID"
echo "- node_uid: $NODE_UID"
echo "- artifact_url: $ARTIFACT_URL"
echo "- checksum_url: $CHECKSUM_URL"
echo "- installer_url: $INSTALLER_URL"
echo
echo "Comando one-shot:"
echo "$COMMAND"
