#!/usr/bin/env bash
# Diagnostico de gateways no pfSense (requer package instalado e gwlib).
set -euo pipefail

HELPER="/usr/local/libexec/monitor-pfsense-agent/collect_gateways.php"
AGENT="/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh"

if [ ! -f "$HELPER" ]; then
  echo "collect_gateways.php nao encontrado. Instale o package SystemUp Monitor." >&2
  exit 1
fi

echo "=== collect_gateways.php (JSON) ==="
php -f "$HELPER" | python3 -m json.tool 2>/dev/null || php -f "$HELPER"

if [ -x "$AGENT" ]; then
  echo ""
  echo "=== build_gateways_json via agente ==="
  # shellcheck disable=SC1091
  . /usr/local/etc/monitor-pfsense-agent.conf 2>/dev/null || true
  SCRIPT_DIR="$(dirname "$AGENT")" sh -c '. "$1"; build_gateways_json' _ "$AGENT"
  echo ""
fi

echo "Diagnostico concluido."
