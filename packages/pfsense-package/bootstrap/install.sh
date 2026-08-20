#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PACKAGE_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
INSTALL_ROOT="${INSTALL_ROOT:-/}"

CONTROLLER_URL=""
NODE_UID=""
NODE_SECRET=""
CUSTOMER_CODE=""
INTERVAL_SECONDS=""
SERVICES_CSV=""
HEARTBEAT_MODE="normal"
ENABLE_PACKAGE="0"
CONFIG_BACKUP_ENABLED="yes"

usage() {
  cat <<EOF
Usage:
  $0 [--controller-url URL --node-uid UID --node-secret SECRET --customer-code CODE] [--interval-seconds N] [--services CSV] [--heartbeat-mode normal|light] [--config-backup-enabled yes|no] [--enable]

  Com controller-url + node-uid + node-secret + customer-code o serviço é habilitado e iniciado automaticamente (heartbeats a cada 30s).

Examples:
  $0
  $0 --controller-url https://pfs-monitor.systemup.inf.br --node-uid node-123 --node-secret secret-123 --customer-code CLIENTE
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --controller-url) CONTROLLER_URL="$2"; shift 2 ;;
    --node-uid) NODE_UID="$2"; shift 2 ;;
    --node-secret) NODE_SECRET="$2"; shift 2 ;;
    --customer-code) CUSTOMER_CODE="$2"; shift 2 ;;
    --interval-seconds) INTERVAL_SECONDS="$2"; shift 2 ;;
    --services) SERVICES_CSV="$2"; shift 2 ;;
    --heartbeat-mode) HEARTBEAT_MODE="$2"; shift 2 ;;
    --config-backup-enabled) CONFIG_BACKUP_ENABLED="$2"; shift 2 ;;
    --enable) ENABLE_PACKAGE="1"; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

case "$(printf '%s' "$HEARTBEAT_MODE" | tr '[:upper:]' '[:lower:]')" in
  light) HEARTBEAT_MODE="light" ;;
  normal|"") HEARTBEAT_MODE="normal" ;;
  *) echo "Invalid heartbeat mode: $HEARTBEAT_MODE (use normal or light)" >&2; exit 1 ;;
esac

copy_tree() {
  src_dir="$1"
  dst_dir="$2"

  mkdir -p "$dst_dir"
  tar -C "$src_dir" -cf - usr | tar -C "$dst_dir" -xpf -
}

repair_orphaned_local_users() {
  if [ "$INSTALL_ROOT" != "/" ]; then
    return 0
  fi

  helper="$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/manage_local_user.php"
  if [ ! -x /usr/local/bin/php ] || [ ! -f "$helper" ] || [ ! -f /etc/inc/config.inc ]; then
    return 0
  fi

  /usr/local/bin/php -d opcache.enable_cli=0 \
    "$helper" adopt_orphans \
    >>/tmp/systemup-monitor-user-repair.log 2>&1 || true
}

install_package_files() {
  copy_tree "$PACKAGE_ROOT/files" "$INSTALL_ROOT"

  chmod 0755 \
    "$INSTALL_ROOT/usr/local/etc/rc.d/monitor_pfsense_agent" \
    "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh" \
    "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh" \
    "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/check_pfsense_update_available.sh" \
    "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/collect_gateways.php" \
    "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/collect_config_snapshot.php" \
    "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/collect_local_users.php" \
    "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/manage_local_user.php" \
    "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/run_pfsense_upgrade.sh" \
    "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/run_package_upgrade.sh" \
    "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/run_node_reboot.sh" \
    "$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php"
}

invalidate_package_php_cache() {
  inc_file="$INSTALL_ROOT/usr/local/pkg/systemup_monitor.inc"
  cli_file="$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php"

  if [ ! -x /usr/local/bin/php ]; then
    return 0
  fi

  MONITOR_PKG_INC="$inc_file" \
  MONITOR_PKG_CLI="$cli_file" \
  /usr/local/bin/php -r '
    $files = array(getenv("MONITOR_PKG_INC"), getenv("MONITOR_PKG_CLI"));
    foreach ($files as $file) {
      if (!is_string($file) || $file === "" || !is_file($file)) {
        continue;
      }
      if (function_exists("opcache_invalidate")) {
        opcache_invalidate($file, true);
      }
    }
  ' < /dev/null 2>/dev/null || true
}

register_package_gui() {
  if [ -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php ]; then
    /usr/local/bin/php -d opcache.enable_cli=0 \
      -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php register-gui < /dev/null
    return $?
  fi

  /usr/local/bin/php -d opcache.enable_cli=0 -r '
    require_once("/etc/inc/config.inc");
    require_once("/etc/inc/globals.inc");
    require_once("/etc/inc/pkg-utils.inc");
    require_once("/usr/local/pkg/systemup_monitor.inc");
    if (!systemup_monitor_ensure_gui_registration("SystemUp Monitor GUI registration")) {
      fwrite(STDERR, "SystemUp Monitor GUI registration failed.\n");
      exit(1);
    }
  ' < /dev/null
}

read_package_registration_counts() {
  /usr/local/bin/php -r '
    require_once("/etc/inc/config.inc");
    $count_named = function ($items, $field, $expected) {
      $total = 0;
      if (!is_array($items)) {
        return 0;
      }
      foreach ($items as $item) {
        if (!is_array($item)) {
          continue;
        }
        if (($item[$field] ?? "") === $expected) {
          $total++;
        }
      }
      return $total;
    };
    $package = $count_named($config["installedpackages"]["package"] ?? array(), "name", "systemup-monitor");
    $menu = $count_named($config["installedpackages"]["menu"] ?? array(), "name", "SystemUp Monitor");
    $service = $count_named($config["installedpackages"]["service"] ?? array(), "name", "monitor_pfsense_agent");
    echo "${package},${menu},${service}";
  ' < /dev/null 2>/dev/null || echo "0,0,0"
}

