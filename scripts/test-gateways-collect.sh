#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATEWAYS_PHP="$ROOT_DIR/packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/collect_gateways.php"

php -l "$GATEWAYS_PHP" >/dev/null

out="$(PFSENSE_CONFIG_XML=/dev/null php -f "$GATEWAYS_PHP" 2>/dev/null || true)"
[ "$out" = "[]" ]

php "$ROOT_DIR/scripts/test-gateways-map.php"

echo "test-gateways-collect OK"
