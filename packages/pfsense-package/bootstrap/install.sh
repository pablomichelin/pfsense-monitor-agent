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
ENABLE_PACKAGE="0"

usage() {
  cat <<EOF
Usage:
  $0 [--controller-url URL --node-uid UID --node-secret SECRET --customer-code CODE] [--interval-seconds N] [--services CSV] [--enable]

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
    --enable) ENABLE_PACKAGE="1"; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

copy_tree() {
  src_dir="$1"
  dst_dir="$2"

  mkdir -p "$dst_dir"
  tar -C "$src_dir" -cf - usr | tar -C "$dst_dir" -xpf -
}

copy_tree "$PACKAGE_ROOT/files" "$INSTALL_ROOT"

chmod 0755 \
  "$INSTALL_ROOT/usr/local/etc/rc.d/monitor_pfsense_agent" \
  "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh" \
  "$INSTALL_ROOT/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh" \
  "$INSTALL_ROOT/usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php"

if [ "$INSTALL_ROOT" = "/" ] && [ -x /usr/local/bin/php ] && [ -f /etc/inc/config.inc ]; then
  /usr/local/bin/php -r '
    require_once("/etc/inc/config.inc");
    require_once("/etc/inc/pkg-utils.inc");
    install_package_xml("systemup-monitor");
  ' < /dev/null

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
  # Com config completa (controller + node_uid + secret + customer), habilita e inicia o serviço em um único passo
  if [ "$ENABLE_PACKAGE" = "1" ] || { [ -n "$CONTROLLER_URL" ] && [ -n "$NODE_UID" ] && [ -n "$NODE_SECRET" ] && [ -n "$CUSTOMER_CODE" ]; }; then
    set -- "$@" --enable
  fi

  /usr/local/bin/php -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php "$@" < /dev/null

  # Garantir que o serviço está habilitado e rodando (o PHP pode falhar ao iniciar quando o install roda em background)
  if [ -n "$CONTROLLER_URL" ] && [ -n "$NODE_UID" ] && [ -n "$NODE_SECRET" ] && [ -n "$CUSTOMER_CODE" ]; then
    if [ -f /usr/local/etc/rc.d/monitor_pfsense_agent ]; then
      /usr/sbin/sysrc monitor_pfsense_agent_enable=YES 2>/dev/null || true
      /usr/sbin/service monitor_pfsense_agent start 2>/dev/null || true
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
