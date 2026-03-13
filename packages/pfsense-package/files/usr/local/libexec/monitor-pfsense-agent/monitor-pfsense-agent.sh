#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
DEFAULT_CONFIG="$SCRIPT_DIR/../monitor-pfsense-agent.conf"
if [ -f /usr/local/etc/monitor-pfsense-agent.conf ]; then
  DEFAULT_CONFIG="/usr/local/etc/monitor-pfsense-agent.conf"
fi
CONFIG_FILE="${MONITOR_AGENT_CONFIG:-$DEFAULT_CONFIG}"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Config file not found: $CONFIG_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "$CONFIG_FILE"

require_var() {
  key="$1"
  eval "value=\${$key-}"
  if [ -z "${value:-}" ]; then
    echo "Missing required config: $key" >&2
    exit 1
  fi
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

pfsense_config_path() {
  printf '%s' "${MONITOR_AGENT_PFSENSE_CONFIG_XML:-/conf/config.xml}"
}

add_notice() {
  message="$1"
  if [ -z "${message:-}" ]; then
    return
  fi

  if [ -n "${MONITOR_AGENT_NOTICES:-}" ]; then
    MONITOR_AGENT_NOTICES="${MONITOR_AGENT_NOTICES}
$message"
  else
    MONITOR_AGENT_NOTICES="$message"
  fi
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

json_nullable_string() {
  if [ -n "${1:-}" ]; then
    printf '"%s"' "$(json_escape "$1")"
    return
  fi

  printf 'null'
}

json_nullable_number() {
  if [ -n "${1:-}" ]; then
    printf '%s' "$1"
    return
  fi

  printf 'null'
}

truncate_text() {
  value="${1:-}"
  limit="${2:-255}"

  if [ -z "$value" ]; then
    printf '%s' "$value"
    return
  fi

  printf '%s' "$value" | awk -v limit="$limit" '
    BEGIN { ORS = "" }
    {
      text = $0
      if (length(text) > limit) {
        printf "%s", substr(text, 1, limit)
      } else {
        printf "%s", text
      }
    }
  '
}

json_string_array() {
  if [ "$#" -eq 0 ]; then
    printf '[]'
    return
  fi

  first_item="1"
  printf '['
  for item in "$@"; do
    if [ "$first_item" = "1" ]; then
      first_item="0"
    else
      printf ','
    fi
    printf '"%s"' "$(json_escape "$item")"
  done
  printf ']'
}

hex_hmac() {
  openssl dgst -sha256 -hmac "$1" -binary | od -An -vtx1 | tr -d ' \n'
}

iso_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

detect_hostname() {
  if [ -n "${HOSTNAME_OVERRIDE:-}" ]; then
    printf '%s' "$HOSTNAME_OVERRIDE"
    return
  fi

  hostname 2>/dev/null || printf 'unknown-host'
}

read_pfsense_interface_name() {
  interface_role="$1"
  config_path="$(pfsense_config_path)"

  if [ ! -f "$config_path" ] || ! command_exists php; then
    return 1
  fi

  PFSENSE_CONFIG_XML="$config_path" php -r '
    $role = $argv[1];
    $configPath = getenv("PFSENSE_CONFIG_XML") ?: "/conf/config.xml";
    $config = @simplexml_load_file($configPath);
    if (!$config || !isset($config->interfaces->{$role}->if)) {
      exit(1);
    }
    echo trim((string) $config->interfaces->{$role}->if);
  ' "$interface_role" 2>/dev/null
}

detect_interface_ipv4() {
  interface_name="$1"

  if [ -z "${interface_name:-}" ]; then
    return 1
  fi

  ifconfig "$interface_name" 2>/dev/null | awk '
    $1 == "inet" && $2 != "127.0.0.1" {
      print $2;
      exit;
    }
  '
}

detect_default_interface() {
  if command_exists route; then
    route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}'
    return
  fi

  if command_exists ip; then
    ip route show default 2>/dev/null | awk '
      /default/ {
        for (i = 1; i <= NF; i++) {
          if ($i == "dev") {
            print $(i + 1);
            exit;
          }
        }
      }
    '
  fi
}

detect_mgmt_ip() {
  if [ -n "${MGMT_IP:-}" ]; then
    printf '%s' "$MGMT_IP"
    return
  fi

  lan_if="$(read_pfsense_interface_name lan 2>/dev/null || true)"
  if [ -n "${lan_if:-}" ]; then
    detect_interface_ipv4 "$lan_if"
    return
  fi
}

detect_wan_ip() {
  if [ -n "${WAN_IP_REPORTED:-}" ]; then
    printf '%s' "$WAN_IP_REPORTED"
    return
  fi

  wan_if="$(read_pfsense_interface_name wan 2>/dev/null || true)"
  if [ -z "${wan_if:-}" ]; then
    wan_if="$(detect_default_interface 2>/dev/null || true)"
  fi

  if [ -n "${wan_if:-}" ]; then
    detect_interface_ipv4 "$wan_if"
  fi
}

detect_pfsense_version() {
  if [ -n "${PFSENSE_VERSION_OVERRIDE:-}" ]; then
    printf '%s' "$PFSENSE_VERSION_OVERRIDE"
    return
  fi

  if [ -f /etc/version ]; then
    head -n 1 /etc/version | tr -d '\r'
    return
  fi

  printf 'unknown'
}

detect_uptime_seconds() {
  if [ -n "${UPTIME_SECONDS_OVERRIDE:-}" ]; then
    printf '%s' "$UPTIME_SECONDS_OVERRIDE"
    return
  fi

  if [ -r /proc/uptime ]; then
    awk '{print int($1)}' /proc/uptime
    return
  fi

  if command_exists php && command_exists sysctl; then
    php -r '
      $output = shell_exec("sysctl -n kern.boottime 2>/dev/null") ?? "";
      if (preg_match("/sec\\s*=\\s*([0-9]+)/", $output, $matches)) {
        echo max(0, time() - (int) $matches[1]);
        exit(0);
      }
      exit(1);
    ' 2>/dev/null && return
  fi

  if command -v sysctl >/dev/null 2>&1; then
    boot_epoch=$(sysctl -n kern.boottime 2>/dev/null | awk '
      match($0, /sec = [0-9]+/) {
        value = substr($0, RSTART, RLENGTH)
        sub(/^sec = /, "", value)
        print value
        exit
      }
    ' | head -n 1)
    if [ -n "${boot_epoch:-}" ]; then
      now_epoch=$(date +%s)
      expr "$now_epoch" - "$boot_epoch"
      return
    fi
  fi

  printf '0'
}

detect_disk_percent() {
  if [ -n "${DISK_PERCENT_OVERRIDE:-}" ]; then
    printf '%s' "$DISK_PERCENT_OVERRIDE"
    return
  fi

  df -Pk / 2>/dev/null | awk 'NR == 2 {gsub(/%/, "", $5); print $5; exit}'
}

detect_memory_percent() {
  if [ -n "${MEMORY_PERCENT_OVERRIDE:-}" ]; then
    printf '%s' "$MEMORY_PERCENT_OVERRIDE"
    return
  fi

  if [ -r /proc/meminfo ]; then
    awk '
      $1 == "MemTotal:" { total = $2 }
      $1 == "MemAvailable:" { available = $2 }
      END {
        if (total > 0 && available >= 0) {
          used = total - available;
          printf "%.2f", (used * 100) / total;
        }
      }
    ' /proc/meminfo
    return
  fi

  if command_exists sysctl; then
    total="$(sysctl -n hw.physmem 2>/dev/null || true)"
    page_size="$(sysctl -n hw.pagesize 2>/dev/null || true)"
    free_pages="$(sysctl -n vm.stats.vm.v_free_count 2>/dev/null || true)"
    inactive_pages="$(sysctl -n vm.stats.vm.v_inactive_count 2>/dev/null || true)"
    cache_pages="$(sysctl -n vm.stats.vm.v_cache_count 2>/dev/null || true)"

    if [ -n "${total:-}" ] && [ -n "${page_size:-}" ] && [ -n "${free_pages:-}" ] && [ -n "${inactive_pages:-}" ] && [ -n "${cache_pages:-}" ]; then
      awk -v total="$total" -v page_size="$page_size" -v free_pages="$free_pages" -v inactive_pages="$inactive_pages" -v cache_pages="$cache_pages" '
        BEGIN {
          available = (free_pages + inactive_pages + cache_pages) * page_size;
          if (total > 0) {
            used = total - available;
            if (used < 0) {
              used = 0;
            }
            printf "%.2f", (used * 100) / total;
          }
        }
      '
      return
    fi
  fi
}

detect_cpu_percent() {
  if [ -n "${CPU_PERCENT_OVERRIDE:-}" ]; then
    printf '%s' "$CPU_PERCENT_OVERRIDE"
    return
  fi

  if command_exists top; then
    top -b -n 1 2>/dev/null | awk '
      /CPU:|CPU states:/ {
        for (i = 1; i <= NF; i++) {
          gsub(/,/, "", $i)
          if ($i ~ /id$/ || $i ~ /idle$/) {
            idle = $(i - 1)
            gsub(/%/, "", idle)
            if (idle ~ /^[0-9]+([.][0-9]+)?$/) {
              printf "%.2f", 100 - idle
              exit
            }
          }
        }
      }
    '
  fi
}

service_process_pattern() {
  case "$1" in
    unbound) printf '%s' '(^|/)(unbound)$' ;;
    dhcpd) printf '%s' '(^|/)(dhcpd)$' ;;
    openvpn) printf '%s' '(^|/)(openvpn)$' ;;
    ipsec) printf '%s' 'charon|starter|pluto' ;;
    wireguard) printf '%s' 'wireguard-go|boringtun|wg-quick' ;;
    ntpd) printf '%s' '(^|/)(ntpd)$' ;;
    dpinger) printf '%s' '(^|/)(dpinger)$' ;;
    *) return 1 ;;
  esac
}

