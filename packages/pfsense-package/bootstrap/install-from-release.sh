#!/bin/sh

set -eu

RELEASE_URL=""
EXPECTED_SHA256=""
INSTALL_ROOT="${INSTALL_ROOT:-/}"
TMP_DIR=""
INSTALL_ARGS=""

usage() {
  cat <<EOF
Usage:
  $0 --release-url URL [--sha256 HEX] [install options]

Example:
  $0 \
    --release-url https://github.com/org/repo/releases/download/v0.1.0/monitor-pfsense-package-v0.1.0.tar.gz \
    --sha256 abcdef... \
    --controller-url https://pfs-monitor.systemup.inf.br \
    --node-uid node-123 \
    --node-secret secret-123 \
    --customer-code CLIENTE \
    --enable
EOF
}

fetch_file() {
  url="$1"
  output="$2"

  if command -v fetch >/dev/null 2>&1; then
    fetch -o "$output" "$url"
    return
  fi

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  echo "Neither fetch nor curl is available." >&2
  exit 1
}

sha256_file() {
  file="$1"

  if command -v sha256 >/dev/null 2>&1; then
    sha256 -q "$file"
    return
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
    return
  fi

  if command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$file" | awk '{print $NF}'
    return
  fi

  echo "No SHA256 tool available." >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --release-url) RELEASE_URL="$2"; shift 2 ;;
    --sha256) EXPECTED_SHA256="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [ -z "$INSTALL_ARGS" ]; then
        INSTALL_ARGS="$1"
      else
        INSTALL_ARGS="$INSTALL_ARGS
$1"
      fi
      shift 1
      ;;
  esac
done

if [ -z "$RELEASE_URL" ]; then
  echo "Missing required option: --release-url" >&2
  usage
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

ARCHIVE_PATH="$TMP_DIR/pfsense-package.tar.gz"
EXTRACT_DIR="$TMP_DIR/extract"
mkdir -p "$EXTRACT_DIR"

fetch_file "$RELEASE_URL" "$ARCHIVE_PATH"

if [ -n "$EXPECTED_SHA256" ]; then
  ACTUAL_SHA256="$(sha256_file "$ARCHIVE_PATH")"
  if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
    echo "SHA256 mismatch." >&2
    echo "Expected: $EXPECTED_SHA256" >&2
    echo "Actual:   $ACTUAL_SHA256" >&2
    exit 1
  fi
fi

tar -C "$EXTRACT_DIR" -xzf "$ARCHIVE_PATH"

if [ ! -x "$EXTRACT_DIR/pfsense-package/bootstrap/install.sh" ]; then
  chmod +x "$EXTRACT_DIR/pfsense-package/bootstrap/install.sh"
fi

set -- $INSTALL_ARGS
INSTALL_ROOT="$INSTALL_ROOT"
export INSTALL_ROOT

"$EXTRACT_DIR/pfsense-package/bootstrap/install.sh" "$@"