ensure_package_gui_registration() {
  counts="$(read_package_registration_counts)"
  pkg_count="${counts%%,*}"
  rest="${counts#*,}"
  menu_count="${rest%%,*}"
  service_count="${rest##*,}"

  if [ "$menu_count" != "0" ] && [ "$pkg_count" != "0" ]; then
    echo "SystemUp Monitor GUI registered (package=${pkg_count}, menu=${menu_count}, service=${service_count})."
    return 0
  fi

  echo "SystemUp Monitor GUI missing (package=${pkg_count}, menu=${menu_count}, service=${service_count}); retrying GUI registration..." >&2
  register_package_gui || true

  counts="$(read_package_registration_counts)"
  pkg_count="${counts%%,*}"
  rest="${counts#*,}"
  menu_count="${rest%%,*}"

  if [ "$menu_count" = "0" ] || [ "$pkg_count" = "0" ]; then
    echo "SystemUp Monitor GUI registration failed (package=${pkg_count}, menu=${menu_count})." >&2
    echo "Agent files may be installed, but Services > SystemUp Monitor will not appear until registration succeeds." >&2
    return 1
  fi

  echo "SystemUp Monitor GUI registered after retry (package=${pkg_count}, menu=${menu_count})."
}

install_package_files

if [ "$INSTALL_ROOT" = "/" ] && [ -x /usr/local/bin/php ] && [ -f /etc/inc/config.inc ]; then
  MONITOR_PKG_INC="$INSTALL_ROOT/usr/local/pkg/systemup_monitor.inc" \
  MONITOR_PKG_CLI="$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php" \
  invalidate_package_php_cache

  register_package_gui || true

  set -- seed

  if [ -n "$CONTROLLER_URL" ]; then
    set -- "$@" --controller-url "$CONTROLLER_URL"
  fi
  if [ -n "$NODE_UID" ]; then
    set -- "$@" --node-uid "$NODE_UID"
  fi
  if [ -n "$NODE_SECRET" ]; then
    set -- "$@" --node-secret "$NODE_SECRET"
  fi
  if [ -n "$CUSTOMER_CODE" ]; then
    set -- "$@" --customer-code "$CUSTOMER_CODE"
  fi
  if [ -n "$INTERVAL_SECONDS" ]; then
    set -- "$@" --interval-seconds "$INTERVAL_SECONDS"
  fi
  if [ -n "$SERVICES_CSV" ]; then
    set -- "$@" --services "$SERVICES_CSV"
  fi
  if [ -n "$HEARTBEAT_MODE" ]; then
    set -- "$@" --heartbeat-mode "$HEARTBEAT_MODE"
  fi
  case "$(printf '%s' "$CONFIG_BACKUP_ENABLED" | tr '[:upper:]' '[:lower:]')" in
    yes|true|1|on)
      set -- "$@" --config-backup-enabled yes
      ;;
    no|false|0|off|"")
      set -- "$@" --config-backup-enabled no
      ;;
  esac
  # Com config completa (controller + node_uid + secret + customer), habilita e inicia o serviço em um único passo
  if [ "$ENABLE_PACKAGE" = "1" ] || { [ -n "$CONTROLLER_URL" ] && [ -n "$NODE_UID" ] && [ -n "$NODE_SECRET" ] && [ -n "$CUSTOMER_CODE" ]; }; then
    set -- "$@" --enable
  fi

  /usr/local/bin/php -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php "$@" < /dev/null

  # install_package_xml/seed podem recarregar PHP com opcache stale ou hooks pfSense; tarball vence
  install_package_files
  MONITOR_PKG_INC="$INSTALL_ROOT/usr/local/pkg/systemup_monitor.inc" \
  MONITOR_PKG_CLI="$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php" \
  invalidate_package_php_cache

  # Sempre regenerar o config do agente com a versão atual do package (AGENT_VERSION), mesmo em upgrade
  /usr/local/bin/php -d opcache.enable_cli=0 \
    -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php sync < /dev/null 2>/dev/null || true

  ensure_package_gui_registration || true

  # Upgrade da frota passa por este install.sh (nao pelo pkg-install POST-INSTALL).
  repair_orphaned_local_users || true

  # Durante upgrade remoto o wrapper reinicia o serviço após post-command-result.
  if [ "${MONITOR_PACKAGE_UPGRADE_MODE:-}" != "1" ]; then
    if [ -n "$CONTROLLER_URL" ] && [ -n "$NODE_UID" ] && [ -n "$NODE_SECRET" ] && [ -n "$CUSTOMER_CODE" ]; then
      if [ -f /usr/local/etc/rc.d/monitor_pfsense_agent ]; then
        /usr/sbin/sysrc monitor_pfsense_agent_enable=YES 2>/dev/null || true
        /usr/sbin/service monitor_pfsense_agent restart 2>/dev/null \
          || /usr/sbin/service monitor_pfsense_agent start 2>/dev/null \
          || true
      fi
    fi
  fi
fi

cat <<EOF
SystemUp Monitor package files installed.

GUI XML: /usr/local/pkg/systemup_monitor.xml
Status:  /usr/local/www/status_systemup_monitor.php
Agent:   /usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh
RC:      /usr/local/etc/rc.d/monitor_pfsense_agent
EOF
