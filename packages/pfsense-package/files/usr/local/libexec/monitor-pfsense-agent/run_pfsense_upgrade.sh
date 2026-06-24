#!/bin/sh
# Wrapper pfSense OS upgrade — desacoplado do heartbeat loop.
# Spawned by dispatch_pfsense_upgrade; resultado final via finalize_pfsense_upgrade_if_pending (reboot).
#
# P-UP — IMPORTANTE (comportamento honesto): este wrapper NUNCA executa o upgrade
# do SO de forma não-interativa. Ele apenas (1) atualiza repositórios com
# `pfSense-upgrade -d` e (2) marca o estado como "prepared_manual_confirm" para
# que o operador confirme manualmente em System → Update na GUI do pfSense.
# A flag MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=1 NÃO habilita execução remota:
# os flags não-interativos do pfSense-upgrade ainda não foram homologados (ver
# docs/97-SPIKE-PFSENSE-UPGRADE-CE.md). Enquanto o spike CE não fechar, qualquer
# valor da flag resulta no mesmo fluxo seguro (preparar + confirmação manual).

set -eu

COMMAND_ID="${1:-}"
TARGET_VERSION="${2:-}"
STATE_FILE="${3:-}"
EXEC_ENABLED="${MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED:-0}"
LOG_FILE="${MONITOR_AGENT_LOG_FILE:-/var/log/monitor-pfsense-agent.log}"
UPGRADE_LOG="/var/log/monitor-pfsense-agent-upgrade.log"
LOCK_DIR="/var/run/monitor-pfsense-agent-upgrade.lock"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

iso_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

log_msg() {
  line="$(iso_now) [pfsense-upgrade] $*"
  printf '%s\n' "$line" >>"$UPGRADE_LOG" 2>/dev/null || true
  printf '%s\n' "$line" >>"$LOG_FILE" 2>/dev/null || true
}

update_state() {
  status="$1"
  message="$2"
  if [ -z "$STATE_FILE" ] || [ ! -f "$STATE_FILE" ]; then
    return 0
  fi

  php -r '
    $path = $argv[1];
    $status = $argv[2];
    $message = $argv[3];
    $at = $argv[4];
    $data = json_decode(@file_get_contents($path), true);
    if (!is_array($data)) {
      $data = array();
    }
    $data["status"] = $status;
    $data["message"] = $message;
    $data["updated_at"] = $at;
    file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
  ' "$STATE_FILE" "$status" "$message" "$(iso_now)" 2>/dev/null || true
}

cleanup_lock() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

if [ -z "$COMMAND_ID" ] || [ -z "$STATE_FILE" ]; then
  log_msg "missing command_id or state_file"
  cleanup_lock
  exit 1
fi

trap 'cleanup_lock' EXIT INT TERM

log_msg "start command_id=$COMMAND_ID target=$TARGET_VERSION exec_enabled=$EXEC_ENABLED"

if ! command -v pfSense-upgrade >/dev/null 2>&1; then
  log_msg "pfSense-upgrade not found"
  update_state "failed" "pfSense-upgrade not found"
  exit 1
fi

# Download / refresh repositories (safe pre-step, no reboot)
set +e
pfSense-upgrade -d >>"$UPGRADE_LOG" 2>&1
download_code=$?
set -e

if [ "$download_code" -ne 0 ]; then
  log_msg "pfSense-upgrade -d failed exit=$download_code"
  update_state "failed" "pfSense-upgrade -d failed (see $UPGRADE_LOG)"
  exit 1
fi

if [ "$EXEC_ENABLED" != "1" ]; then
  log_msg "exec disabled — prepared for manual Confirm in pfSense GUI (System → Update)"
  update_state "prepared_manual_confirm" \
    "Repositories refreshed. Confirm upgrade manually in pfSense GUI (System → Update). Reboot will finalize via agent."
  exit 0
fi

# Lab-only path: non-interactive flags NOT validated in spike 97 — do not auto-reboot.
# P-UP: a flag está ligada, mas execução não-interativa segue NÃO suportada de
# forma honesta. Mantemos o mesmo fluxo seguro (preparar + confirmação manual)
# para não prometer um upgrade remoto que não acontece.
log_msg "exec enabled but non-interactive upgrade flags not validated in CE lab — falling back to manual confirm (see docs/97-SPIKE-PFSENSE-UPGRADE-CE.md)"
update_state "prepared_manual_confirm" \
  "MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=1 ainda NAO executa upgrade nao-interativo (flags nao homologados). Repositorios atualizados; confirme manualmente em System -> Update."
exit 0
