#!/usr/bin/env bash
#
# Reduz espaço do MySQL (binlogs) sem quebrar o Zabbix.
# Executar no servidor onde o MySQL está (ex.: servidor Zabbix).
# Uso: sudo ./reduce-mysql-space.sh [opções]
#
set -e

MYSQL="${MYSQL_CMD:-mysql}"
RETENTION_DAYS=3
DRY_RUN=false
DO_SET_RETENTION=false
DO_PURGE=false
PURGE_DAYS=3

usage() {
  cat <<EOF
Uso: $0 [opções]

Opções:
  --check              Apenas mostra configuração e lista de binlogs (padrão se nada for passado)
  --set-retention [N]  Define expiração de binlogs para N dias (padrão: 3)
  --purge [N]          Remove binlogs com mais de N dias (padrão: 3). Cuidado: só use se não tiver replicação/PITR.
  --dry-run            Com --purge: só mostra o que seria removido, não executa
  -h, --help           Esta ajuda

Exemplos:
  $0 --check
  $0 --set-retention 3
  $0 --purge 3 --dry-run
  $0 --purge 3

Recomendação: primeiro --check, depois --set-retention 3, depois --purge 3 (ou --purge 3 --dry-run para conferir).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      DO_SET_RETENTION=false
      DO_PURGE=false
      shift
      ;;
    --set-retention)
      DO_SET_RETENTION=true
      RETENTION_DAYS="${2:-3}"
      shift
      shift
      ;;
    --purge)
      DO_PURGE=true
      PURGE_DAYS="${2:-3}"
      shift
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Se nenhuma ação explícita, fazer --check
if ! $DO_SET_RETENTION && ! $DO_PURGE; then
  DO_SET_RETENTION=false
  DO_PURGE=false
fi

run_mysql() {
  $MYSQL -N -e "$1"
}

run_mysql_verbose() {
  $MYSQL -e "$1"
}

echo "=== Diagnóstico MySQL (binlogs) ==="
echo ""

# Variáveis de expiração
echo "--- Retenção atual ---"
run_mysql_verbose "SHOW VARIABLES LIKE 'expire_logs_days';" 2>/dev/null || true
run_mysql_verbose "SHOW VARIABLES LIKE 'binlog_expire_logs_seconds';" 2>/dev/null || true
echo ""

# Replicação (apenas aviso)
echo "--- Replicação (se aparecer vazio, não é réplica) ---"
run_mysql_verbose "SHOW SLAVE STATUS\G" 2>/dev/null || echo "(comando não aplicável ou sem replicação)"
echo ""

# Lista de binlogs
echo "--- Binlogs existentes ---"
run_mysql_verbose "SHOW BINARY LOGS;" 2>/dev/null || echo "(binlog pode estar desativado)"
echo ""

if $DO_SET_RETENTION; then
  SECS=$((RETENTION_DAYS * 86400))
  echo "=== Definir retenção para $RETENTION_DAYS dias ($SECS segundos) ==="
  run_mysql "SET GLOBAL binlog_expire_logs_seconds = $SECS;"
  echo "Feito. Para tornar permanente, adicione no my.cnf:"
  echo "  [mysqld]"
  echo "  binlog_expire_logs_seconds = $SECS"
  echo ""
fi

if $DO_PURGE; then
  echo "=== Purgar binlogs com mais de $PURGE_DAYS dias ==="
  if $DRY_RUN; then
    echo "(dry-run: nada será removido)"
    run_mysql_verbose "SHOW BINARY LOGS;"
    echo "Seria executado: PURGE BINARY LOGS BEFORE DATE(NOW() - INTERVAL $PURGE_DAYS DAY);"
  else
    run_mysql "PURGE BINARY LOGS BEFORE DATE(NOW() - INTERVAL $PURGE_DAYS DAY);"
    echo "Purgado. Espaço será liberado quando o MySQL liberar os arquivos."
  fi
  echo ""
fi

echo "=== Fim ==="