service_status_from_process() {
  service_name="$1"

  if ! command_exists pgrep; then
    return 1
  fi

  pattern="$(service_process_pattern "$service_name" 2>/dev/null || true)"
  if [ -z "${pattern:-}" ]; then
    return 1
  fi

  if pgrep -f "$pattern" >/dev/null 2>&1; then
    printf 'running|detected via process match\n'
    return 0
  fi

  return 1
}

service_status_from_service_cmd() {
  service_name="$1"
  service_output=""

  if service_status_from_process "$service_name" 2>/dev/null; then
    return
  fi

  if service_output="$(service "$service_name" onestatus 2>&1)"; then
    printf 'running|%s\n' "$service_output"
    return
  fi

  service_output="$(service "$service_name" status 2>&1 || true)"
  case "$service_output" in
    *"does not exist"*|*"not found"*|*"could not be found"*|*"unknown directive"*)
      printf 'stopped|%s\n' "$service_output"
      return
      ;;
    *"is running as"*|*"running as pid"*|*"is running"*)
      printf 'running|%s\n' "$service_output"
      return
      ;;
    "")
      printf 'unknown|\n'
      return
      ;;
    *)
      printf 'stopped|%s\n' "$service_output"
      return
      ;;
  esac
}

detect_service_status() {
  service_name="$1"

  if command_exists service; then
    service_status_from_service_cmd "$service_name"
    return
  fi

  if command_exists pgrep; then
    if pgrep -f "$service_name" >/dev/null 2>&1; then
      printf 'running|detected via pgrep\n'
    else
      printf 'stopped|process not found via pgrep\n'
    fi
    return
  fi

  printf 'unknown|no service detection method available\n'
}

