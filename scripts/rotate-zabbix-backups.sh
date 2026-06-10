#!/usr/bin/env bash
#
# Rotaciona backups do Zabbix em /var/backups/zabbix para liberar espaço.
# Não afeta o Zabbix em execução (são apenas cópias).
#
# Uso: sudo ./rotate-zabbix-backups.sh [opções]
#
set -e

BACKUP_DIR="${ZABBIX_BACKUP_DIR:-/var/backups/zabbix}"
KEEP_DAYS="${KEEP_DAYS:-3}"   # manter backups dos últimos N dias
KEEP_COUNT=                   # alternativa: manter só os N arquivos mais recentes (ex.: 2)
DRY_RUN=false

usage() {
  cat <<EOF
Uso: $0 [opções]

Opções:
  --dir DIR            Diretório dos backups (padrão: /var/backups/zabbix)
  --keep-days N        Manter apenas arquivos dos últimos N dias (padrão: 3)
  --keep-count N       Em vez de dias: manter só os N arquivos mais recentes
  --dry-run            Só mostrar o que seria removido
  -h, --help           Esta ajuda

Exemplos:
  $0 --dry-run
  $0 --keep-days 3
  $0 --keep-count 2
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      BACKUP_DIR="$2"
      shift
      shift
      ;;
    --keep-days)
      KEEP_DAYS="$2"
      KEEP_COUNT=""
      shift
      shift
      ;;
    --keep-count)
      KEEP_COUNT="$2"
      KEEP_DAYS=""
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

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Diretório não encontrado: $BACKUP_DIR" >&2
  exit 1
fi

echo "=== Rotação de backups Zabbix ==="
echo "Diretório: $BACKUP_DIR"
echo ""

if [[ -n "$KEEP_COUNT" ]]; then
  echo "Política: manter os $KEEP_COUNT arquivos mais recentes"
  total=$(find "$BACKUP_DIR" -maxdepth 1 -type f | wc -l)
  to_remove=$((total - KEEP_COUNT))
  if [[ $to_remove -le 0 ]]; then
    echo "Nada a remover (há $total arquivos, mantendo $KEEP_COUNT)."
    exit 0
  fi
  echo "Arquivos atuais: $total. Serão removidos os $to_remove mais antigos."
  echo ""
  if $DRY_RUN; then
    echo "--- Seriam removidos (dry-run) ---"
    ls -lt "$BACKUP_DIR" | tail -n +$((KEEP_COUNT + 1)) || true
    exit 0
  fi
  cd "$BACKUP_DIR"
  ls -t | tail -n +$((KEEP_COUNT + 1)) | xargs -r rm -v -f
  echo "Feito."
else
  echo "Política: remover arquivos com mais de $KEEP_DAYS dias"
  if $DRY_RUN; then
    echo "--- Seriam removidos (dry-run) ---"
    find "$BACKUP_DIR" -maxdepth 1 -type f -mtime +$KEEP_DAYS -ls
    exit 0
  fi
  count=$(find "$BACKUP_DIR" -maxdepth 1 -type f -mtime +$KEEP_DAYS -printf '.' | wc -c)
  if [[ $count -eq 0 ]]; then
    echo "Nenhum arquivo com mais de $KEEP_DAYS dias."
    exit 0
  fi
  find "$BACKUP_DIR" -maxdepth 1 -type f -mtime +$KEEP_DAYS -delete -print
  echo "Removidos $count arquivo(s)."
fi

echo ""
echo "=== Fim ==="
