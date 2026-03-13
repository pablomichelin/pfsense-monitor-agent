#!/bin/sh

set -eu

AGENT_HOME="${AGENT_HOME:-/usr/local/libexec/monitor-pfsense-agent}"
CONFIG_FILE="${MONITOR_AGENT_CONFIG:-/usr/local/etc/monitor-pfsense-agent.conf}"
LOG_FILE="${MONITOR_AGENT_LOG_FILE:-/var/log/monitor-pfsense-agent.log}"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "$CONFIG_FILE"

INTERVAL_SECONDS="${MONITOR_AGENT_INTERVAL_SECONDS:-30}"
AGENT_BIN="$AGENT_HOME/monitor-pfsense-agent.sh"

while :; do
  "$AGENT_BIN" heartbeat >>"$LOG_FILE" 2>&1 || true
  sleep "$INTERVAL_SECONDS"
done
