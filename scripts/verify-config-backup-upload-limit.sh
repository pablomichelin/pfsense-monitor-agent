#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
python3 - <<PY > "$TMP_PAYLOAD"
print("A" * int("${PAYLOAD_SIZE_BYTES}"))
PY

echo "[1/2] Validando que ${BACKUP_ROUTE} nao retorna 413 para payload de ${PAYLOAD_SIZE_BYTES} bytes"
HTTP_CODE="$(
  curl -skS \
    -o "$TMP_RESPONSE" \
    -w '%{http_code}' \
    -H 'content-type: application/xml' \
    -X POST \
    "${BASE_URL}${BACKUP_ROUTE}" \
    --data-binary @"$TMP_PAYLOAD" || true
)"

if [[ "$HTTP_CODE" == "413" ]]; then
  echo "Rota de backup ainda bloqueia payload acima de 64 KB (HTTP 413)." >&2
  echo "Verifique client_max_body_size em infra/nginx/default.conf e infra/ispconfig/nginx.monitor-pfsense.conf." >&2
  exit 1
fi

echo "[2/2] Resposta recebida: HTTP ${HTTP_CODE} (esperado diferente de 413; 401/404 sao aceitaveis antes da Fase C)"
echo "Limite de upload da rota de backup OK."
