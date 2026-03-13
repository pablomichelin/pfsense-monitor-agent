#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"

LOGIN_HTML="$(curl -skS "$BASE_URL/login")"

echo "[1/3] Validando HTML do login"
grep -q '<title>Monitor-Pfsense</title>' <<<"$LOGIN_HTML"
grep -q 'glass-panel' <<<"$LOGIN_HTML"

echo "[2/3] Extraindo asset CSS versionado do Next"
CSS_PATH="$(grep -o '/_next/static/css/[^"]*\.css' <<<"$LOGIN_HTML" | head -n1)"
if [[ -z "$CSS_PATH" ]]; then
  echo "CSS versionado do Next nao encontrado em /login" >&2
  exit 1
fi

echo "[3/3] Validando entrega do CSS em producao"
curl -skfI "$BASE_URL$CSS_PATH" >/dev/null

echo "Smoke frontend assets OK: login renderizado com asset CSS servido em producao."
