#!/usr/bin/env bash
#
# Aplicar no host ISPConfig (192.168.100.253) o location de backup com limite 5m.
# Uso no ISPConfig:
#   scp scripts/ispconfig-apply-monitor-backup-limit.sh root@192.168.100.253:/tmp/
#   ssh root@192.168.100.253 'bash /tmp/ispconfig-apply-monitor-backup-limit.sh'
#
set -euo pipefail

DOMAIN="${DOMAIN:-pfs-monitor.systemup.inf.br}"
BACKUP_LOCATION='location = /api/v1/ingest/config-backup'
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      echo "Uso: $0 [--dry-run]"
      exit 0
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute como root no host ISPConfig." >&2
  exit 1
fi

SEARCH_DIRS=(
  /etc/nginx
  /usr/local/ispconfig/server/nginx/conf
  /var/www/conf/nginx
)

find_vhost() {
  local dir="$1"
  [[ -d "$dir" ]] || return 1
  grep -RIl "server_name[[:space:]].*${DOMAIN}" "$dir" 2>/dev/null | head -1
}

VHOST_FILE=""
for dir in "${SEARCH_DIRS[@]}"; do
  candidate="$(find_vhost "$dir" || true)"
  if [[ -n "$candidate" ]]; then
    VHOST_FILE="$candidate"
    break
  fi
done

if [[ -z "$VHOST_FILE" ]]; then
  echo "Nao encontrei vhost nginx para ${DOMAIN}." >&2
  echo "Se o site usa Apache como proxy, adicione manualmente:" >&2
  echo '  <Location "/api/v1/ingest/config-backup">' >&2
  echo '    LimitRequestBody 5242880' >&2
  echo '  </Location>' >&2
  exit 1
fi

echo "Vhost encontrado: $VHOST_FILE"

if grep -q "$BACKUP_LOCATION" "$VHOST_FILE"; then
  echo "Location de backup ja presente. Nada a fazer."
  exit 0
fi

SNIPPET_FILE="$(mktemp)"
cat > "$SNIPPET_FILE" <<'EOF'

  # Limite maior somente na rota de backup de config.xml (Monitor-Pfsense)
  location = /api/v1/ingest/config-backup {
    client_max_body_size 5m;
    proxy_pass $monitor_origin;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
  }
EOF

if [[ "$DRY_RUN" == true ]]; then
  echo "[dry-run] Inseriria o bloco abaixo antes do location / em $VHOST_FILE:"
  cat "$SNIPPET_FILE"
  rm -f "$SNIPPET_FILE"
  exit 0
fi

BACKUP_VHOST="${VHOST_FILE}.bak.$(date +%Y%m%d%H%M%S)"
cp -a "$VHOST_FILE" "$BACKUP_VHOST"
echo "Backup: $BACKUP_VHOST"

python3 - <<PY
from pathlib import Path

vhost = Path("${VHOST_FILE}")
snippet = Path("${SNIPPET_FILE}").read_text()
text = vhost.read_text()

if "${BACKUP_LOCATION}" in text:
    raise SystemExit(0)

marker = "  location / {"
if marker not in text:
    raise SystemExit("Nao achei '  location / {' no vhost; aplique o snippet manualmente.")

text = text.replace(marker, snippet + "\n" + marker, 1)
vhost.write_text(text)
PY

rm -f "$SNIPPET_FILE"

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || service nginx reload
  echo "nginx recarregado."
else
  echo "nginx nao encontrado no PATH; valide e recarregue o servico manualmente." >&2
fi

echo "Snippet aplicado. Valide de 192.168.100.221:"
echo '  BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-config-backup-upload-limit.sh'
