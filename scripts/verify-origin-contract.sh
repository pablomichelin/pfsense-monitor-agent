#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-https://pfs-monitor.systemup.inf.br}"
SSE_DURATION_SECONDS="${SSE_DURATION_SECONDS:-36}"

cleanup() {
  rm -f "${TMP_HEALTH_RESPONSE:-}" "${TMP_BIG_PAYLOAD:-}" "${TMP_BIG_RESPONSE:-}"
}

trap cleanup EXIT

echo "[1/4] Validando /healthz em $BASE_URL"
TMP_HEALTH_RESPONSE="$(mktemp)"
HEALTH_RESULT="$(curl -skS -o "$TMP_HEALTH_RESPONSE" -w '%{http_code} %{content_type}' "$BASE_URL/healthz")"
if ! python3 - "$HEALTH_RESULT" "$TMP_HEALTH_RESPONSE" <<'PY'
import json
import sys

status, _, content_type = sys.argv[1].partition(" ")
if status != "200" or content_type.partition(";")[0].strip().lower() != "application/json":
    sys.exit(1)
try:
    with open(sys.argv[2], encoding="utf-8") as response:
        health = json.load(response)
except (OSError, ValueError):
    sys.exit(1)
sys.exit(0 if isinstance(health, dict) and health.get("ok") is True and health.get("database") == "up" else 1)
PY
then
  echo "Healthz inválido. Esperado HTTP 200 com JSON e banco disponível (HTTP ${HEALTH_RESULT%% *})." >&2
  exit 1
fi

echo "[2/4] Validando login e asset estatico versionado"
BASE_URL="$BASE_URL" "$ROOT_DIR/scripts/smoke-frontend-assets.sh"

echo "[3/4] Validando limite de 64 KiB do heartbeat"
TMP_BIG_PAYLOAD="$(mktemp)"
TMP_BIG_RESPONSE="$(mktemp)"
python3 - <<'PY' > "$TMP_BIG_PAYLOAD"
import json
import sys
from datetime import datetime, timezone

heartbeat = {
    "schema_version": "1",
    "heartbeat_id": "qa-origin-payload-limit",
    "sent_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "node_uid": "qa-origin-payload-limit",
    "hostname": "qa-origin.example.invalid",
    "customer_code": "qa",
    "pfsense_version": "2.8.1",
    "uptime_sec": 0,
}
body = json.dumps(heartbeat, separators=(",", ":")).encode("utf-8")
sys.stdout.buffer.write(body + b" " * (64 * 1024 + 1 - len(body)))
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
  echo "Esperado HTTP 413 para heartbeat acima de 64 KiB, recebido: $HTTP_CODE" >&2
  sed -n '1,40p' "$TMP_BIG_RESPONSE" >&2 || true
  exit 1
fi

echo "[4/4] Validando stream SSE autenticado"
BASE_URL="$BASE_URL" DURATION_SECONDS="$SSE_DURATION_SECONDS" \
  AUTH_EMAIL="${AUTH_EMAIL:-}" AUTH_PASSWORD="${AUTH_PASSWORD:-}" \
  "$ROOT_DIR/scripts/verify-sse-stream.sh"

echo
echo "Contrato de origem OK: healthz, login/assets, limite de 64 KiB e SSE validados."
echo "Proximo passo opcional: BASE_URL=\"$BASE_URL\" ./scripts/verify-config-backup-upload-limit.sh"
