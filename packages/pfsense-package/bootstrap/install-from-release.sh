#!/bin/sh

set -eu

RELEASE_URL=""
EXPECTED_SHA256=""
SECRET_FILE=""
LEGACY_NODE_SECRET=""
NODE_SECRET=""
INSTALL_ROOT="${INSTALL_ROOT:-/}"
TMP_DIR=""
INSTALL_ARGS=""

usage() {
  cat <<EOF
Usage:
  $0 --release-url URL --sha256 HEX [--secret-file PATH] [install options]

Secret (prioridade): env MONITOR_UPDATE_NODE_SECRET > --secret-file > --node-secret (legado, aviso stderr).

Example:
  $0 \\
    --release-url https://github.com/org/repo/releases/download/v0.1.0/monitor-pfsense-package-v0.1.0.tar.gz \\
    --sha256 abcdef... \\
    --secret-file /var/db/monitor-pfsense-agent/.update-node-secret \\
    --controller-url https://pfs-monitor.systemup.inf.br \\
    --node-uid node-123 \\
    --customer-code CLIENTE \\
    --heartbeat-mode normal \\
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

shell_quote() {
  # Escapa um argumento para reuso seguro com eval (preserva espacos/caracteres).
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

read_node_secret() {
  if [ -n "${MONITOR_UPDATE_NODE_SECRET:-}" ]; then
    NODE_SECRET="$MONITOR_UPDATE_NODE_SECRET"
    return 0
  fi

  if [ -n "$SECRET_FILE" ] && [ -r "$SECRET_FILE" ]; then
    NODE_SECRET="$(cat "$SECRET_FILE")"
    return 0
  fi

  if [ -n "$LEGACY_NODE_SECRET" ]; then
    NODE_SECRET="$LEGACY_NODE_SECRET"
    return 0
  fi

  return 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --release-url) RELEASE_URL="$2"; shift 2 ;;
    --sha256) EXPECTED_SHA256="$2"; shift 2 ;;
    --secret-file) SECRET_FILE="$2"; shift 2 ;;
    --node-secret)
      if [ -z "${2:-}" ]; then
        echo "Missing value for --node-secret." >&2
        exit 1
      fi
      LEGACY_NODE_SECRET="$2"
      echo "Warning: --node-secret on command line is deprecated; use MONITOR_UPDATE_NODE_SECRET or --secret-file." >&2
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      # B3: acumula argumentos ja escapados para preservar valores com espacos.
      INSTALL_ARGS="$INSTALL_ARGS $(shell_quote "$1")"
      shift 1
      ;;
  esac
done

if [ -z "$RELEASE_URL" ]; then
  echo "Missing required option: --release-url" >&2
  usage
  exit 1
fi

if [ -z "$EXPECTED_SHA256" ]; then
  echo "Missing required option: --sha256 (pin obrigatorio)." >&2
  exit 1
fi

if ! read_node_secret; then
  echo "Node secret required via MONITOR_UPDATE_NODE_SECRET or --secret-file." >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

ARCHIVE_PATH="$TMP_DIR/pfsense-package.tar.gz"
EXTRACT_DIR="$TMP_DIR/extract"
mkdir -p "$EXTRACT_DIR"

fetch_file "$RELEASE_URL" "$ARCHIVE_PATH"

ACTUAL_SHA256="$(sha256_file "$ARCHIVE_PATH")"
if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "SHA256 mismatch." >&2
  echo "Expected: $EXPECTED_SHA256" >&2
  echo "Actual:   $ACTUAL_SHA256" >&2
  exit 1
fi

tar -C "$EXTRACT_DIR" -xzf "$ARCHIVE_PATH"

if [ ! -x "$EXTRACT_DIR/pfsense-package/bootstrap/install.sh" ]; then
  chmod +x "$EXTRACT_DIR/pfsense-package/bootstrap/install.sh"
fi

# B3: reidrata os argumentos preservando limites (sem word-splitting cego).
eval "set -- $INSTALL_ARGS"
export INSTALL_ROOT
export MONITOR_UPDATE_NODE_SECRET="$NODE_SECRET"

"$EXTRACT_DIR/pfsense-package/bootstrap/install.sh" \
  --node-secret "$NODE_SECRET" \
  "$@"