# Fase B: package_name (catalog) -> rc service name no FreeBSD/pfSense
package_name_to_service_name() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    apcupsd) printf '%s' 'apcupsd' ;;
    arpwatch) printf '%s' 'arpwatch' ;;
    avahi) printf '%s' 'avahi' ;;
    bandwidthd) printf '%s' 'bandwidthd' ;;
    bind) printf '%s' 'named' ;;
    darkstat) printf '%s' 'darkstat' ;;
    freeradius3) printf '%s' 'radiusd' ;;
    frr) printf '%s' 'frr' ;;
    haproxy|haproxy-devel) printf '%s' 'haproxy' ;;
    ladvd) printf '%s' 'ladvd' ;;
    lldpd) printf '%s' 'lldpd' ;;
    mdns-bridge) printf '%s' 'mdnsbridge' ;;
    net-snmp) printf '%s' 'snmpd' ;;
    node_exporter) printf '%s' 'node_exporter' ;;
    nrpe) printf '%s' 'nrpe' ;;
    ntopng) printf '%s' 'ntopng' ;;
    nut) printf '%s' 'nut' ;;
    pimd) printf '%s' 'pimd' ;;
    siproxd) printf '%s' 'siproxd' ;;
    snmptt) printf '%s' 'snmptt' ;;
    snort) printf '%s' 'snort' ;;
    softflowd) printf '%s' 'softflowd' ;;
    stunnel) printf '%s' 'stunnel' ;;
    suricata) printf '%s' 'suricata' ;;
    syslog-ng) printf '%s' 'syslog_ng' ;;
    tailscale) printf '%s' 'tailscaled' ;;
    telegraf) printf '%s' 'telegraf' ;;
    tftpd) printf '%s' 'tftpd' ;;
    tinc) printf '%s' 'tinc' ;;
    udpbroadcastrelay) printf '%s' 'udpbroadcastrelay' ;;
    wireguard) printf '%s' 'wireguard' ;;
    zabbix-agent5|zabbix-agent6|zabbix-agent7) printf '%s' 'zabbix_agent2' ;;
    zabbix-proxy5|zabbix-proxy6|zabbix-proxy7) printf '%s' 'zabbix_proxy' ;;
    zeek) printf '%s' 'zeek' ;;
    lightsquid) printf '%s' 'lightsquid' ;;
    open-vm-tools) printf '%s' 'vmware_guestd' ;;
    squid) printf '%s' 'squid' ;;
    squidguard) printf '%s' 'squidguard' ;;
    *)
      printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/-/_/g'
      ;;
  esac
}

