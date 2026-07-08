#!/bin/sh
# Wrapper pfSense OS upgrade — desacoplado do heartbeat loop.
# Spawned by dispatch_pfsense_upgrade; resultado final via finalize_pfsense_upgrade_if_pending (reboot).
#
# Fluxo remoto (default): a confirmação no painel pfs-monitor substitui o Confirm da GUI.
# 1) pfSense-upgrade -u  — atualiza repositórios
# 2) ASSUME_ALWAYS_YES=yes pfSense-upgrade -d -y — aplica upgrade e reinicia
# Pós-reboot: finalize_pfsense_upgrade_if_pending fecha o comando quando a versão == alvo.
#
# Opt-out: MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=0 mantém só refresh de repos (legado).

set -eu

COMMAND_ID="${1:-}"
TARGET_VERSION="${2:-}"
STATE_FILE="${3:-}"
EXEC_ENABLED="${MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED:-1}"
LOG_FILE="${MONITOR_AGENT_LOG_FILE:-/var/log/monitor-pfsense-agent.log}"
UPGRADE_LOG="/var/log/monitor-pfsense-agent-upgrade.log"
LOCK_FILE="/var/run/monitor-pfsense-agent-upgrade.lock"
AGENT_BIN="${MONITOR_AGENT_BIN:-/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh}"

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

post_command_failed() {
  [ -n "$COMMAND_ID" ] || return 0
  "$AGENT_BIN" post-command-result "$COMMAND_ID" failed "$1" >>"$UPGRADE_LOG" 2>&1 || true
}

cleanup_lock() {
  rm -f "$LOCK_FILE" 2>/dev/null || true
}

acquire_lock() {
  if [ -f "$LOCK_FILE" ]; then
    lock_pid=""
    while IFS='=' read -r key value; do
      case "$key" in
        pid) lock_pid="$value" ;;
      esac
    done <"$LOCK_FILE" 2>/dev/null || true
    if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
      log_msg "upgrade lock held by pid=${lock_pid}"
      return 1
    fi
    rm -f "$LOCK_FILE" 2>/dev/null || true
  fi

  if (set -C; umask 077; printf 'pid=%s\nstarted_at=%s\n' "$$" "$(date +%s)" >"$LOCK_FILE") 2>/dev/null; then
    umask 022
    return 0
  fi

  log_msg "failed to acquire upgrade lock"
  return 1
}

refresh_repositories() {
  log_msg "refreshing pkg repositories (pfSense-upgrade -d -u)"
  set +e
  pfSense-upgrade -d -u >>"$UPGRADE_LOG" 2>&1
  repo_code=$?
  set -e

  if [ "$repo_code" -ne 0 ]; then
    log_msg "pfSense-upgrade -u failed exit=$repo_code"
    update_state "failed" "pfSense-upgrade -u failed (see $UPGRADE_LOG)"
    post_command_failed "pfSense-upgrade -u failed (see $UPGRADE_LOG)"
    exit 1
  fi
}

run_noninteractive_upgrade() {
  refresh_repositories

  log_msg "running non-interactive OS upgrade (ASSUME_ALWAYS_YES=yes pfSense-upgrade -d -y)"
  update_state "executing" "Running pfSense-upgrade -y; reboot expected"

  set +e
  env ASSUME_ALWAYS_YES=yes pfSense-upgrade -d -y >>"$UPGRADE_LOG" 2>&1
  upgrade_code=$?
  set -e

  if [ "$upgrade_code" -ne 0 ]; then
    log_msg "pfSense-upgrade -y failed exit=$upgrade_code"
    update_state "failed" "pfSense-upgrade -y failed (see $UPGRADE_LOG)"
    post_command_failed "pfSense-upgrade -y failed (see $UPGRADE_LOG)"
    exit 1
  fi

  log_msg "pfSense-upgrade -y finished; reboot expected target=$TARGET_VERSION"
  update_state "rebooting" "Upgrade applied; waiting for reboot to finalize"
  exit 0
}

if [ -z "$COMMAND_ID" ] || [ -z "$STATE_FILE" ]; then
  log_msg "missing command_id or state_file"
  exit 1
fi

if ! acquire_lock; then
  update_state "failed" "another upgrade operation is running"
  post_command_failed "another upgrade operation is running"
  exit 1
fi

trap 'cleanup_lock' EXIT INT TERM

log_msg "start command_id=$COMMAND_ID target=$TARGET_VERSION exec_enabled=$EXEC_ENABLED"

if ! command -v pfSense-upgrade >/dev/null 2>&1; then
  log_msg "pfSense-upgrade not found"
  update_state "failed" "pfSense-upgrade not found"
  post_command_failed "pfSense-upgrade not found"
  exit 1
fi

case "$EXEC_ENABLED" in
  1|true|yes|on)
    run_noninteractive_upgrade
    ;;
esac

log_msg "exec disabled — repositories only (legacy semi-manual)"
refresh_repositories
update_state "prepared_manual_confirm" \
  "Repositories refreshed. Remote exec disabled on agent; confirm manually in pfSense GUI (System → Update)."
exit 0
