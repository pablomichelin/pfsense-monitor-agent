#!/usr/bin/env bash
# Simula upgrade bootstrap: arquivos 0.3.5 no destino, tarball 0.3.10, verifica .inc atualizado.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="$(grep -E '^PORTVERSION=' "$ROOT_DIR/packages/pfsense-package/Makefile" | sed 's/^PORTVERSION=[[:space:]]*//')"
STAGE="$(mktemp -d)"
FROOT="$STAGE/fake-root"
EXTRACT="$STAGE/extract"

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

mkdir -p "$FROOT/usr/local/pkg"
git show 3abf515:packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc >"$FROOT/usr/local/pkg/systemup_monitor.inc"

"$ROOT_DIR/scripts/build-pfsense-package-artifact.sh" "$VERSION" >/dev/null
tar -xzf "$ROOT_DIR/dist/pfsense-package/monitor-pfsense-package-v${VERSION}.tar.gz" -C "$STAGE"
mkdir -p "$EXTRACT"
mv "$STAGE/pfsense-package" "$EXTRACT/"

before="$(grep 'define("SYSTEMUP_MONITOR_AGENT_VERSION"' "$FROOT/usr/local/pkg/systemup_monitor.inc" | sed 's/.*"\([^"]*\)".*/\1/')"
[[ "$before" == "0.3.5" ]] || { echo "FAIL: expected fake root at 0.3.5, got $before"; exit 1; }

INSTALL_ROOT="$FROOT" "$EXTRACT/pfsense-package/bootstrap/install.sh" >/dev/null

after="$(grep 'define("SYSTEMUP_MONITOR_AGENT_VERSION"' "$FROOT/usr/local/pkg/systemup_monitor.inc" | sed 's/.*"\([^"]*\)".*/\1/')"
[[ "$after" == "$VERSION" ]] || { echo "FAIL: expected $VERSION after install, got $after"; exit 1; }

helper="$FROOT/usr/local/libexec/monitor-pfsense-agent/set_pfsense_update_branch.php"
[[ -f "$helper" ]] || { echo "FAIL: set_pfsense_update_branch.php missing after install"; exit 1; }
[[ -x "$helper" ]] || { echo "FAIL: set_pfsense_update_branch.php not executable after install"; exit 1; }

echo "OK: install.sh upgraded systemup_monitor.inc $before -> $after"
