#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${1:-$ROOT_DIR/backups/postgres}"
TIMESTAMP="${TIMESTAMP:-$(date -u +%Y%m%d-%H%M%SZ)}"
KEEP_LATEST="${KEEP_LATEST:-7}"

read_env_value() {
  local key="$1"
  local env_file="${2:-$ROOT_DIR/.env.db}"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "$env_file"
}

usage() {
  cat <<'EOF'
Uso:
  scripts/backup-postgres.sh [backup_dir]

Exemplos:
  scripts/backup-postgres.sh
  KEEP_LATEST=14 scripts/backup-postgres.sh /opt/Monitor-Pfsense/backups/postgres

Variaveis suportadas:
  KEEP_LATEST  quantidade maxima de dumps .dump mantidos no diretorio. Padrao: 7
  TIMESTAMP    sobrescreve o timestamp do arquivo de saida
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

POSTGRES_DB="${POSTGRES_DB:-$(read_env_value POSTGRES_DB 2>/dev/null || true)}"
POSTGRES_USER="${POSTGRES_USER:-$(read_env_value POSTGRES_USER 2>/dev/null || true)}"

if [[ -z "$POSTGRES_DB" || -z "$POSTGRES_USER" ]]; then
  echo "POSTGRES_DB/POSTGRES_USER ausentes em .env.db" >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT"

BACKUP_FILE="$BACKUP_ROOT/postgres-${POSTGRES_DB}-${TIMESTAMP}.dump"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

echo "[1/4] Validando container db do Compose"
docker compose ps db >/dev/null
docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null

echo "[2/4] Gerando dump custom em $BACKUP_FILE"
docker compose exec -T db pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  > "$BACKUP_FILE"

if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "Backup vazio ou inexistente: $BACKUP_FILE" >&2
  exit 1
fi

echo "[3/4] Gerando checksum"
sha256sum "$BACKUP_FILE" | sed "s#$BACKUP_FILE#$(basename "$BACKUP_FILE")#" > "$CHECKSUM_FILE"

echo "[4/4] Aplicando retencao local"
mapfile -t OLD_BACKUPS < <(find "$BACKUP_ROOT" -maxdepth 1 -type f -name 'postgres-*.dump' | sort)
if (( ${#OLD_BACKUPS[@]} > KEEP_LATEST )); then
  DELETE_COUNT=$((${#OLD_BACKUPS[@]} - KEEP_LATEST))
  for old_backup in "${OLD_BACKUPS[@]:0:$DELETE_COUNT}"; do
    rm -f "$old_backup" "${old_backup}.sha256"
  done
fi

echo
echo "Backup PostgreSQL OK:"
echo "- file: $BACKUP_FILE"
echo "- sha256: $CHECKSUM_FILE"
echo "- size_bytes: $(stat -c '%s' "$BACKUP_FILE")"
