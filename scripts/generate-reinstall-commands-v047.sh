#!/usr/bin/env bash
#
# Gera arquivos de reinstall v0.4.7 categorizados em dist/reinstall-v0.4.7-*.txt
# Usa bootstrap-command da API (package-artifact + SHA256 pinado).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"

ALL_FILE="$DIST_DIR/reinstall-v0.4.7-ALL.txt"
NEW_FILE="$DIST_DIR/reinstall-v0.4.7-NEW-INSTALLS.txt"
BROKEN_FILE="$DIST_DIR/reinstall-v0.4.7-BROKEN-VERSIONS.txt"
OFFLINE_FILE="$DIST_DIR/reinstall-v0.4.7-OFFLINE.txt"

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
TARGET_SHA256="${PACKAGE_RELEASE_SHA256:-}"

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
mkdir -p "$DIST_DIR"

file_header() {
  local file="$1"
  local title="$2"
  {
    echo "# $title"
    echo "# Package alvo: v${TARGET_VERSION}"
    echo "# SHA256: ${TARGET_SHA256:-<nao configurado>}"
    echo "# Artefato: https://pfs-monitor.systemup.inf.br/api/v1/agent/package-artifact"
    echo "# Gerado em: $(date -Iseconds)"
    echo "#"
    echo "# INSTRUÇÃO: copiar o bloco do host correspondente e colar no"
    echo "# Diagnostics > Command Prompt do pfSense. Validar heartbeat no painel."
    echo ""
  } >"$file"
}

append_wolf_rekey_section() {
  local file="$1"
  {
    echo "# =================================================================="
    echo "# WOLF SOFTWARE (wolff-software) — REKEY OBRIGATÓRIO ANTES DO INSTALL"
    echo "# Motivo: HTTP 401 contínuo (secret desatualizado no firewall)."
    echo "#"
    echo "# Passos:"
    echo "#   1. Painel → Firewall Wolff Software → Renovar chave (rekey)"
    echo "#   2. Regenerar este arquivo OU copiar comando bootstrap atualizado do painel"
    echo "#   3. Só então colar o comando de install abaixo no pfSense"
    echo "# =================================================================="
    echo ""
  } >>"$file"
}

write_node_block() {
  local file="$1"
  local node_uid="$2"
  local client="$3"
  local site="$4"
  local hostname="$5"
  local agent_version="$6"
  local status="$7"
  local reason="$8"
  local package_cmd="$9"
  local agent_label="${10:-<nao instalado>}"

  {
    echo "# === ${client} / ${site} / ${node_uid} / ${hostname} ==="
    echo "# status=${status} agent=${agent_label} motivo=${reason}"
    echo "$package_cmd"
    echo ""
  } >>"$file"
}

declare -A SEEN_ALL=()
declare -a NEW_UIDS=()
declare -a BROKEN_UIDS=()
declare -a OFFLINE_UIDS=()
declare -a ALL_UIDS=()

while IFS= read -r node_line; do
  node_uid=$(echo "$node_line" | jq -r '.node_uid')
  agent_version=$(echo "$node_line" | jq -r '.agent_version // ""')
  status=$(echo "$node_line" | jq -r '.effective_status // .observed_status // "unknown"')

  is_new=0
  is_broken=0
  is_offline=0

  if [[ -z "$agent_version" || "$status" == "unknown" ]]; then
    is_new=1
    NEW_UIDS+=("$node_uid")
  fi

  if [[ "$agent_version" =~ ^0\.4\.[0-6]$ ]]; then
    is_broken=1
    BROKEN_UIDS+=("$node_uid")
  fi

  if [[ "$status" == "offline" ]]; then
    is_offline=1
    OFFLINE_UIDS+=("$node_uid")
  fi

  if [[ "$is_new" -eq 1 || "$is_broken" -eq 1 || "$is_offline" -eq 1 ]]; then
    if [[ -z "${SEEN_ALL[$node_uid]:-}" ]]; then
      SEEN_ALL["$node_uid"]=1
      ALL_UIDS+=("$node_uid")
    fi
  fi
done < <(echo "$NODES_JSON" | jq -c '.items[]')

file_header "$NEW_FILE" "Reinstall v0.4.7 — novos / bootstrap (sem agente ou unknown)"
file_header "$BROKEN_FILE" "Reinstall v0.4.7 — versoes 0.4.0–0.4.6 (syntax error corrigido em 0.4.7)"
file_header "$OFFLINE_FILE" "Reinstall v0.4.7 — firewalls offline (silenciosos)"
file_header "$ALL_FILE" "Reinstall v0.4.7 — todos os hosts afetados"
append_wolf_rekey_section "$ALL_FILE"

