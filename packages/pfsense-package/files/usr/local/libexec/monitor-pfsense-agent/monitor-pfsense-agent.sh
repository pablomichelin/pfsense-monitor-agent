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

  if command -v sysctl >/dev/null 2>&1; then
    boot_epoch=$(sysctl -n kern.boottime 2>/dev/null | sed -n 's/.*sec = \([0-9][0-9]*\).*/\1/p' | head -n 1)
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
  fi
}

service_status_from_service_cmd() {
  service_name="$1"
  service_output=""

  if service_output="$(service "$service_name" onestatus 2>&1)"; then
    printf 'running|%s\n' "$service_output"
    return
  fi

  service_output="$(service "$service_name" status 2>&1 || true)"
  case "$service_output" in
    *"does not exist"*|*"not found"*|*"could not be found"*|*"unknown directive"*)
      printf 'not_installed|%s\n' "$service_output"
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
  printf ']'
  IFS="${old_ifs}"
}

build_gateways_json() {
  printf '[]'
}

build_payload() {
  mgmt_ip="$(detect_mgmt_ip 2>/dev/null || true)"
  wan_ip="$(detect_wan_ip 2>/dev/null || true)"
  pfsense_version="$(detect_pfsense_version)"
  uptime_seconds="$(detect_uptime_seconds)"
  cpu_percent="$(detect_cpu_percent 2>/dev/null || true)"
  memory_percent="$(detect_memory_percent 2>/dev/null || true)"
  disk_percent="$(detect_disk_percent 2>/dev/null || true)"
  heartbeat_id="${NODE_UID}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  sent_at="$(iso_now)"
  services_json="$(build_services_json)"
  gateways_json="$(build_gateways_json)"

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

  timestamp="$(iso_now)"
  payload_file="$(mktemp)"
  trap 'rm -f "$payload_file"' EXIT INT TERM
  build_payload >"$payload_file"
  signature="$(build_payload_signature "$timestamp" "$payload_file")"

  curl -fsS \
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

  timestamp="$(iso_now)"
  signature="$(build_test_connection_signature "$timestamp")"

  curl -fsS \
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
