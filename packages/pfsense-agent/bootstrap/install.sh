#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PACKAGE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
INSTALL_ROOT="${INSTALL_ROOT:-/}"

CONTROLLER_URL=""
NODE_UID=""
NODE_SECRET=""
CUSTOMER_CODE=""
HOSTNAME_OVERRIDE=""
PFSENSE_VERSION_OVERRIDE=""
UPTIME_SECONDS_OVERRIDE=""
MGMT_IP=""
WAN_IP_REPORTED=""
CPU_PERCENT_OVERRIDE=""
MEMORY_PERCENT_OVERRIDE=""
DISK_PERCENT_OVERRIDE=""
AGENT_VERSION="0.1.0"
SCHEMA_VERSION="2026-01"
INTERVAL_SECONDS="30"
MONITOR_AGENT_SERVICES="unbound,dhcpd,openvpn,ipsec,wireguard,ntpd,dpinger"
HEARTBEAT_MODE="normal"
AUTO_START="1"

usage() {
  cat <<EOF
Usage:
  $0 --controller-url URL --node-uid UID --node-secret SECRET --customer-code CODE [options]

Options:
  --hostname-override VALUE
  --pfsense-version-override VALUE
  --uptime-seconds-override VALUE
  --mgmt-ip VALUE
  --wan-ip VALUE
  --cpu-percent-override VALUE
  --memory-percent-override VALUE
  --disk-percent-override VALUE
  --agent-version VALUE
  --schema-version VALUE
  --interval-seconds VALUE
  --services CSV
  --heartbeat-mode normal|light
  --no-start
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --controller-url) CONTROLLER_URL="$2"; shift 2 ;;
    --node-uid) NODE_UID="$2"; shift 2 ;;
    --node-secret) NODE_SECRET="$2"; shift 2 ;;
    --customer-code) CUSTOMER_CODE="$2"; shift 2 ;;
    --hostname-override) HOSTNAME_OVERRIDE="$2"; shift 2 ;;
    --pfsense-version-override) PFSENSE_VERSION_OVERRIDE="$2"; shift 2 ;;
    --uptime-seconds-override) UPTIME_SECONDS_OVERRIDE="$2"; shift 2 ;;
    --mgmt-ip) MGMT_IP="$2"; shift 2 ;;
    --wan-ip) WAN_IP_REPORTED="$2"; shift 2 ;;
    --cpu-percent-override) CPU_PERCENT_OVERRIDE="$2"; shift 2 ;;
    --memory-percent-override) MEMORY_PERCENT_OVERRIDE="$2"; shift 2 ;;
    --disk-percent-override) DISK_PERCENT_OVERRIDE="$2"; shift 2 ;;
    --agent-version) AGENT_VERSION="$2"; shift 2 ;;
    --schema-version) SCHEMA_VERSION="$2"; shift 2 ;;
    --interval-seconds) INTERVAL_SECONDS="$2"; shift 2 ;;
    --services) MONITOR_AGENT_SERVICES="$2"; shift 2 ;;
    --heartbeat-mode) HEARTBEAT_MODE="$2"; shift 2 ;;
    --no-start) AUTO_START="0"; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

case "$(printf '%s' "$HEARTBEAT_MODE" | tr '[:upper:]' '[:lower:]')" in
  light) HEARTBEAT_MODE="light" ;;
  normal|"") HEARTBEAT_MODE="normal" ;;
  *) echo "Invalid heartbeat mode: $HEARTBEAT_MODE (use normal or light)" >&2; exit 1 ;;
esac

MONITOR_AGENT_LIGHT_HEARTBEAT="0"
if [ "$HEARTBEAT_MODE" = "light" ]; then
  MONITOR_AGENT_LIGHT_HEARTBEAT="1"
fi

for required in CONTROLLER_URL NODE_UID NODE_SECRET CUSTOMER_CODE; do
  eval "value=\${$required}"
  if [ -z "$value" ]; then
    echo "Missing required option: $required" >&2
    usage
    exit 1
  fi
done

ETC_DIR="$INSTALL_ROOT/usr/local/etc"
LIBEXEC_DIR="$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent"
RC_DIR="$INSTALL_ROOT/usr/local/etc/rc.d"
LOG_DIR="$INSTALL_ROOT/var/log"
RUN_DIR="$INSTALL_ROOT/var/run"
CONFIG_FILE="$ETC_DIR/monitor-pfsense-agent.conf"