generate_for_uid() {
  local node_uid="$1"
  local node_id
  node_id=$(echo "$NODES_JSON" | jq -r --arg uid "$node_uid" '.items[] | select(.node_uid == $uid) | .id')
  if [[ -z "$node_id" || "$node_id" == "null" ]]; then
    echo "Erro: node $node_uid não encontrado" >&2
    return 1
  fi

  local client site uid hostname agent_version status
  client=$(echo "$NODES_JSON" | jq -r --arg uid "$node_uid" '.items[] | select(.node_uid == $uid) | .client.name // .client.code // ""')
  site=$(echo "$NODES_JSON" | jq -r --arg uid "$node_uid" '.items[] | select(.node_uid == $uid) | .site.name // .site.code // ""')
  uid=$(echo "$NODES_JSON" | jq -r --arg uid "$node_uid" '.items[] | select(.node_uid == $uid) | .node_uid')
  hostname=$(echo "$NODES_JSON" | jq -r --arg uid "$node_uid" '.items[] | select(.node_uid == $uid) | .hostname // ""')
  agent_version=$(echo "$NODES_JSON" | jq -r --arg uid "$node_uid" '.items[] | select(.node_uid == $uid) | .agent_version // ""')
  status=$(echo "$NODES_JSON" | jq -r --arg uid "$node_uid" '.items[] | select(.node_uid == $uid) | .effective_status // .observed_status // "unknown"')

  local bootstrap_json package_cmd
  bootstrap_json=$(curl -s -b "$COOKIE_JAR" "$API_BASE/api/v1/admin/nodes/$node_id/bootstrap-command")
  package_cmd=$(echo "$bootstrap_json" | jq -r '.package_command // empty')

  if [[ -z "$package_cmd" || "$package_cmd" == "null" ]]; then
    echo "Falha: sem package_command para $node_uid" >&2
    return 1
  fi

  if ! grep -q 'package-artifact' <<<"$package_cmd"; then
    echo "Aviso: $node_uid não usa package-artifact" >&2
  fi
  if [[ -n "$TARGET_SHA256" ]] && ! grep -q "$TARGET_SHA256" <<<"$package_cmd"; then
    echo "Aviso: $node_uid SHA256 diverge do config ($TARGET_SHA256)" >&2
  fi
  if grep -qE '(^|[^<])<<<' <<<"$package_cmd"; then
    echo "Erro: $node_uid contém bashism no comando" >&2
    return 1
  fi

  local reason="reinstall"
  if [[ -z "$agent_version" || "$status" == "unknown" ]]; then
    reason="novo/bootstrap sem heartbeat"
  elif [[ "$agent_version" =~ ^0\.4\.[0-6]$ ]]; then
    reason="versao ${agent_version} (bug here-string — corrigido em 0.4.7)"
  elif [[ "$status" == "offline" ]]; then
    reason="offline silencioso"
  fi

  local agent_label="${agent_version:-<nao instalado>}"

  if [[ " ${NEW_UIDS[*]:-} " == *" $node_uid "* ]]; then
    write_node_block "$NEW_FILE" "$uid" "$client" "$site" "$hostname" "$agent_version" "$status" "$reason" "$package_cmd" "$agent_label"
  fi
  if [[ " ${BROKEN_UIDS[*]:-} " == *" $node_uid "* ]]; then
    write_node_block "$BROKEN_FILE" "$uid" "$client" "$site" "$hostname" "$agent_version" "$status" "$reason" "$package_cmd" "$agent_label"
  fi
  if [[ " ${OFFLINE_UIDS[*]:-} " == *" $node_uid "* ]]; then
    write_node_block "$OFFLINE_FILE" "$uid" "$client" "$site" "$hostname" "$agent_version" "$status" "$reason" "$package_cmd" "$agent_label"
  fi
  write_node_block "$ALL_FILE" "$uid" "$client" "$site" "$hostname" "$agent_version" "$status" "$reason" "$package_cmd" "$agent_label"
}

FAIL=0
OK=0
for node_uid in "${ALL_UIDS[@]}"; do
  if generate_for_uid "$node_uid"; then
    OK=$((OK + 1))
  else
    FAIL=$((FAIL + 1))
  fi
done

{
  echo ""
  echo "# RESUMO"
  echo "# ALL=${#ALL_UIDS[@]} NEW=${#NEW_UIDS[@]} BROKEN=${#BROKEN_UIDS[@]} OFFLINE=${#OFFLINE_UIDS[@]}"
  echo "# gerados_ok=$OK falhas=$FAIL target=$TARGET_VERSION"
} >>"$ALL_FILE"

echo "Arquivos gerados:"
echo "  $ALL_FILE (${#ALL_UIDS[@]} hosts)"
echo "  $NEW_FILE (${#NEW_UIDS[@]} hosts)"
echo "  $BROKEN_FILE (${#BROKEN_UIDS[@]} hosts)"
echo "  $OFFLINE_FILE (${#OFFLINE_UIDS[@]} hosts)"
echo "Resumo: ok=$OK fail=$FAIL"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
