#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"

if [[ $# -lt 2 ]]; then
  echo "Uso: $0 <node_uid> <node_secret>" >&2
  echo "Exemplo: $0 lab-fw-001 abc123..." >&2
  exit 1
fi

NODE_UID="$1"
NODE_SECRET="$2"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

SIGNATURE="$(node -e '
const crypto = require("crypto");
const timestamp = process.argv[1];
const secret = process.argv[2];
const payload = Buffer.concat([Buffer.from(timestamp), Buffer.from("\n")]);
process.stdout.write(crypto.createHmac("sha256", secret).update(payload).digest("hex"));
' "$TIMESTAMP" "$NODE_SECRET")"

curl -skS \
  -X POST \
  -H "x-node-uid: $NODE_UID" \
  -H "x-timestamp: $TIMESTAMP" \
  -H "x-signature: sha256=$SIGNATURE" \
  "$BASE_URL/api/v1/ingest/test-connection"