mkdir -p "$ETC_DIR" "$LIBEXEC_DIR" "$RC_DIR" "$LOG_DIR" "$RUN_DIR"

install -m 0755 "$PACKAGE_ROOT/bin/monitor-pfsense-agent.sh" \
  "$LIBEXEC_DIR/monitor-pfsense-agent.sh"
install -m 0755 "$SCRIPT_DIR/monitor-pfsense-agent-loop.sh" \
  "$LIBEXEC_DIR/monitor-pfsense-agent-loop.sh"
install -m 0755 "$SCRIPT_DIR/monitor_pfsense_agent.rc" \
  "$RC_DIR/monitor_pfsense_agent"

cat > "$CONFIG_FILE" <<EOF
CONTROLLER_URL="$CONTROLLER_URL"
NODE_UID="$NODE_UID"
NODE_SECRET="$NODE_SECRET"
CUSTOMER_CODE="$CUSTOMER_CODE"
AGENT_VERSION="$AGENT_VERSION"
SCHEMA_VERSION="$SCHEMA_VERSION"
MONITOR_AGENT_INTERVAL_SECONDS="$INTERVAL_SECONDS"
MONITOR_AGENT_LOG_FILE="/var/log/monitor-pfsense-agent.log"
MONITOR_AGENT_SERVICES="$MONITOR_AGENT_SERVICES"
MONITOR_AGENT_LIGHT_HEARTBEAT="$MONITOR_AGENT_LIGHT_HEARTBEAT"
EOF

if [ -n "$HOSTNAME_OVERRIDE" ]; then
  printf 'HOSTNAME_OVERRIDE="%s"\n' "$HOSTNAME_OVERRIDE" >> "$CONFIG_FILE"
fi

if [ -n "$PFSENSE_VERSION_OVERRIDE" ]; then
  printf 'PFSENSE_VERSION_OVERRIDE="%s"\n' "$PFSENSE_VERSION_OVERRIDE" >> "$CONFIG_FILE"
fi

if [ -n "$UPTIME_SECONDS_OVERRIDE" ]; then
  printf 'UPTIME_SECONDS_OVERRIDE="%s"\n' "$UPTIME_SECONDS_OVERRIDE" >> "$CONFIG_FILE"
fi

if [ -n "$MGMT_IP" ]; then
  printf 'MGMT_IP="%s"\n' "$MGMT_IP" >> "$CONFIG_FILE"
fi

if [ -n "$WAN_IP_REPORTED" ]; then
  printf 'WAN_IP_REPORTED="%s"\n' "$WAN_IP_REPORTED" >> "$CONFIG_FILE"
fi

if [ -n "$CPU_PERCENT_OVERRIDE" ]; then
  printf 'CPU_PERCENT_OVERRIDE="%s"\n' "$CPU_PERCENT_OVERRIDE" >> "$CONFIG_FILE"
fi

if [ -n "$MEMORY_PERCENT_OVERRIDE" ]; then
  printf 'MEMORY_PERCENT_OVERRIDE="%s"\n' "$MEMORY_PERCENT_OVERRIDE" >> "$CONFIG_FILE"
fi

if [ -n "$DISK_PERCENT_OVERRIDE" ]; then
  printf 'DISK_PERCENT_OVERRIDE="%s"\n' "$DISK_PERCENT_OVERRIDE" >> "$CONFIG_FILE"
fi

if [ "$INSTALL_ROOT" = "/" ] && command -v service >/dev/null 2>&1; then
  if command -v sysrc >/dev/null 2>&1; then
    sysrc monitor_pfsense_agent_enable=YES >/dev/null
  fi

  if [ "$AUTO_START" = "1" ]; then
    service monitor_pfsense_agent restart || service monitor_pfsense_agent start
  fi
fi

cat <<EOF
Bootstrap installed.

Config: $CONFIG_FILE
Agent:  $LIBEXEC_DIR/monitor-pfsense-agent.sh
Loop:   $LIBEXEC_DIR/monitor-pfsense-agent-loop.sh
RC:     $RC_DIR/monitor_pfsense_agent
EOF