service_should_be_monitored() {
  service_name="$1"
  config_path="$(pfsense_config_path)"

  if [ ! -f "$config_path" ] || ! command_exists php; then
    return 0
  fi

  PFSENSE_CONFIG_XML="$config_path" php -r '
    $service = strtolower($argv[1]);
    $configPath = getenv("PFSENSE_CONFIG_XML") ?: "/conf/config.xml";
    $config = @simplexml_load_file($configPath);
    if (!$config) {
      exit(0);
    }

    $hasEnabledChild = static function ($node): bool {
      if (!$node instanceof SimpleXMLElement) {
        return false;
      }

      foreach ($node->children() as $child) {
        if ((string) ($child->enable ?? "") !== "") {
          return true;
        }
      }

      return false;
    };

    $hasActiveChild = static function ($node, array $candidates = []): bool {
      if (!$node instanceof SimpleXMLElement) {
        return false;
      }

      $children = [];
      if ($candidates === []) {
        foreach ($node->children() as $child) {
          $children[] = $child;
        }
      } else {
        foreach ($candidates as $candidate) {
          if (!isset($node->{$candidate})) {
            continue;
          }
          foreach ($node->{$candidate} as $child) {
            $children[] = $child;
          }
        }
      }

      foreach ($children as $child) {
        if (!$child instanceof SimpleXMLElement) {
          continue;
        }
        if ((string) ($child->disable ?? "") === "1" || (string) ($child->disabled ?? "") === "1") {
          continue;
        }
        return true;
      }

      return false;
    };

    $shouldMonitor = true;

    switch ($service) {
      case "unbound":
        $shouldMonitor = isset($config->dnsresolver) && (string) ($config->dnsresolver->enable ?? "") !== "";
        break;
      case "dhcpd":
        $shouldMonitor = isset($config->dhcpd) && $hasEnabledChild($config->dhcpd);
        break;
      case "openvpn":
        $shouldMonitor = isset($config->openvpn) && $hasActiveChild($config->openvpn, [
          "openvpn-server",
          "openvpn-client",
          "openvpn-csc",
        ]);
        break;
      case "ipsec":
        $shouldMonitor =
          (isset($config->ipsec) && (string) ($config->ipsec->enable ?? "") !== "") ||
          (isset($config->ipsec->phase1) && count($config->ipsec->phase1) > 0);
        break;
      case "wireguard":
        $shouldMonitor = isset($config->wireguard) && $hasActiveChild($config->wireguard);
        break;
      case "ntpd":
        $shouldMonitor = isset($config->ntpd) && (string) ($config->ntpd->enable ?? "") !== "";
        break;
      case "dpinger":
        $shouldMonitor = isset($config->gateways) && $hasActiveChild($config->gateways, ["gateway_item"]);
        break;
      default:
        $shouldMonitor = true;
        break;
    }

    exit($shouldMonitor ? 0 : 1);
  ' "$service_name" >/dev/null 2>&1
}

