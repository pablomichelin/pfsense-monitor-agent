#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-https://pfs-monitor.systemup.inf.br}"
DURATION_SECONDS="${DURATION_SECONDS:-36}"

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

if [[ -z "$AUTH_EMAIL" || -z "$AUTH_PASSWORD" ]]; then
  echo "AUTH_EMAIL/AUTH_PASSWORD ausentes. Defina no ambiente ou em .env.api." >&2
  exit 1
fi

COOKIE_JAR="$(mktemp)"
LOGIN_HEADERS="$(mktemp)"
SSE_HEADERS="$(mktemp)"
STREAM_OUT="$(mktemp)"

cleanup() {
  rm -f "$COOKIE_JAR" "$LOGIN_HEADERS" "$SSE_HEADERS" "$STREAM_OUT"
}

trap cleanup EXIT

echo "[1/4] Login em $BASE_URL"
curl -skS \
  -D "$LOGIN_HEADERS" \
  -b "$COOKIE_JAR" \
  -c "$COOKIE_JAR" \
  -H "content-type: application/json" \
  -X POST \
  "$BASE_URL/api/v1/auth/login" \
  --data "{\"email\":\"$AUTH_EMAIL\",\"password\":\"$AUTH_PASSWORD\"}" \
  >/dev/null

echo "[2/4] Validando cabecalhos do stream"
curl -skS \
  -I \
  -D "$SSE_HEADERS" \
  -o /dev/null \
  -b "$COOKIE_JAR" \
  "$BASE_URL/api/realtime/dashboard"

grep -qi '^HTTP/.* 200' "$SSE_HEADERS" || {
  echo "Stream nao respondeu 200." >&2
  sed -n '1,40p' "$SSE_HEADERS" >&2
  exit 1
}

grep -qi '^content-type: text/event-stream' "$SSE_HEADERS" || {
  echo "Content-Type do stream nao e text/event-stream." >&2
  sed -n '1,40p' "$SSE_HEADERS" >&2
  exit 1
}

grep -qi '^cache-control: no-cache, no-transform' "$SSE_HEADERS" || {
  echo "Cache-Control esperado nao encontrado no stream." >&2
  sed -n '1,40p' "$SSE_HEADERS" >&2
  exit 1
}

echo "[3/4] Mantendo stream aberto por $DURATION_SECONDS segundos"
timeout "${DURATION_SECONDS}s" \
  curl -skN -b "$COOKIE_JAR" "$BASE_URL/api/realtime/dashboard" \
  > "$STREAM_OUT" || true

CONNECTED_COUNT="$(grep -c '^event: connected' "$STREAM_OUT" || true)"
KEEPALIVE_COUNT="$(grep -c '^event: keepalive' "$STREAM_OUT" || true)"
REFRESH_COUNT="$(grep -c '^event: dashboard.refresh' "$STREAM_OUT" || true)"

if [[ "$CONNECTED_COUNT" -lt 1 ]]; then
  echo "Stream nao entregou evento connected." >&2
  sed -n '1,80p' "$STREAM_OUT" >&2
  exit 1
fi

if [[ "$KEEPALIVE_COUNT" -lt 1 ]]; then
  echo "Stream nao entregou keepalive dentro da janela observada." >&2
  sed -n '1,80p' "$STREAM_OUT" >&2
  exit 1
fi

echo "[4/4] Resultado"
echo "OK: connected=$CONNECTED_COUNT keepalive=$KEEPALIVE_COUNT dashboard.refresh=$REFRESH_COUNT"
echo
echo "Cabecalhos observados:"
sed -n '1,20p' "$SSE_HEADERS"
echo
echo "Amostra do stream:"
sed -n '1,40p' "$STREAM_OUT"
