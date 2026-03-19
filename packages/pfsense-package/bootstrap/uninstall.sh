#!/bin/sh

set -eu

INSTALL_ROOT="${INSTALL_ROOT:-/}"

if [ "$INSTALL_ROOT" = "/" ] && [ -x /usr/local/bin/php ] && [ -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php ]; then
  /usr/local/bin/php -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php remove || true
fi

rm -f \
  "$INSTALL_ROOT/usr/local/etc/monitor-pfsense-agent.conf" \
  "$INSTALL_ROOT/usr/local/etc/rc.d/monitor_pfsense_agent" \
  "$INSTALL_ROOT/usr/local/pkg/systemup_monitor.inc" \
  "$INSTALL_ROOT/usr/local/pkg/systemup_monitor.xml" \
  "$INSTALL_ROOT/usr/local/www/config_systemup_monitor.php" \
  "$INSTALL_ROOT/usr/local/www/status_systemup_monitor.php" \
  "$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor/info.xml" \
  "$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php"

rm -rf \
  "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent" \
  "$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor"

echo "SystemUp Monitor package files removed."