build_services_json() {
  services_csv="${MONITOR_AGENT_SERVICES:-unbound,dhcpd,openvpn,ipsec,wireguard,ntpd,dpinger}"
  old_ifs="${IFS}"
  IFS=','
  first_item="1"

  printf '['
  for raw_service in $services_csv; do
    service_name=$(printf '%s' "$raw_service" | sed 's/^ *//; s/ *$//')
    if [ -z "$service_name" ]; then
      continue
    fi

    if ! service_should_be_monitored "$service_name"; then
      continue
    fi

    service_state="$(detect_service_status "$service_name")"
    service_status="${service_state%%|*}"
    service_detail="$(truncate_text "${service_state#*|}" 255)"

    if [ "$first_item" = "1" ]; then
      first_item="0"
    else
      printf ','
    fi

    printf '{"name":"%s","status":"%s","message":%s}' \
      "$(json_escape "$service_name")" \
      "$(json_escape "$service_status")" \
      "$(json_nullable_string "$service_detail")"
  done

  # Fase B: pacotes adicionais (MONITOR_AGENT_PACKAGES = "pkg:impact,pkg2:impact" ou "pkg")
  packages_csv="${MONITOR_AGENT_PACKAGES:-}"
  if [ -n "$packages_csv" ]; then
    IFS=','
    for raw_entry in $packages_csv; do
      entry=$(printf '%s' "$raw_entry" | sed 's/^ *//; s/ *$//')
      if [ -z "$entry" ]; then
        continue
      fi
      package_name="${entry%%:*}"
      impact="${entry#*:}"
      if [ "$impact" = "$entry" ]; then
        impact="critical"
      fi
      package_name=$(printf '%s' "$package_name" | sed 's/^ *//; s/ *$//')
      impact=$(printf '%s' "$impact" | tr '[:upper:]' '[:lower:]' | sed 's/^ *//; s/ *$//')
      if [ -z "$package_name" ]; then
        continue
      fi
      case "$impact" in
        critical|optional) ;;
        *) impact="critical" ;;
      esac
      rc_service="$(package_name_to_service_name "$package_name")"
      service_state="$(detect_service_status "$rc_service")"
      service_status="${service_state%%|*}"
      service_detail="$(truncate_text "${service_state#*|}" 255)"
      if [ "$first_item" = "1" ]; then
        first_item="0"
      else
        printf ','
      fi
      printf '{"name":"%s","status":"%s","message":%s,"impact_on_status":"%s"}' \
        "$(json_escape "$rc_service")" \
        "$(json_escape "$service_status")" \
        "$(json_nullable_string "$service_detail")" \
        "$(json_escape "$impact")"
    done
  fi
  IFS="${old_ifs}"
  printf ']'
}

build_gateways_json() {
  printf '[]'
}

