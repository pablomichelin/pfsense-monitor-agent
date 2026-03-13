#!/bin/sh

set -eu

INSTALL_ROOT="${INSTALL_ROOT:-/}"

RC_FILE="$INSTALL_ROOT/usr/local/etc/rc.d/monitor_pfsense_agent"
CONFIG_FILE="$INSTALL_ROOT/usr/local/etc/monitor-pfsense-agent.conf"
LIBEXEC_DIR="$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent"

if [ "$INSTALL_ROOT" = "/" ] && command -v service >/dev/null 2>&1; then
  service monitor_pfsense_agent stop >/dev/null 2>&1 || true
  if command -v sysrc >/dev/null 2>&1; then
    sysrc -x monitor_pfsense_agent_enable >/dev/null 2>&1 || true
  fi
fi

rm -f "$RC_FILE" "$CONFIG_FILE"
rm -rf "$LIBEXEC_DIR"

echo "Bootstrap removed."
