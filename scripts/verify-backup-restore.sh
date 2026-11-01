#!/usr/bin/env bash

set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="$ROOT_DIR/backups/postgres"
BACKUP_FILE="${1:-}"
RESTORE_DB="${RESTORE_DB:-monitor_pfsense_restore}"
RESTORE_USER="${RESTORE_USER:-monitor_pfsense}"
CONTAINER_NAME="monitor-pfsense-restore-$$"

usage() {
  cat <<'EOF'
Uso:
  scripts/verify-backup-restore.sh [backup_file]

Exemplos:
  scripts/verify-backup-restore.sh
  scripts/verify-backup-restore.sh backups/postgres/postgres-monitor_pfsense-20260312-201500Z.dump

Sem argumento, usa o backup .dump mais recente em backups/postgres.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE="$(find "$BACKUP_ROOT" -maxdepth 1 -type f -name 'postgres-*.dump' | sort | tail -n 1)"
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Backup .dump nao encontrado." >&2
  exit 1
fi

cleanup() {
  docker rm -fv "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

trap cleanup EXIT

BACKUP_FILE="$(realpath "$BACKUP_FILE")"
[[ -f "${BACKUP_FILE}.sha256" ]] || { echo 'Checksum ausente' >&2; exit 1; }
# O sidecar precisa descrever exatamente o dump selecionado, nao outro arquivo.
EXPECTED_DIGEST="$(awk 'NR == 1 && $1 ~ /^[0-9a-f]+$/ && length($1) == 64 { print $1 }' "${BACKUP_FILE}.sha256")"
SIDECAR_NAME="$(awk 'NR == 1 { $1=""; sub(/^ +/, ""); sub(/^\*/, ""); print }' "${BACKUP_FILE}.sha256")"
[[ "$(wc -l < "${BACKUP_FILE}.sha256")" -eq 1 && -n "$EXPECTED_DIGEST" && "$SIDECAR_NAME" == "$(basename "$BACKUP_FILE")" ]] || { echo 'Checksum nao corresponde ao dump selecionado' >&2; exit 1; }
ACTUAL_DIGEST="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
[[ "$EXPECTED_DIGEST" == "$ACTUAL_DIGEST" ]] || { echo 'Checksum do dump invalido' >&2; exit 1; }

echo "[1/6] Subindo PostgreSQL temporario para restore"
docker run -d \
  --name "$CONTAINER_NAME" \
  --network none \
  --memory 1g --cpus 1 --pids-limit 128 \
  -e "POSTGRES_DB=$RESTORE_DB" \
  -e "POSTGRES_USER=$RESTORE_USER" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:17 >/dev/null

echo "[2/6] Aguardando banco temporario ficar pronto"
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$RESTORE_USER" -d "$RESTORE_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "$CONTAINER_NAME" pg_isready -U "$RESTORE_USER" -d "$RESTORE_DB" >/dev/null

echo "[3/6] Copiando dump para o container temporario"
docker cp "$BACKUP_FILE" "$CONTAINER_NAME:/tmp/restore.dump"

echo "[4/6] Restaurando dump"
docker exec "$CONTAINER_NAME" pg_restore \
  --exit-on-error \
  -U "$RESTORE_USER" \
  -d "$RESTORE_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  /tmp/restore.dump >/dev/null

echo "[5/6] Validando estrutura restaurada"
EXPECTED_TABLES=(clients sites nodes node_credentials heartbeats alerts users user_sessions audit_logs)
for table_name in "${EXPECTED_TABLES[@]}"; do
  TABLE_PRESENT="$(
    docker exec "$CONTAINER_NAME" psql \
      -U "$RESTORE_USER" \
      -d "$RESTORE_DB" \
      -Atqc "SELECT to_regclass('public.${table_name}') IS NOT NULL;"
  )"

  if [[ "$TABLE_PRESENT" != "t" ]]; then
    echo "Tabela esperada ausente apos restore: $table_name" >&2
    exit 1
  fi
done

TABLE_COUNT="$(
  docker exec "$CONTAINER_NAME" psql \
    -U "$RESTORE_USER" \
    -d "$RESTORE_DB" \
    -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
)"

echo "[6/6] Coletando amostra logica do banco restaurado"
COUNTS_JSON="$(
  docker exec "$CONTAINER_NAME" psql \
    -U "$RESTORE_USER" \
    -d "$RESTORE_DB" \
    -Atqc "SELECT json_build_object(
      'clients', (SELECT count(*) FROM clients),
      'sites', (SELECT count(*) FROM sites),
      'nodes', (SELECT count(*) FROM nodes),
      'users', (SELECT count(*) FROM users),
      'alerts', (SELECT count(*) FROM alerts),
      'audit_logs', (SELECT count(*) FROM audit_logs)
    )::text;"
)"

echo
echo "Restore test OK:"
echo "- backup_file: $BACKUP_FILE"
echo "- restored_tables: $TABLE_COUNT"
echo "- sample_counts: $COUNTS_JSON"
