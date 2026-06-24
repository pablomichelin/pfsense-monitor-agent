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
  "$INSTALL_ROOT/usr/local/www/backup_systemup_monitor.php" \
  "$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor/info.xml" \
  "$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php" \
  "$INSTALL_ROOT/var/run/monitor-package-update.lock" \
  "$INSTALL_ROOT/var/run/monitor_pfsense_agent.pid" \
  "$INSTALL_ROOT/var/log/monitor-pfsense-agent.log" \
  "$INSTALL_ROOT/tmp/monitor-update.log" \
  "$INSTALL_ROOT/tmp/install-from-release.sh" \
  "$INSTALL_ROOT/tmp/monitor-package-release-cache.json"

# B5: paridade com systemup_monitor_package_uninstall — limpa estado runtime,
# node_secret, locks, backoff e snapshots em /var/db/monitor-pfsense-agent.
rm -rf \
  "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent" \
  "$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor" \
  "$INSTALL_ROOT/var/db/monitor-pfsense-agent"

echo "SystemUp Monitor package files and runtime state removed."
