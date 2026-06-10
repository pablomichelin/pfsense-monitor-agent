#!/usr/bin/env bash

set -euo pipefail

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://pfs-monitor.systemup.inf.br}"
ORIGIN_BASE_URL="${ORIGIN_BASE_URL:-http://192.168.100.221:3031}"
BACKUP_ROUTE="${BACKUP_ROUTE:-/api/v1/ingest/config-backup}"
PAYLOAD_SIZE_BYTES="${PAYLOAD_SIZE_BYTES:-102400}"

cleanup() {
  rm -f "${TMP_PAYLOAD:-}"
}

trap cleanup EXIT

TMP_PAYLOAD="$(mktemp)"
python3 - <<PY > "$TMP_PAYLOAD"
print("A" * int("${PAYLOAD_SIZE_BYTES}"))
PY

probe_upload() {
  local base_url="$1"
  curl -skS \
    -o /dev/null \
    -w '%{http_code}' \
    -H 'content-type: application/xml' \
    -X POST \
    "${base_url%/}${BACKUP_ROUTE}" \
    --data-binary @"$TMP_PAYLOAD" || true
}

describe_code() {
  local code="$1"
  case "$code" in
    413) echo "BLOQUEADO (limite do proxy)" ;;
    400|401|403|404|422) echo "ACEITA pelo proxy (rejeicao da API sem auth e esperada)" ;;
    502|503|504) echo "ERRO de origem/upstream" ;;
    *) echo "HTTP ${code}" ;;
  esac
}

echo "Diagnostico de limite na rota de backup (${PAYLOAD_SIZE_BYTES} bytes)"
echo "Rota: ${BACKUP_ROUTE}"
echo

public_code="$(probe_upload "$PUBLIC_BASE_URL")"
origin_code="$(probe_upload "$ORIGIN_BASE_URL")"

printf '  %-24s HTTP %-3s -> %s\n' "publico" "$public_code" "$(describe_code "$public_code")"
printf '  %-24s HTTP %-3s -> %s\n' "origem_direta" "$origin_code" "$(describe_code "$origin_code")"
echo

if [[ "$public_code" == "413" && "$origin_code" != "413" ]]; then
  echo "Conclusao: o bloqueio esta no proxy externo (ISPConfig/Cloudflare), nao no compose."
  echo "Acao: aplicar o snippet em infra/ispconfig/nginx.monitor-pfsense.conf no host 192.168.100.253."
  echo "Script auxiliar: scripts/ispconfig-apply-monitor-backup-limit.sh (executar no ISPConfig)."
  exit 1
fi

if [[ "$public_code" != "413" ]]; then
  echo "Conclusao: rota publica aceita payload de backup acima de 64 KB."
  exit 0
fi

echo "Conclusao: ambos os caminhos retornam 413; revisar nginx interno e ISPConfig."
exit 1
