#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/pfsense-package"
DIST_DIR="$ROOT_DIR/dist/pfsense-package"
MAKEFILE_VERSION="$(grep -E '^PORTVERSION=' "$PACKAGE_DIR/Makefile" | sed 's/^PORTVERSION=[[:space:]]*//' | tr -d '\r')"
VERSION="${1:-$MAKEFILE_VERSION}"
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

ARTIFACT_NAME="monitor-pfsense-package-v${VERSION}.tar.gz"
ARTIFACT_PATH="$DIST_DIR/$ARTIFACT_NAME"
CHECKSUM_PATH="$DIST_DIR/${ARTIFACT_NAME}.sha256"

if [[ -e "$ARTIFACT_PATH" || -e "$CHECKSUM_PATH" ]]; then
  echo "Release $VERSION already exists; use a new version (immutable artifacts)." >&2
  exit 1
fi
mkdir -p "$DIST_DIR"
STAGE_DIR="$(mktemp -d "$DIST_DIR/.pfsense-package.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT
cp -R "$PACKAGE_DIR" "$STAGE_DIR/pfsense-package"
printf 'v%s\n' "$VERSION" > "$STAGE_DIR/pfsense-package/VERSION"

# Guard: XMLs precisam ser bem formados (& sem escape quebra parse_xml_config_pkg
# no pfSense — pkg.php/pkg_edit.php viram "Package / Editor" vazio e
# install_package_xml falha silenciosamente; ver doc 143).
for xml_file in \
  "$STAGE_DIR/pfsense-package/files/usr/local/share/pfSense-pkg-systemup-monitor/info.xml" \
  "$STAGE_DIR/pfsense-package/files/usr/local/pkg/systemup_monitor.xml"; do
  if ! python3 - "$xml_file" "$VERSION" <<'PY'
from pathlib import Path
import sys
import xml.parsers.expat

path = Path(sys.argv[1])
try:
    payload = path.read_bytes().replace(b"%%PKGVERSION%%", sys.argv[2].encode("utf-8"))
    xml.parsers.expat.ParserCreate().Parse(payload, True)
    path.write_bytes(payload)
except Exception as error:
    print(f"XML invalido: {path}: {error}", file=sys.stderr)
    sys.exit(1)
PY
  then
    echo "Erro: XML mal formado impede o build: $xml_file" >&2
    exit 1
  fi
done

# Use portable headers so macOS file metadata cannot break extraction on pfSense.
COPYFILE_DISABLE=1 tar --format ustar -C "$STAGE_DIR" -czf "$STAGE_DIR/$ARTIFACT_NAME" pfsense-package

# Publish only complete files. Hard links reject concurrent builds of the same version.
python3 - "$STAGE_DIR" "$DIST_DIR" "$ARTIFACT_NAME" <<'PYTHON'
import hashlib
import os
from pathlib import Path
import sys

stage_dir, dist_dir = (Path(value) for value in sys.argv[1:3])
name = sys.argv[3]
archive = stage_dir / name
sidecar = stage_dir / f"{name}.sha256"
published = dist_dir / name

digest = hashlib.sha256()
with archive.open("rb") as stream:
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
sidecar.write_text(f"{digest.hexdigest()}  {name}\n", encoding="ascii")

linked_archive = False
try:
    os.link(archive, published)
    linked_archive = True
    os.link(sidecar, dist_dir / sidecar.name)
except OSError as error:
    if linked_archive and published.exists() and published.samefile(archive):
        published.unlink()
    if isinstance(error, FileExistsError):
        sys.exit(f"Release artifact {name} already exists; use a new version.")
    raise
PYTHON

echo "Artifact created: $ARTIFACT_PATH"
echo "Checksum created: $CHECKSUM_PATH"
