#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/pfsense-agent"
DIST_DIR="$ROOT_DIR/dist/pfsense-agent"
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

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

ARTIFACT_NAME="monitor-pfsense-agent-v${VERSION}.tar.gz"
ARTIFACT_PATH="$DIST_DIR/$ARTIFACT_NAME"
CHECKSUM_PATH="$DIST_DIR/${ARTIFACT_NAME}.sha256"
MANIFEST_PATH="$DIST_DIR/SHA256SUMS"

mkdir -p "$DIST_DIR"
cp -R "$PACKAGE_DIR" "$STAGE_DIR/pfsense-agent"
printf 'v%s\n' "$VERSION" > "$STAGE_DIR/pfsense-agent/VERSION"

tar -C "$STAGE_DIR" -czf "$ARTIFACT_PATH" pfsense-agent

SHA256_VALUE="$(
  sha256sum "$ARTIFACT_PATH" | awk '{print $1}'
)"
printf '%s  %s\n' "$SHA256_VALUE" "$ARTIFACT_NAME" > "$CHECKSUM_PATH"

{
  find "$DIST_DIR" -maxdepth 1 -type f -name 'monitor-pfsense-agent-v*.tar.gz' | sort | while read -r file; do
    checksum="$(sha256sum "$file" | awk '{print $1}')"
    printf '%s  %s\n' "$checksum" "$(basename "$file")"
  done
} > "$MANIFEST_PATH"

echo "Artifact created: $ARTIFACT_PATH"
echo "Checksum created: $CHECKSUM_PATH"
echo "Manifest updated: $MANIFEST_PATH"
