#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DB_FILE="$ROOT_DIR/.env.db"

if [[ -f "$ENV_DB_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_DB_FILE"
fi

POSTGRES_USER="${POSTGRES_USER:-monitor_pfsense}"
POSTGRES_DB="${POSTGRES_DB:-monitor_pfsense}"

MODE=""
OLDER_THAN_HOURS=""
DRY_RUN=0
VACUUM_AFTER=0

usage() {
  cat <<'EOF'
Uso:
  ./scripts/purge-heartbeats.sh --all [--dry-run] [--vacuum]
  ./scripts/purge-heartbeats.sh --older-than-hours N [--dry-run] [--vacuum]

Opcoes:
  --all                  Remove todos os registros de heartbeats.
  --older-than-hours N   Remove registros com received_at anterior a N horas.
  --dry-run              Mostra quantos registros seriam removidos, sem deletar.
  --vacuum               Executa VACUUM ANALYZE em heartbeats ao final.
EOF
}

run_psql() {
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      MODE="all"
      shift
      ;;
    --older-than-hours)
      MODE="older_than_hours"
      OLDER_THAN_HOURS="${2:-}"
      if [[ -z "$OLDER_THAN_HOURS" ]]; then
        echo "Erro: informe o numero de horas em --older-than-hours N" >&2
        exit 1
      fi
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --vacuum)
      VACUUM_AFTER=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Erro: opcao desconhecida: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$MODE" ]]; then
  usage
  exit 1
fi

if [[ "$MODE" == "all" ]]; then
  COUNT_SQL="SELECT count(*) AS registros FROM heartbeats;"
  DELETE_SQL="DELETE FROM heartbeats;"
  DESCRIPTION="todos os registros"
else
  if ! [[ "$OLDER_THAN_HOURS" =~ ^[0-9]+$ ]]; then
    echo "Erro: --older-than-hours precisa ser um inteiro >= 0" >&2
    exit 1
  fi
  COUNT_SQL="SELECT count(*) AS registros FROM heartbeats WHERE received_at < now() - interval '${OLDER_THAN_HOURS} hours';"
  DELETE_SQL="DELETE FROM heartbeats WHERE received_at < now() - interval '${OLDER_THAN_HOURS} hours';"
  DESCRIPTION="registros anteriores a ${OLDER_THAN_HOURS} hora(s)"
fi

echo "[1/3] Conferindo $DESCRIPTION"
run_psql -c "$COUNT_SQL"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry-run ativo: nenhuma linha foi removida."
  exit 0
fi

echo "[2/3] Removendo $DESCRIPTION"
run_psql -c "$DELETE_SQL"

if [[ "$VACUUM_AFTER" -eq 1 ]]; then
  echo "[3/3] Executando VACUUM ANALYZE em heartbeats"
  run_psql -c "VACUUM ANALYZE heartbeats;"
else
  echo "[3/3] Limpeza concluida (sem VACUUM)."
fi
