#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-https://pfs-monitor.systemup.inf.br}"
BACKUP_ROUTE="${BACKUP_ROUTE:-/api/v1/ingest/config-backup}"
# 100 KB: acima do limite de heartbeat (64 KB), abaixo do limite de backup (5 MB)
PAYLOAD_SIZE_BYTES="${PAYLOAD_SIZE_BYTES:-102400}"

cleanup() {
  rm -f "${TMP_PAYLOAD:-}" "${TMP_RESPONSE:-}"
}

trap cleanup EXIT

TMP_PAYLOAD="$(mktemp)"
TMP_RESPONSE="$(mktemp)"
python3 - "$PAYLOAD_SIZE_BYTES" <<'PY' > "$TMP_PAYLOAD"
import sys

size = int(sys.argv[1])
if size <= 0:
    sys.exit("PAYLOAD_SIZE_BYTES deve ser positivo.")
sys.stdout.buffer.write(b"A" * size)
PY

echo "[1/2] Enviando payload de ${PAYLOAD_SIZE_BYTES} bytes para ${BACKUP_ROUTE}"
if ! HTTP_RESPONSE="$(
  curl -skS --connect-timeout 5 --max-time 30 \
    -o "$TMP_RESPONSE" \
    -w '%{http_code} %{content_type}' \
    -H 'content-type: application/xml' \
    -X POST \
    "${BASE_URL}${BACKUP_ROUTE}" \
    --data-binary @"$TMP_PAYLOAD"
)"; then
  echo "Falha de transporte na rota de backup." >&2
  exit 1
fi

HTTP_CODE="${HTTP_RESPONSE%% *}"
if [[ "$HTTP_CODE" == "413" ]]; then
  echo "A rota de backup rejeitou o tamanho da amostra (HTTP 413)." >&2
  echo "Verifique client_max_body_size em infra/nginx/default.conf e infra/ispconfig/nginx.monitor-pfsense.conf." >&2
  exit 1
fi

if ! python3 - "$HTTP_RESPONSE" "$TMP_RESPONSE" <<'PY'
import json
import sys

status, _, content_type = sys.argv[1].partition(" ")
if status != "400" or content_type.partition(";")[0].strip().lower() != "application/json":
    sys.exit(1)
try:
    with open(sys.argv[2], encoding="utf-8") as response:
        body = json.load(response)
except (OSError, ValueError):
    sys.exit(1)
sys.exit(0 if isinstance(body, dict) and body.get("statusCode") == 400
         and body.get("message") == "X-Node-Uid header is required" else 1)
PY
then
  echo "Recebido HTTP ${HTTP_CODE}. Esperada a rejeição da API por falta do cabeçalho X-Node-Uid." >&2
  exit 1
fi

echo "[2/2] A API recebeu o corpo e rejeitou a amostra sem autenticação (HTTP 400)."
echo "Limite de upload da rota de backup OK."
