#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/pfsense-package"
DIST_DIR="$ROOT_DIR/dist/pfsense-package"
VERSION="${1:-}"

read_env_value() {
  local key="$1"
  local env_file="${2:-$ROOT_DIR/.env.api}"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  awk -F= -v target="$key" '$1 == target { sub(/^[^=]*=/, ""); print; exit }' "$env_file"
}

if [[ -z "$VERSION" ]]; then
  VERSION="$(read_env_value SYSTEM_VERSION 2>/dev/null || true)"
fi

if [[ -z "$VERSION" ]]; then
  VERSION="0.1.0"
fi

MAKEFILE_VERSION="$(grep -E '^PORTVERSION=' "$PACKAGE_DIR/Makefile" | sed 's/^PORTVERSION=[[:space:]]*//' | tr -d '\r')"
INC_FILE="$PACKAGE_DIR/files/usr/local/pkg/systemup_monitor.inc"
INC_AGENT_VERSION="$(grep 'define("SYSTEMUP_MONITOR_AGENT_VERSION"' "$INC_FILE" | sed 's/.*"\([^"]*\)".*/\1/')"
if [[ "$INC_AGENT_VERSION" != "$MAKEFILE_VERSION" ]]; then
  echo "Erro: SYSTEMUP_MONITOR_AGENT_VERSION ($INC_AGENT_VERSION) != PORTVERSION ($MAKEFILE_VERSION) em $INC_FILE" >&2
  exit 1
fi
if [[ "$VERSION" != "$MAKEFILE_VERSION" ]]; then
  echo "Erro: versão solicitada ($VERSION) != PORTVERSION ($MAKEFILE_VERSION) no Makefile" >&2
  exit 1
fi

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

ARTIFACT_NAME="monitor-pfsense-package-v${VERSION}.tar.gz"
ARTIFACT_PATH="$DIST_DIR/$ARTIFACT_NAME"
CHECKSUM_PATH="$DIST_DIR/${ARTIFACT_NAME}.sha256"

mkdir -p "$DIST_DIR"
cp -R "$PACKAGE_DIR" "$STAGE_DIR/pfsense-package"
printf 'v%s\n' "$VERSION" > "$STAGE_DIR/pfsense-package/VERSION"
sed -i "s/%%PKGVERSION%%/${VERSION}/g" \
  "$STAGE_DIR/pfsense-package/files/usr/local/share/pfSense-pkg-systemup-monitor/info.xml" \
  "$STAGE_DIR/pfsense-package/files/usr/local/pkg/systemup_monitor.xml"

# Guard: XMLs precisam ser bem formados (& sem escape quebra parse_xml_config_pkg
# no pfSense — pkg.php/pkg_edit.php viram "Package / Editor" vazio e
# install_package_xml falha silenciosamente; ver doc 143).
for xml_file in \
  "$STAGE_DIR/pfsense-package/files/usr/local/share/pfSense-pkg-systemup-monitor/info.xml" \
  "$STAGE_DIR/pfsense-package/files/usr/local/pkg/systemup_monitor.xml"; do
  if ! python3 -c "
import sys
import xml.parsers.expat
parser = xml.parsers.expat.ParserCreate()
try:
    with open(sys.argv[1], 'rb') as handle:
        parser.ParseFile(handle)
except Exception as error:
    print(f'XML invalido: {sys.argv[1]}: {error}', file=sys.stderr)
    sys.exit(1)
" "$xml_file"; then
    echo "Erro: XML mal formado impede o build: $xml_file" >&2
    exit 1
  fi
done

tar -C "$STAGE_DIR" -czf "$ARTIFACT_PATH" pfsense-package

SHA256_VALUE="$(
  sha256sum "$ARTIFACT_PATH" | awk '{print $1}'
)"
printf '%s  %s\n' "$SHA256_VALUE" "$ARTIFACT_NAME" > "$CHECKSUM_PATH"

echo "Artifact created: $ARTIFACT_PATH"
echo "Checksum created: $CHECKSUM_PATH"
