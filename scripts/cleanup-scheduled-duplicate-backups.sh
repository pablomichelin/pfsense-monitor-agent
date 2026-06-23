#!/usr/bin/env bash
# Remove duplicatas agendadas do historico (nao apaga backups stored).
# Uso: ./scripts/cleanup-scheduled-duplicate-backups.sh [--apply] [--hostname FW.example]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APPLY=0
HOST_FILTER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --hostname) HOST_FILTER="$2"; shift 2 ;;
    *) echo "Opcao desconhecida: $1" >&2; exit 1 ;;
  esac
done

WHERE="b.status = 'duplicate' AND b.source = 'scheduled'"
if [[ -n "$HOST_FILTER" ]]; then
  WHERE="$WHERE AND n.hostname = '$HOST_FILTER'"
fi

echo "=== Duplicatas agendadas a remover ==="
docker compose exec -T db psql -U monitor_pfsense -d monitor_pfsense -c "
SELECT n.hostname, c.name, COUNT(*) AS dup_count
FROM node_config_backups b
JOIN nodes n ON n.id = b.node_id
JOIN sites s ON s.id = n.site_id
JOIN clients c ON c.id = s.client_id
WHERE $WHERE
GROUP BY n.hostname, c.name
ORDER BY dup_count DESC;
"

if [[ "$APPLY" -ne 1 ]]; then
  echo ""
  echo "Dry-run. Use --apply para executar DELETE."
  exit 0
fi

docker compose exec -T db psql -U monitor_pfsense -d monitor_pfsense -c "
DELETE FROM node_config_backups b
USING nodes n
WHERE b.node_id = n.id
  AND $WHERE;
"

echo "Limpeza concluida."
