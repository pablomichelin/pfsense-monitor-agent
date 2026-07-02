#!/usr/bin/env bash
#
# Gera comandos de atualização do package pfSense para todos os nodes
# com agent_version != versão alvo (config/package-release.env).
#
# Uso:
#   ./scripts/batch-generate-upgrade-commands.sh [--output FILE] [--priority degraded|offline|all]
#
# Requer: curl, jq, .env.api com AUTH_BOOTSTRAP_* e opcional MONITOR_API_BASE_URL
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_FILE=""
PRIORITY="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output|-o) OUTPUT_FILE="${2:-}"; shift 2 ;;
    --priority|-p) PRIORITY="${2:-all}"; shift 2 ;;
    -h|--help)
      echo "Uso: $0 [--output FILE] [--priority degraded|offline|online|all]"
      exit 0
      ;;
    *) echo "Opção desconhecida: $1" >&2; exit 1 ;;
  esac
done

if ! command -v jq &>/dev/null; then
  echo "Erro: jq é obrigatório." >&2
  exit 1
fi

if [[ -f "$PROJECT_ROOT/config/package-release.env" ]]; then
  set -a
  # shellcheck source=../config/package-release.env
  source "$PROJECT_ROOT/config/package-release.env"
  set +a
fi
TARGET_VERSION="${PACKAGE_RELEASE_VERSION:-0.4.7}"

if [[ -f "$PROJECT_ROOT/.env.api" ]]; then
  while IFS= read -r line; do
    case "$line" in
      AUTH_BOOTSTRAP_EMAIL=*) AUTH_BOOTSTRAP_EMAIL="${line#*=}" ;;
      AUTH_BOOTSTRAP_PASSWORD=*) AUTH_BOOTSTRAP_PASSWORD="${line#*=}" ;;
      MONITOR_API_BASE_URL=*) MONITOR_API_BASE_URL="${line#*=}" ;;
    esac
  done < <(grep -E '^(AUTH_BOOTSTRAP_EMAIL|AUTH_BOOTSTRAP_PASSWORD|MONITOR_API_BASE_URL)=' "$PROJECT_ROOT/.env.api" || true)
fi

API_BASE="${MONITOR_API_BASE_URL:-http://127.0.0.1:8088}"
API_BASE="${API_BASE%/}"
EMAIL="${AUTH_BOOTSTRAP_EMAIL:-}"
PASS="${AUTH_BOOTSTRAP_PASSWORD:-}"

if [[ -z "$EMAIL" || -z "$PASS" ]]; then
  echo "Erro: defina AUTH_BOOTSTRAP_EMAIL e AUTH_BOOTSTRAP_PASSWORD em .env.api" >&2
  exit 1
fi

COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

LOGIN_RESP=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$API_BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

if ! echo "$LOGIN_RESP" | jq -e '.ok == true' &>/dev/null; then
  echo "Erro: login falhou." >&2
  exit 1
fi

NODES_JSON=$(curl -s -b "$COOKIE_JAR" "$API_BASE/api/v1/nodes")
TOTAL=$(echo "$NODES_JSON" | jq '.items | length')

if [[ -z "$OUTPUT_FILE" ]]; then
  OUTPUT_FILE="$PROJECT_ROOT/dist/batch-upgrade-commands-v${TARGET_VERSION}-$(date +%Y%m%d-%H%M%S).txt"
fi
mkdir -p "$(dirname "$OUTPUT_FILE")"

{
  echo "# Batch upgrade commands — package v${TARGET_VERSION}"
  echo "# Gerado em: $(date -Iseconds)"
  echo "# API: $API_BASE"
  echo "# Prioridade filtro: $PRIORITY"
  echo "#"
  echo "# INSTRUÇÃO: colar cada bloco no Diagnostics > Command Prompt do pfSense correspondente."
  echo "# Ou via GUI: Services → SystemUp Monitor → Diagnóstico → Atualizar package"
  echo ""
} >"$OUTPUT_FILE"

OK=0
SKIP=0
FAIL=0

echo "node_uid|status|agent_version|last_seen|result" >&2

while IFS= read -r node_line; do
  node_id=$(echo "$node_line" | jq -r '.id')
  node_uid=$(echo "$node_line" | jq -r '.node_uid')
  status=$(echo "$node_line" | jq -r '.effective_status // .observed_status // .status // "unknown"')
  agent_version=$(echo "$node_line" | jq -r '.agent_version // "null"')
  last_seen=$(echo "$node_line" | jq -r '.last_seen_at // "null"')

  if [[ "$agent_version" == "$TARGET_VERSION" ]]; then
    echo "$node_uid|$status|$agent_version|$last_seen|skip_already_target" >&2
    SKIP=$((SKIP + 1))
    continue
  fi

  case "$PRIORITY" in
    all) ;;
    degraded) [[ "$status" == "degraded" ]] || { SKIP=$((SKIP + 1)); continue; } ;;
    offline) [[ "$status" == "offline" ]] || { SKIP=$((SKIP + 1)); continue; } ;;
    online) [[ "$status" == "online" ]] || { SKIP=$((SKIP + 1)); continue; } ;;
    *) echo "Prioridade inválida: $PRIORITY" >&2; exit 1 ;;
  esac

  BOOTSTRAP_JSON=$(curl -s -b "$COOKIE_JAR" "$API_BASE/api/v1/admin/nodes/$node_id/bootstrap-command")
  package_cmd=$(echo "$BOOTSTRAP_JSON" | jq -r '.package_command // empty')

  if [[ -z "$package_cmd" || "$package_cmd" == "null" ]]; then
    echo "$node_uid|$status|$agent_version|$last_seen|fail_no_command" >&2
    FAIL=$((FAIL + 1))
    continue
  fi

  {
    echo "================================================================"
    echo "# $node_uid — $status — agent $agent_version — last_seen $last_seen"
    echo "$package_cmd"
    echo ""
  } >>"$OUTPUT_FILE"

  echo "$node_uid|$status|$agent_version|$last_seen|ok" >&2
  OK=$((OK + 1))
done < <(echo "$NODES_JSON" | jq -c '.items[]')

{
  echo ""
  echo "# RESUMO: total=$TOTAL gerados=$OK skip=$SKIP fail=$FAIL target=$TARGET_VERSION"
} >>"$OUTPUT_FILE"

echo "" >&2
echo "Arquivo: $OUTPUT_FILE" >&2
echo "Resumo: gerados=$OK skip=$SKIP fail=$FAIL (total nodes API=$TOTAL)" >&2
