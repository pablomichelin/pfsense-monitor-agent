#!/bin/sh
# Reinicia o pfSense após atraso; resultado enviado antes do reboot.
set -eu

COMMAND_ID="${1:-}"
DELAY_SECONDS="${2:-60}"
STATE_FILE="${3:-}"
LOG_FILE="/var/log/monitor-pfsense-agent-operational.log"
LOCK_FILE="/var/run/monitor-pfsense-agent-operational.lock"
AGENT_BIN="${MONITOR_AGENT_BIN:-/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh}"

json_escape() {
  printf '%s' "$1" | awk '
    BEGIN { ORS="" }
    {
      for (i = 1; i <= length($0); i++) {
        c = substr($0, i, 1)
        if (c == "\\") printf "\\\\"
        else if (c == "\"") printf "\\\""
        else if (c == "\n") printf "\\n"
        else if (c == "\r") printf "\\r"
        else if (c == "\t") printf "\\t"
        else printf "%s", c
      }
    }
  '
}

iso_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

log_msg() {
  printf '[%s] [node-reboot] %s\n' "$(iso_now)" "$*" >>"$LOG_FILE" 2>&1 || true
}

cleanup_lock() {
  rm -f "$LOCK_FILE" 2>/dev/null || true
}

post_command_failed() {
  "$AGENT_BIN" post-command-result "$COMMAND_ID" failed "$1" >>"$LOG_FILE" 2>&1 || true
}

post_command_succeeded() {
  "$AGENT_BIN" post-command-result "$COMMAND_ID" succeeded "$1" >>"$LOG_FILE" 2>&1 || true
}

trap 'cleanup_lock' EXIT INT TERM

if [ -z "$COMMAND_ID" ] || [ -z "$STATE_FILE" ]; then
  log_msg "missing command_id or state_file"
  exit 1
fi

case "$DELAY_SECONDS" in
  ''|*[!0-9]*) DELAY_SECONDS=60 ;;
esac
if [ "$DELAY_SECONDS" -lt 30 ] 2>/dev/null; then
  DELAY_SECONDS=30
fi
if [ "$DELAY_SECONDS" -gt 600 ] 2>/dev/null; then
  DELAY_SECONDS=600
fi

log_msg "start command_id=$COMMAND_ID delay=${DELAY_SECONDS}s"

scheduled_at="$(iso_now)"
result_json="{\"scheduled_reboot_at\":\"${scheduled_at}\",\"delay_seconds\":${DELAY_SECONDS}}"
post_command_succeeded "$result_json"

log_msg "sleeping ${DELAY_SECONDS}s before reboot"
sleep "$DELAY_SECONDS"

log_msg "executing reboot"
if [ -x /sbin/reboot ]; then
  /sbin/reboot
elif [ -x /sbin/shutdown ]; then
  /sbin/shutdown -r now
else
  post_command_failed "reboot command not found"
  exit 1
fi

rm -f "$STATE_FILE" 2>/dev/null || true
