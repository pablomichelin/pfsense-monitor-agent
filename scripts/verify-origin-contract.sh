#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-https://pfs-monitor.systemup.inf.br}"
SSE_DURATION_SECONDS="${SSE_DURATION_SECONDS:-36}"

cleanup() {
  rm -f "${TMP_BIG_PAYLOAD:-}" "${TMP_BIG_RESPONSE:-}"
}

trap cleanup EXIT

echo "[1/4] Validando /healthz em $BASE_URL"
HEALTH_HEADERS="$(curl -skI "$BASE_URL/healthz")"
grep -qi '^HTTP/.* 200' <<<"$HEALTH_HEADERS"
grep -qi '^content-type: application/json' <<<"$HEALTH_HEADERS"

echo "[2/4] Validando login e asset estatico versionado"
BASE_URL="$BASE_URL" "$ROOT_DIR/scripts/smoke-frontend-assets.sh"

echo "[3/4] Validando limite de payload do proxy em 64k"
TMP_BIG_PAYLOAD="$(mktemp)"
TMP_BIG_RESPONSE="$(mktemp)"
python3 - <<'PY' > "$TMP_BIG_PAYLOAD"
print("A" * 70000)
PY

HTTP_CODE="$(
  curl -skS \
    -o "$TMP_BIG_RESPONSE" \
    -w '%{http_code}' \
    -H 'content-type: application/json' \
    -X POST \
    "$BASE_URL/api/v1/ingest/heartbeat" \
    --data-binary @"$TMP_BIG_PAYLOAD" || true
)"

if [[ "$HTTP_CODE" != "413" ]]; then
  echo "Esperado HTTP 413 para payload acima de 64k, recebido: $HTTP_CODE" >&2
  sed -n '1,40p' "$TMP_BIG_RESPONSE" >&2 || true
  exit 1
fi

echo "[4/4] Validando stream SSE autenticado"
BASE_URL="$BASE_URL" DURATION_SECONDS="$SSE_DURATION_SECONDS" \
  AUTH_EMAIL="${AUTH_EMAIL:-}" AUTH_PASSWORD="${AUTH_PASSWORD:-}" \
  "$ROOT_DIR/scripts/verify-sse-stream.sh"

echo
echo "Contrato de origem OK: healthz, login/assets, limite 64k e SSE validados."