build_payload() {
  mgmt_ip="$(detect_mgmt_ip 2>/dev/null || true)"
  wan_ip="$(detect_wan_ip 2>/dev/null || true)"
  pfsense_version="$(detect_pfsense_version 2>/dev/null)" || pfsense_version="unknown"
  uptime_seconds="$(detect_uptime_seconds 2>/dev/null)" || uptime_seconds="0"
  cpu_percent="$(detect_cpu_percent 2>/dev/null || true)"
  memory_percent="$(detect_memory_percent 2>/dev/null || true)"
  disk_percent="$(detect_disk_percent 2>/dev/null || true)"
  heartbeat_id="${NODE_UID}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  sent_at="$(iso_now)"
  services_json="$(build_services_json 2>/dev/null)" || services_json="[]"
  gateways_json="$(build_gateways_json 2>/dev/null)" || gateways_json="[]"

  if [ -n "${MONITOR_AGENT_NOTICES:-}" ]; then
    notices_json="$(json_string_array "$MONITOR_AGENT_NOTICES")"
  else
    notices_json='[]'
  fi

  cat <<EOF
{
  "schema_version": "$(json_escape "${SCHEMA_VERSION:-2026-01}")",
  "heartbeat_id": "$(json_escape "$heartbeat_id")",
  "sent_at": "$(json_escape "$sent_at")",
  "node_uid": "$(json_escape "$NODE_UID")",
  "hostname": "$(json_escape "$(detect_hostname)")",
  "customer_code": "$(json_escape "$CUSTOMER_CODE")",
  "pfsense_version": "$(json_escape "$pfsense_version")",
  "uptime_sec": $uptime_seconds,
  "mgmt_ip": $(json_nullable_string "$mgmt_ip"),
  "wan_ip_reported": $(json_nullable_string "$wan_ip"),
  "agent_version": "$(json_escape "${AGENT_VERSION:-0.1.0}")",
  "cpu_percent": $(json_nullable_number "$cpu_percent"),
  "memory_percent": $(json_nullable_number "$memory_percent"),
  "disk_percent": $(json_nullable_number "$disk_percent"),
  "gateways": $gateways_json,
  "services": $services_json,
  "notices": $notices_json
}
EOF
}

build_test_connection_signature() {
  timestamp="$1"
  printf '%s\n' "$timestamp" | hex_hmac "$NODE_SECRET"
}

build_payload_signature() {
  timestamp="$1"
  payload_file="$2"

  {
    printf '%s\n' "$timestamp"
    cat "$payload_file"
  } | hex_hmac "$NODE_SECRET"
}

print_config() {
  cat "$CONFIG_FILE"
}

heartbeat() {
  require_var CONTROLLER_URL
  require_var NODE_UID
  require_var NODE_SECRET
  require_var CUSTOMER_CODE

  CURL_CMD=""
  if command -v curl >/dev/null 2>&1; then
    CURL_CMD="curl"
  elif [ -x /usr/local/bin/curl ]; then
    CURL_CMD="/usr/local/bin/curl"
  else
    echo "heartbeat: curl not found (PATH=$PATH)" >&2
    exit 1
  fi

  timestamp="$(iso_now)"
  payload_file="$(mktemp)"
  trap 'rm -f "$payload_file"' EXIT INT TERM
  build_payload >"$payload_file" 2>/dev/null
  if [ ! -s "$payload_file" ]; then
    echo "heartbeat: build_payload failed" >&2
    exit 1
  fi
  signature="$(build_payload_signature "$timestamp" "$payload_file")"

  $CURL_CMD -fsS \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Node-Uid: $NODE_UID" \
    -H "X-Timestamp: $timestamp" \
    -H "X-Signature: $signature" \
    --data-binary @"$payload_file" \
    "${CONTROLLER_URL}/api/v1/ingest/heartbeat"
}

test_connection() {
  require_var CONTROLLER_URL
  require_var NODE_UID
  require_var NODE_SECRET
  require_var CUSTOMER_CODE

  CURL_CMD=""
  if command -v curl >/dev/null 2>&1; then
    CURL_CMD="curl"
  elif [ -x /usr/local/bin/curl ]; then
    CURL_CMD="/usr/local/bin/curl"
  else
    echo "test_connection: curl not found" >&2
    exit 1
  fi

  timestamp="$(iso_now)"
  signature="$(build_test_connection_signature "$timestamp")"

  $CURL_CMD -fsS \
    -X POST \
    -H "X-Node-Uid: $NODE_UID" \
    -H "X-Timestamp: $timestamp" \
    -H "X-Signature: $signature" \
    "${CONTROLLER_URL}/api/v1/ingest/test-connection"
}

usage() {
  cat <<EOF
Usage:
  $0 heartbeat
  $0 test-connection
  $0 print-config
EOF
}

command_name="${1:-}"
case "$command_name" in
  heartbeat)
    heartbeat
    ;;
  test-connection)
    test_connection
    ;;
  print-config)
    print_config
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
