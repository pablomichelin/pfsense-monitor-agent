#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"
BASE_URL="${BASE_URL:-http://127.0.0.1:8088}"

DEFAULT_SUITE=(
  "smoke-frontend-assets.sh"
  "smoke-agent-release.sh"
  "smoke-realtime-refresh.sh"
  "smoke-auth-sessions.sh"
  "smoke-bootstrap-flow.sh"
  "smoke-admin-operations.sh"
  "smoke-rbac-roles.sh"
)

usage() {
  cat <<'EOF'
Uso:
  scripts/run-smoke-suite.sh
  scripts/run-smoke-suite.sh script1.sh script2.sh

Variaveis suportadas:
  BASE_URL       Base do painel e API. Padrao: http://127.0.0.1:8088
  AUTH_EMAIL     Login bootstrap para os smokes
  AUTH_PASSWORD  Senha bootstrap para os smokes

Sem argumentos, roda a suite local padrao:
  - smoke-frontend-assets.sh
  - smoke-realtime-refresh.sh
  - smoke-agent-release.sh
  - smoke-auth-sessions.sh
  - smoke-bootstrap-flow.sh
  - smoke-admin-operations.sh
  - smoke-rbac-roles.sh
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

SUITE=("$@")
if [[ "${#SUITE[@]}" -eq 0 ]]; then
  SUITE=("${DEFAULT_SUITE[@]}")
fi

START_TS="$(date +%s)"

echo "Suite de smoke iniciada"
echo "BASE_URL=$BASE_URL"
echo

for script_name in "${SUITE[@]}"; do
  script_path="$SCRIPTS_DIR/$script_name"

  if [[ ! -x "$script_path" ]]; then
    if [[ -f "$script_path" ]]; then
      chmod +x "$script_path"
    else
      echo "Script ausente: $script_name" >&2
      exit 1
    fi
  fi

  echo "==> Executando $script_name"
  BASE_URL="$BASE_URL" AUTH_EMAIL="${AUTH_EMAIL:-}" AUTH_PASSWORD="${AUTH_PASSWORD:-}" "$script_path"
  echo "<== OK $script_name"
  echo
done

END_TS="$(date +%s)"
DURATION="$((END_TS - START_TS))"

echo "Suite concluida com sucesso em ${DURATION}s."
