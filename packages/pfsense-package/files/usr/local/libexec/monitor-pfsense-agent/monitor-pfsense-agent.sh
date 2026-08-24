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

# B1: o segredo HMAC vive em arquivo 0600 (NODE_SECRET_FILE), nao em texto no .conf.
# A3 (0.4.3): migra NODE_SECRET legado do .conf para o arquivo 0600; fallback DEPRECATED 0.5.0.
NODE_SECRET_FILE="${NODE_SECRET_FILE:-/var/db/monitor-pfsense-agent/node_secret}"
if [ -z "${NODE_SECRET:-}" ] && [ -r "${NODE_SECRET_FILE}" ]; then
  NODE_SECRET="$(tr -d '\r\n' <"${NODE_SECRET_FILE}" 2>/dev/null || true)"
fi
if [ -n "${NODE_SECRET:-}" ] && [ ! -s "${NODE_SECRET_FILE}" ]; then
  secret_dir="$(dirname "$NODE_SECRET_FILE")"
  mkdir -p "$secret_dir" 2>/dev/null || true
  umask 077
  printf '%s' "$NODE_SECRET" >"${NODE_SECRET_FILE}" 2>/dev/null || true
  chmod 0600 "${NODE_SECRET_FILE}" 2>/dev/null || true
  umask 022
  if [ -w "$CONFIG_FILE" ] && grep -q '^NODE_SECRET=' "$CONFIG_FILE" 2>/dev/null; then
    sed -i '' '/^NODE_SECRET=/d' "$CONFIG_FILE" 2>/dev/null \
      || sed -i '/^NODE_SECRET=/d' "$CONFIG_FILE" 2>/dev/null \
      || true
  fi
  echo "monitor-pfsense-agent: secret migrated to runtime file" >&2
fi
NODE_SECRET="${NODE_SECRET:-}"

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

config_snapshot_path() {
  printf '%s/config-snapshot.json' "$(backup_state_dir)"
}

config_snapshot_ttl_seconds() {
  ttl="${MONITOR_AGENT_CONFIG_SNAPSHOT_TTL_SECONDS:-86400}"
  case "$ttl" in
    ''|*[!0-9]*) printf '86400' ;;
    *) printf '%s' "$ttl" ;;
  esac
}

heartbeat_error_path() {
  printf '%s/last-heartbeat-error.json' "$(backup_state_dir)"
}

config_snapshot_is_light_mode() {
  light="${MONITOR_AGENT_LIGHT_HEARTBEAT:-0}"
  case "$light" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

config_snapshot_needs_refresh() {
  path="$(config_snapshot_path)"
  config_path="$(pfsense_config_path)"
  ttl="$(config_snapshot_ttl_seconds)"

  if [ ! -f "$path" ]; then
    return 0
  fi

  command_exists php || return 1

  php -r '
    $path = $argv[1];
    $configPath = $argv[2];
    $ttl = (int) $argv[3];
    $data = json_decode(file_get_contents($path), true);
    if (!is_array($data)) {
      exit(0);
    }
    $generated = strtotime($data["generated_at"] ?? "");
    if ($generated === false || (time() - $generated) >= $ttl) {
      exit(0);
    }
    $cachedMtime = (int) ($data["config_mtime"] ?? 0);
    $currentMtime = is_file($configPath) ? (int) filemtime($configPath) : 0;
    if ($currentMtime > 0 && $cachedMtime > 0 && $currentMtime !== $cachedMtime) {
      exit(0);
    }
    exit(1);
  ' "$path" "$config_path" "$ttl"
}

refresh_config_snapshot() {
  helper="$SCRIPT_DIR/collect_config_snapshot.php"
  path="$(config_snapshot_path)"
  config_path="$(pfsense_config_path)"

  backup_ensure_state_dir
  if [ ! -f "$helper" ] || ! command_exists php; then
    return 1
  fi
  if [ ! -f "$config_path" ]; then
    return 1
  fi

  PFSENSE_CONFIG_XML="$config_path" \
    MONITOR_AGENT_CONFIG_SNAPSHOT_TTL_SECONDS="$(config_snapshot_ttl_seconds)" \
    php -f "$helper" >"$path.tmp" 2>/dev/null || return 1
  if [ ! -s "$path.tmp" ]; then
    rm -f "$path.tmp"
    return 1
  fi
  mv "$path.tmp" "$path"
  return 0
}

ensure_config_snapshot() {
  if config_snapshot_is_light_mode && [ -f "$(config_snapshot_path)" ]; then
    return 0
  fi
  if config_snapshot_needs_refresh; then
    refresh_config_snapshot || true
  fi
}

config_snapshot_read_cached_ips() {
  field="$1"
  path="$(config_snapshot_path)"
  [ -f "$path" ] || return 1
  command_exists php || return 1

  php -r '
    $data = json_decode(file_get_contents($argv[1]), true);
    if (!is_array($data)) {
      exit(1);
    }
    $value = trim((string) ($data[$argv[2]] ?? ""));
    if ($value === "") {
      exit(1);
    }
    echo $value;
  ' "$path" "$field" 2>/dev/null
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
  if command_exists php; then
    MONITOR_HMAC_KEY="$1" php -r 'echo hash_hmac("sha256", stream_get_contents(STDIN), (string) getenv("MONITOR_HMAC_KEY"));'
    return
  fi
  # Fallback: segredo visivel em ps via argv do openssl — preferir php quando disponivel.
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

# Lista interfaces do config: role (wan, lan, opt1), nome fisico (if), descricao e ipaddr (do XML quando for IPv4).
# Saida: "role\tifname\tdescr\tipaddr" por linha (ipaddr vazio quando XML tem pppoe/dhcp ou nao e IPv4).
list_pfsense_interface_roles() {
  local config_path
  config_path="$(pfsense_config_path)"
  if [ ! -f "$config_path" ] || ! command_exists php; then
    return 0
  fi
  PFSENSE_CONFIG_XML="$config_path" php -r '
    $configPath = getenv("PFSENSE_CONFIG_XML") ?: "/conf/config.xml";
    $config = @simplexml_load_file($configPath);
    if (!$config || !isset($config->interfaces)) {
      exit(0);
    }
    foreach ($config->interfaces->children() as $name => $node) {
      $if = trim((string) ($node->if ?? ""));
      if ($if === "") { continue; }
      $descr = trim((string) ($node->descr ?? ""));
      $ipaddr = trim((string) ($node->ipaddr ?? ""));
      if ($ipaddr !== "" && !preg_match("/^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$/", $ipaddr)) {
        $ipaddr = "";
      }
      echo $name . "\t" . $if . "\t" . $descr . "\t" . $ipaddr . "\n";
    }
  ' 2>/dev/null
}

# Retorna IP(s) interno(s): LAN + OPT (todas as interfaces exceto WAN), comma-separated. Variavel MGMT_IP sobrescreve.
# No painel aparecem em "IP(s) interno(s)".
detect_mgmt_ips() {
  if [ -n "${MGMT_IP:-}" ]; then
    printf '%s' "$MGMT_IP"
    return
  fi
  ensure_config_snapshot
  cached="$(config_snapshot_read_cached_ips mgmt_ips 2>/dev/null || true)"
  if [ -n "$cached" ]; then
    printf '%s' "$cached"
    return
  fi
  _tmp="/tmp/monitor_mgmt_$$"
  _roles_tmp="/tmp/monitor_mgmt_roles_$$"
  : > "$_tmp"
  list_pfsense_interface_roles 2>/dev/null > "$_roles_tmp" || true
  while IFS='	' read -r role ifname descr ipaddr_xml; do
    case "$role" in
      wan) continue ;;
      lan|opt*) ;;
      *) continue ;;
    esac
    if [ -n "$ipaddr_xml" ]; then
      ip="$ipaddr_xml"
    else
      ip="$(detect_interface_ipv4 "$ifname" 2>/dev/null)"
    fi
    [ -n "$ip" ] && echo "$ip" >> "$_tmp"
  done < "$_roles_tmp"
  rm -f "$_roles_tmp"
  if [ -s "$_tmp" ]; then
    paste -s -d ',' "$_tmp" 2>/dev/null || tr '\n' ',' < "$_tmp" | sed 's/,$//'
    rm -f "$_tmp"
    return
  fi
  rm -f "$_tmp"
  lan_if="$(read_pfsense_interface_name lan 2>/dev/null || true)"
  if [ -n "${lan_if:-}" ]; then
    detect_interface_ipv4 "$lan_if"
  fi
}

# Retorna IP(s) WAN: apenas a interface "wan" (sem opt*). No painel aparecem em "IP(s) publico(s) / WAN". Variavel WAN_IP_REPORTED sobrescreve.
detect_wan_ips() {
  if [ -n "${WAN_IP_REPORTED:-}" ]; then
    printf '%s' "$WAN_IP_REPORTED"
    return
  fi
  ensure_config_snapshot
  cached="$(config_snapshot_read_cached_ips wan_ips 2>/dev/null || true)"
  if [ -n "$cached" ]; then
    printf '%s' "$cached"
    return
  fi
  _tmp="/tmp/monitor_wan_$$"
  _roles_tmp="/tmp/monitor_wan_roles_$$"
  : > "$_tmp"
  list_pfsense_interface_roles 2>/dev/null > "$_roles_tmp" || true
  while IFS='	' read -r role ifname descr ipaddr_xml; do
    [ "$role" = "wan" ] || continue
    if [ -n "$ipaddr_xml" ]; then
      ip="$ipaddr_xml"
    else
      ip="$(detect_interface_ipv4 "$ifname" 2>/dev/null)"
    fi
    [ -n "$ip" ] && echo "$ip" >> "$_tmp"
  done < "$_roles_tmp"
  rm -f "$_roles_tmp"
  if [ -s "$_tmp" ]; then
    paste -s -d ',' "$_tmp" 2>/dev/null || tr '\n' ',' < "$_tmp" | sed 's/,$//'
    rm -f "$_tmp"
    return
  fi
  rm -f "$_tmp"
  wan_if="$(read_pfsense_interface_name wan 2>/dev/null || true)"
  if [ -z "${wan_if:-}" ]; then
    wan_if="$(detect_default_interface 2>/dev/null || true)"
  fi
  if [ -n "${wan_if:-}" ]; then
    detect_interface_ipv4 "$wan_if"
  fi
}

detect_mgmt_ip() {
  detect_mgmt_ips
}

detect_wan_ip() {
  detect_wan_ips
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

  # Primario (FreeBSD/pfSense): delta de kern.cp_time entre duas amostras.
  # kern.cp_time = user nice sys intr idle (idle = campo 5).
  if command_exists sysctl; then
    cpu_sample1="$(sysctl -n kern.cp_time 2>/dev/null || true)"
    if [ -n "$cpu_sample1" ]; then
      sleep 1
      cpu_sample2="$(sysctl -n kern.cp_time 2>/dev/null || true)"
      if [ -n "$cpu_sample2" ]; then
        cpu_value="$(printf '%s\n%s\n' "$cpu_sample1" "$cpu_sample2" | awk '
          NR == 1 { for (i = 1; i <= NF; i++) prev[i] = $i; n = NF }
          NR == 2 {
            total = 0; idle = 0
            for (i = 1; i <= n; i++) { d = $i - prev[i]; total += d; if (i == 5) idle = d }
            if (total > 0) { printf "%.2f", 100 * (total - idle) / total }
          }
        ')"
        if [ -n "$cpu_value" ]; then
          printf '%s' "$cpu_value"
          return
        fi
      fi
    fi
  fi

  # Fallback: top do FreeBSD usa -d (numero de displays), nao -n.
  if command_exists top; then
    top -b -d 1 2>/dev/null | awk '
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

# Retorna 0 se o serviço está habilitado no rc (para iniciar no boot); 1 caso contrário.
# Assim, quando status é stopped e o serviço não está enabled, reportamos not_installed (desativado pelo cliente).
service_is_enabled_in_rc() {
  local service_name="$1"
  if ! command_exists service; then
    return 0
  fi
  service "$service_name" enabled 2>/dev/null
}

# Serviços que podem estar ok com 0 clientes (ex.: OpenVPN server). Se a mensagem indicar "sem clientes", tratamos como running.
no_clients_message_pattern() {
  printf '%s' "$1" | grep -qiE 'no clients|0 clients|waiting for clients|nenhum cliente|aguardando clientes'
}

service_is_no_clients_only() {
  local service_name="$1"
  local status="$2"
  local message="$3"
  case "$(printf '%s' "$service_name" | tr '[:upper:]' '[:lower:]')" in
    openvpn|openvpn_server|openvpn_client) ;;
    openvpn:*) ;;
    *) return 1 ;;
  esac
  case "$status" in
    stopped|degraded) ;;
    *) return 1 ;;
  esac
  no_clients_message_pattern "$message"
}

# --- Monitoramento por túnel (OpenVPN, IPsec, WireGuard) ---
# Cada função imprime uma linha por túnel: name|status|message (name já no formato tipo:id)

list_openvpn_tunnel_status() {
  local openvpn_etc="${MONITOR_AGENT_OPENVPN_ETC:-/var/etc/openvpn}"
  local inst
  local status
  local msg
  if [ ! -d "$openvpn_etc" ]; then
    return 0
  fi
  {
    for conf in "$openvpn_etc"/*.conf; do
      [ -e "$conf" ] && basename "$conf" .conf
    done
    for sock in "$openvpn_etc"/*.sock; do
      [ -e "$sock" ] && basename "$sock" .sock
    done
  } 2>/dev/null | sort -u | while read -r inst; do
    [ -z "$inst" ] && continue
    if [ -S "$openvpn_etc/${inst}.sock" ] 2>/dev/null; then
      status="running"
      msg="management socket active"
    elif [ -f "$openvpn_etc/${inst}.conf" ] 2>/dev/null && pgrep -f "openvpn.*${inst}" >/dev/null 2>&1; then
      status="running"
      msg="process running"
    else
      status="stopped"
      msg="instance not running"
    fi
    printf 'openvpn:%s|%s|%s\n' "$inst" "$status" "$msg"
  done
}

# Lista descricoes Phase 1 do IPsec (conN -> Description, disabled) a partir do config do pfSense.
# Saida: uma linha por phase1 "con{ikeid}|{descr}|{0|1}" (1 = desativada na UI, nao conta como erro).
get_ipsec_phase1_descriptions() {
  local config_path
  config_path="$(pfsense_config_path)"
  if [ ! -f "$config_path" ] || ! command_exists php; then
    return 0
  fi
  PFSENSE_CONFIG_XML="$config_path" php -r '
    $configPath = getenv("PFSENSE_CONFIG_XML") ?: "/conf/config.xml";
    $config = @simplexml_load_file($configPath);
    if (!$config || !isset($config->ipsec->phase1)) {
      exit(0);
    }
    foreach ($config->ipsec->phase1 as $p1) {
      $ikeid = (string) ($p1->ikeid ?? "");
      $descr = (string) ($p1->descr ?? "");
      $disabled = isset($p1->disabled) ? "1" : "0";
      if ($ikeid !== "") {
        echo "con" . $ikeid . "|" . trim($descr) . "|" . $disabled . "\n";
      }
    }
  ' 2>/dev/null
}

list_ipsec_tunnel_status() {
  if command_exists swanctl 2>/dev/null; then
    # Lista TODAS as Phase 1 do config (conN|desc) para reportar running E stopped (tunel desativado = stopped, nao some)
    _ipsec_descr_file="/tmp/monitor_ipsec_descr_$$"
    _ipsec_est_file="/tmp/monitor_ipsec_est_$$"
    get_ipsec_phase1_descriptions > "$_ipsec_descr_file" 2>/dev/null

    # Conexoes estabelecidas: extrair apenas os nomes (con1, con2, ...) que aparecem como ESTABLISHED
    swanctl --list-sas 2>/dev/null | awk '
      /^[a-zA-Z0-9_.-]+:/ && !/^  / {
        conn = $1; gsub(/:$/, "", conn)
        if (conn != "bypass" && $0 ~ /ESTABLISHED|INSTALLED/) { print conn }
      }
    ' | sort -u > "$_ipsec_est_file" 2>/dev/null

    # Para cada Phase 1: disabled no config -> not_installed (cinza, sem falso positivo); senao running/stopped
    awk -v est_file="$_ipsec_est_file" '
      BEGIN {
        while ((getline line < est_file) > 0) { gsub(/\r/, "", line); established[line] = 1 }
        close(est_file)
      }
      {
        n = index($0, "|")
        if (n <= 0) { next }
        conn = substr($0, 1, n-1)
        rest = substr($0, n+1)
        gsub(/\r/, "", rest)
        n2 = index(rest, "|")
        if (n2 > 0) { msg = substr(rest, 1, n2-1); disabled = substr(rest, n2+1) }
        else { msg = rest; disabled = "0" }
        if (msg == "") { msg = "tunnel" }
        if (disabled == "1") {
          status = "not_installed"
          if (msg != "tunnel") { msg = msg " (desativado)" }
          else { msg = "desativado" }
        } else {
          status = (conn in established) ? "running" : "stopped"
        }
        print "ipsec:" conn "|" status "|" msg
      }
    ' "$_ipsec_descr_file"
    rm -f "$_ipsec_descr_file" "$_ipsec_est_file"
    return 0
  fi
  if command_exists strongswan 2>/dev/null; then
    strongswan status 2>/dev/null | awk '
      /^[a-zA-Z0-9_-]+\[/ { gsub(/\[.*/, ""); gsub(/:.*/, ""); conn=$0; next }
      conn && /ESTABLISHED|INSTALLED/ { print "ipsec:" conn "|running|established"; conn=""; next }
      conn && /./ { print "ipsec:" conn "|stopped|" $0; conn=""; next }
    '
  fi
  true
}

list_wireguard_tunnel_status() {
  local iface
  if command_exists wg 2>/dev/null; then
    wg show interfaces 2>/dev/null | while read -r iface; do
      [ -z "$iface" ] && continue
      if wg show "$iface" 2>/dev/null | grep -q .; then
        printf 'wireguard:%s|running|interface up\n' "$iface"
      else
        printf 'wireguard:%s|stopped|no handshake\n' "$iface"
      fi
    done
  fi
  true
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

append_service_json() {
  local first_item_ref="$1"
  local sname="$2"
  local sstatus="$3"
  local sdetail="$4"
  local impact="${5:-}"
  if [ "$(eval printf '%s' \"\$$first_item_ref\")" = "1" ]; then
    eval "$first_item_ref=\"0\""
  else
    printf ','
  fi
  if [ -n "$impact" ]; then
    printf '{"name":"%s","status":"%s","message":%s,"impact_on_status":"%s"}' \
      "$(json_escape "$sname")" \
      "$(json_escape "$sstatus")" \
      "$(json_nullable_string "$sdetail")" \
      "$(json_escape "$impact")"
  else
    printf '{"name":"%s","status":"%s","message":%s}' \
      "$(json_escape "$sname")" \
      "$(json_escape "$sstatus")" \
      "$(json_nullable_string "$sdetail")"
  fi
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

    case "$service_name" in
      openvpn)
        tunnel_list="$(list_openvpn_tunnel_status)"
        if [ -n "$tunnel_list" ]; then
          _tunf="/tmp/monitor_ovpn_$$"
          printf '%s\n' "$tunnel_list" > "$_tunf"
          while IFS='|' read -r tname tstatus tmsg; do
            [ -z "$tname" ] && continue
            service_detail="$(truncate_text "${tmsg}" 255)"
            if service_is_no_clients_only "$tname" "$tstatus" "$service_detail"; then
              tstatus="running"
              service_detail="running, 0 clients"
            fi
            append_service_json first_item "$tname" "$tstatus" "$service_detail" ""
          done < "$_tunf"
          rm -f "$_tunf"
        else
          service_state="$(detect_service_status "$service_name")"
          service_status="${service_state%%|*}"
          service_detail="$(truncate_text "${service_state#*|}" 255)"
          if [ "$service_status" = "stopped" ] && ! service_is_enabled_in_rc "$service_name"; then
            service_status="not_installed"
          fi
          if service_is_no_clients_only "$service_name" "$service_status" "$service_detail"; then
            service_status="running"
            service_detail="running, 0 clients"
          fi
          append_service_json first_item "$service_name" "$service_status" "$service_detail" ""
        fi
        continue
        ;;
      ipsec)
        tunnel_list="$(list_ipsec_tunnel_status)"
        if [ -n "$tunnel_list" ]; then
          _tunf="/tmp/monitor_ipsec_$$"
          printf '%s\n' "$tunnel_list" > "$_tunf"
          while IFS='|' read -r tname tstatus tmsg; do
            [ -z "$tname" ] && continue
            # Túnel sem SA não degrada o node (peer down / road warrior ocioso).
            append_service_json first_item "$tname" "$tstatus" "$(truncate_text "${tmsg}" 255)" "optional"
          done < "$_tunf"
          rm -f "$_tunf"
        else
          service_state="$(detect_service_status "$service_name")"
          service_status="${service_state%%|*}"
          service_detail="$(truncate_text "${service_state#*|}" 255)"
          if [ "$service_status" = "stopped" ] && ! service_is_enabled_in_rc "$service_name"; then
            service_status="not_installed"
          fi
          append_service_json first_item "$service_name" "$service_status" "$service_detail" "optional"
        fi
        continue
        ;;
      wireguard)
        tunnel_list="$(list_wireguard_tunnel_status)"
        if [ -n "$tunnel_list" ]; then
          _tunf="/tmp/monitor_wg_$$"
          printf '%s\n' "$tunnel_list" > "$_tunf"
          while IFS='|' read -r tname tstatus tmsg; do
            [ -z "$tname" ] && continue
            append_service_json first_item "$tname" "$tstatus" "$(truncate_text "${tmsg}" 255)" ""
          done < "$_tunf"
          rm -f "$_tunf"
        else
          service_state="$(detect_service_status "$service_name")"
          service_status="${service_state%%|*}"
          service_detail="$(truncate_text "${service_state#*|}" 255)"
          if [ "$service_status" = "stopped" ] && ! service_is_enabled_in_rc "$service_name"; then
            service_status="not_installed"
          fi
          append_service_json first_item "$service_name" "$service_status" "$service_detail" ""
        fi
        continue
        ;;
    esac

    service_state="$(detect_service_status "$service_name")"
    service_status="${service_state%%|*}"
    service_detail="$(truncate_text "${service_state#*|}" 255)"
    if [ "$service_status" = "stopped" ] && ! service_is_enabled_in_rc "$service_name"; then
      service_status="not_installed"
    fi
    if service_is_no_clients_only "$service_name" "$service_status" "$service_detail"; then
      service_status="running"
      service_detail="running, 0 clients"
    fi

    append_service_json first_item "$service_name" "$service_status" "$service_detail" ""
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
      if [ "$service_status" = "stopped" ] && ! service_is_enabled_in_rc "$rc_service"; then
        service_status="not_installed"
      fi
      if service_is_no_clients_only "$rc_service" "$service_status" "$service_detail"; then
        service_status="running"
        service_detail="running, 0 clients"
      fi
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

build_local_users_json() {
  helper="$SCRIPT_DIR/collect_local_users.php"
  config_path="$(pfsense_config_path)"
  if [ ! -f "$helper" ] || ! command_exists php; then
    printf '[]'
    return 0
  fi
  PFSENSE_CONFIG_XML="$config_path" \
    php -f "$helper" 2>/dev/null || printf '[]'
}

build_gateways_json() {
  helper="$SCRIPT_DIR/collect_gateways.php"
  if [ ! -f "$helper" ] || ! command_exists php; then
    printf '[]'
    return
  fi

  config_path="$(pfsense_config_path)"
  PFSENSE_CONFIG_XML="$config_path" php -f "$helper" 2>/dev/null || printf '[]'
}

build_interfaces_from_snapshot() {
  path="$(config_snapshot_path)"
  [ -f "$path" ] || return 1
  command_exists php || return 1

  php -r '
    $data = json_decode(file_get_contents($argv[1]), true);
    if (!is_array($data) || empty($data["interfaces"]) || !is_array($data["interfaces"])) {
      exit(1);
    }
    $items = [];
    foreach ($data["interfaces"] as $iface) {
      if (!is_array($iface)) {
        continue;
      }
      $name = trim((string) ($iface["name"] ?? ""));
      $role = trim((string) ($iface["role"] ?? ""));
      $ip = trim((string) ($iface["ip"] ?? ""));
      if ($name === "" && $role === "") {
        continue;
      }
      if ($name === "") {
        $name = $role;
      }
      if ($ip === "") {
        $ip = "n/a";
      }
      $entry = ["name" => $name, "ip" => $ip];
      if ($role !== "") {
        $entry["role"] = $role;
      }
      $items[] = $entry;
    }
    if (empty($items)) {
      exit(1);
    }
    echo json_encode($items, JSON_UNESCAPED_SLASHES);
  ' "$path" 2>/dev/null
}

# JSON array de interfaces com nome VISUAL (descr do pfSense). Se list_pfsense_interface_roles nao retornar nada, fallback: LAN + WAN a partir de mgmt/wan.
# Nota: evita pipe para subshell para garantir que o arquivo _tmp seja preenchido no mesmo processo (compatibilidade /bin/sh).
build_interfaces_json() {
  ensure_config_snapshot
  snapshot_json="$(build_interfaces_from_snapshot 2>/dev/null || true)"
  if [ -n "$snapshot_json" ]; then
    printf '%s' "$snapshot_json" | php -r '
      $items = json_decode(stream_get_contents(STDIN), true);
      if (!is_array($items) || empty($items)) {
        exit(1);
      }
      echo json_encode($items, JSON_UNESCAPED_SLASHES);
    ' 2>/dev/null && return
  fi

  _tmp="/tmp/monitor_if_$$"
  _roles_tmp="/tmp/monitor_if_roles_$$"
  : > "$_tmp"
  list_pfsense_interface_roles 2>/dev/null > "$_roles_tmp" || true
  while IFS='	' read -r role ifname descr ipaddr_xml; do
    [ -n "$ifname" ] || continue
    if [ -n "$ipaddr_xml" ]; then
      ip="$ipaddr_xml"
    else
      ip="$(detect_interface_ipv4 "$ifname" 2>/dev/null)"
    fi
    [ -n "$ip" ] || ip="n/a"
    display_name="$descr"
    [ -n "$display_name" ] || display_name="$role"
    [ -n "$display_name" ] || display_name="$ifname"
    printf '{"name":"%s","ip":"%s","role":"%s"}\n' "$(json_escape "$display_name")" "$(json_escape "$ip")" "$(json_escape "$role")" >> "$_tmp"
  done < "$_roles_tmp"
  rm -f "$_roles_tmp"
  if [ -s "$_tmp" ]; then
    printf '['
    first=1
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      [ "$first" = 1 ] || printf ','
      printf '%s' "$line"
      first=0
    done < "$_tmp"
    printf ']'
    rm -f "$_tmp"
    return
  fi
  rm -f "$_tmp"
  # Fallback: quando config/php nao retornam interfaces (ex.: agente sem acesso ao config), montar LAN + WAN a partir dos detectores
  _mgmt="$(detect_mgmt_ip 2>/dev/null || true)"
  _wan="$(detect_wan_ip 2>/dev/null || true)"
  _first=1
  printf '['
  if [ -n "$_mgmt" ]; then
    printf '{"name":"LAN","ip":"%s"}' "$(json_escape "$_mgmt")"
    _first=0
  fi
  if [ -n "$_wan" ]; then
    [ "$_first" = 1 ] || printf ','
    printf '{"name":"WAN","ip":"%s"}' "$(json_escape "$_wan")"
  fi
  printf ']'
}

append_pfsense_update_json_fields() {
  state_file="$(backup_state_dir)/pfsense-update-check.json"
  if [ ! -f "$state_file" ]; then
    printf ',\n  "ha_detected": false'
    return
  fi

  php -r '
    $data = json_decode(file_get_contents($argv[1]), true);
    if (!is_array($data)) {
      echo ",\n  \"ha_detected\": false";
      exit(0);
    }
    $available = $data["available"] ?? null;
    if ($available === true) {
      $availableJson = "true";
    } elseif ($available === false) {
      $availableJson = "false";
    } else {
      $availableJson = "null";
    }
    $target = trim((string) ($data["target_version"] ?? ""));
    $checked = trim((string) ($data["checked_at"] ?? ""));
    $error = trim((string) ($data["check_error"] ?? ""));
    $ha = !empty($data["ha_detected"]);
    echo ",\n  \"pfsense_update_available\": " . $availableJson;
    if ($target !== "") {
      echo ",\n  \"pfsense_update_target_version\": \"" . addslashes($target) . "\"";
    }
    if ($checked !== "") {
      echo ",\n  \"pfsense_update_checked_at\": \"" . addslashes($checked) . "\"";
    }
    if ($error !== "") {
      echo ",\n  \"pfsense_update_check_error\": \"" . addslashes($error) . "\"";
    }
    echo ",\n  \"ha_detected\": " . ($ha ? "true" : "false");
  ' "$state_file" 2>/dev/null || printf ',\n  "ha_detected": false'
}

# v5+: pfSense-upgrade -u antes do -c. Nao rodar no build_payload — -u pode
# levar minutos e estourar o HTTP do heartbeat.
PFSENSE_UPDATE_FORCE_THROTTLE_SEC=600

run_pfsense_update_check() {
  return 0
}

pfsense_update_force_stamp() {
  printf '%s' "$(backup_state_dir)/pfsense-update-force.stamp"
}

pfsense_update_force_throttled() {
  stamp="$(pfsense_update_force_stamp)"
  [ -f "$stamp" ] || return 1
  last="$(tr -cd '0-9' <"$stamp" | head -c 12)"
  [ -n "$last" ] || return 1
  now="$(date -u +%s)"
  [ $((now - last)) -lt "$PFSENSE_UPDATE_FORCE_THROTTLE_SEC" ]
}

pfsense_update_mark_force_ran() {
  mkdir -p "$(backup_state_dir)" 2>/dev/null || true
  printf '%s\n' "$(date -u +%s)" >"$(pfsense_update_force_stamp)" 2>/dev/null || true
}

heartbeat_force_update_check_requested() {
  response_file="$1"
  command_exists php || return 1
  [ -f "$response_file" ] || return 1
  force="$(php -r '
    $payload = json_decode(@file_get_contents($argv[1]), true);
    if (!is_array($payload)) {
      echo "0";
      exit(0);
    }
    echo !empty($payload["force_update_check"]) ? "1" : "0";
  ' "$response_file" 2>/dev/null || printf '0')"
  [ "$force" = "1" ]
}

maybe_run_deferred_pfsense_update_check() {
  response_file="$1"
  helper="$SCRIPT_DIR/check_pfsense_update_available.sh"
  [ -x "$helper" ] || return 0

  if heartbeat_force_update_check_requested "$response_file"; then
    if pfsense_update_force_throttled; then
      echo "heartbeat: force_update_check throttled" >&2
      return 0
    fi
    echo "heartbeat: force_update_check — refreshing pfSense repositories" >&2
    "$helper" force-check >/dev/null 2>&1 || true
    pfsense_update_mark_force_ran
    return 0
  fi

  if "$helper" needed >/dev/null 2>&1; then
    echo "heartbeat: deferred pfSense update check (repo refresh + -c)" >&2
    "$helper" check >/dev/null 2>&1 || true
  fi
}

pfsense_upgrade_state_file() {
  printf '%s' "$(backup_state_dir)/pfsense-upgrade-pending.json"
}

pfsense_upgrade_lock_dir() {
  printf '%s' "/var/run/monitor-pfsense-agent-upgrade.lock"
}

package_upgrade_lock_file() {
  printf '%s' "/var/run/monitor-pfsense-package-upgrade.lock"
}

package_upgrade_state_file() {
  printf '%s' "$(backup_state_dir)/package-upgrade-pending.json"
}

package_upgrade_lock_active() {
  lock_file="$(package_upgrade_lock_file)"
  if [ ! -f "$lock_file" ]; then
    return 1
  fi
  lock_pid=""
  while IFS='=' read -r key value; do
    case "$key" in
      pid) lock_pid="$value" ;;
    esac
  done <"$lock_file" 2>/dev/null || true
  if [ -n "$lock_pid" ] && agent_lock_pid_alive "$lock_pid"; then
    return 0
  fi
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -f "install-from-release.sh.*monitor-pfsense-package" >/dev/null 2>&1 && return 0
    pgrep -f "run_package_upgrade.sh" >/dev/null 2>&1 && return 0
  fi
  return 1
}

package_upgrade_url_allowed() {
  url="$1"
  require_var CONTROLLER_URL
  controller_url="${CONTROLLER_URL%/}"

  php -r '
    $url = trim((string) $argv[1]);
    $controller = rtrim(trim((string) $argv[2]), "/");
    if ($url === "" || $controller === "") { exit(1); }
    $parsed = parse_url($url);
    if (!is_array($parsed) || empty($parsed["host"])) { exit(1); }
    if (strpos($url, $controller . "/") === 0) { exit(0); }
    $parsedController = parse_url($controller);
    $controllerHost = trim((string) ($parsedController["host"] ?? ""));
    if ($controllerHost !== "" && strcasecmp($parsed["host"], $controllerHost) === 0) { exit(0); }
    $repoPath = "/pablomichelin/pfsense-monitor-agent/";
    foreach (array("raw.githubusercontent.com", "github.com") as $host) {
      if (strcasecmp($parsed["host"], $host) === 0
        && stripos((string) ($parsed["path"] ?? ""), $repoPath) === 0) {
        exit(0);
      }
    }
    exit(1);
  ' "$url" "$controller_url"
}

dispatch_package_upgrade() {
  command_id="$1"
  target_version="$2"
  artifact_url="$3"
  sha256="$4"
  CURL_CMD="$5"

  if [ -z "$artifact_url" ] || [ -z "$sha256" ]; then
    agent_post_command_result_failed \
      "$command_id" \
      "package_upgrade payload missing artifact_url or sha256" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  if ! package_upgrade_url_allowed "$artifact_url"; then
    agent_post_command_result_failed \
      "$command_id" \
      "artifact URL not allowed" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  # Reentrega do mesmo comando (ex.: heartbeat do serviço reiniciado durante o
  # upgrade em andamento): ignora silenciosamente — o wrapper original posta o
  # resultado. Sem isso, o dedup falharia com "another package upgrade is
  # running" e sobrescreveria o sucesso real (doc 140).
  pending_state_file="$(package_upgrade_state_file)"
  if [ -f "$pending_state_file" ]; then
    active_upgrade_command_id="$(php -r '
      $data = json_decode(@file_get_contents($argv[1]), true);
      echo is_array($data) ? trim((string) ($data["command_id"] ?? "")) : "";
    ' "$pending_state_file" 2>/dev/null || true)"
    if [ -n "$active_upgrade_command_id" ] \
      && [ "$active_upgrade_command_id" = "$command_id" ] \
      && package_upgrade_lock_active; then
      return 0
    fi
  fi

  if package_upgrade_lock_active; then
    agent_post_command_result_failed \
      "$command_id" \
      "another package upgrade is running" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  agent_post_command_ack "$command_id" "picked_up" "$CURL_CMD" >/dev/null 2>&1 || true
  agent_post_command_ack "$command_id" "running" "$CURL_CMD" >/dev/null 2>&1 || true

  backup_ensure_state_dir
  state_file="$(package_upgrade_state_file)"
  printf '{"command_id":"%s","target_version":"%s","artifact_url":"%s","sha256":"%s","started_at":"%s","status":"running"}\n' \
    "$(json_escape "$command_id")" \
    "$(json_escape "$target_version")" \
    "$(json_escape "$artifact_url")" \
    "$(json_escape "$sha256")" \
    "$(json_escape "$(iso_now)")" >"$state_file"

  wrapper="$SCRIPT_DIR/run_package_upgrade.sh"
  if [ ! -f "$wrapper" ]; then
    agent_post_command_result_failed "$command_id" "run_package_upgrade.sh missing" "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file"
    return 1
  fi
  chmod +x "$wrapper" 2>/dev/null || true

  upgrade_log="/var/log/monitor-pfsense-package-upgrade.log"
  nohup "$wrapper" "$command_id" "$target_version" "$artifact_url" "$sha256" "$state_file" "$CURL_CMD" >>"$upgrade_log" 2>&1 &
  wrapper_pid=$!

  if ! kill -0 "$wrapper_pid" 2>/dev/null; then
    agent_post_command_result_failed "$command_id" "failed to spawn package upgrade wrapper" "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file"
    return 1
  fi

  return 0
}

AGENT_BACKUP_LOCK_STALE_SECONDS="${AGENT_BACKUP_LOCK_STALE_SECONDS:-3600}"
AGENT_UPGRADE_LOCK_STALE_SECONDS="${AGENT_UPGRADE_LOCK_STALE_SECONDS:-7200}"

agent_lock_pid_alive() {
  lock_pid="$1"
  [ -n "$lock_pid" ] || return 1
  kill -0 "$lock_pid" 2>/dev/null
}

agent_read_stale_lock() {
  lock_file="$1"
  pid=""
  started_at=""
  if [ ! -f "$lock_file" ]; then
    return 1
  fi
  while IFS='=' read -r key value; do
    case "$key" in
      pid) pid="$value" ;;
      started_at) started_at="$value" ;;
    esac
  done <"$lock_file" 2>/dev/null || true
  printf '%s %s\n' "$pid" "$started_at"
}

# POSIX sh: evita here-string bash (<<<) incompatível com /bin/sh do pfSense.
agent_read_stale_lock_fields() {
  lock_file="$1"
  lock_pid=""
  lock_started=""
  read -r lock_pid lock_started <<EOF
$(agent_read_stale_lock "$lock_file" 2>/dev/null || true)
EOF
}

agent_acquire_stale_lock() {
  lock_file="$1"
  ttl="$2"
  label="${3:-lock}"

  if [ -f "$lock_file" ]; then
    agent_read_stale_lock_fields "$lock_file"
    now="$(date +%s)"
    lock_age=999999
    if [ -n "$lock_started" ] && [ "$lock_started" -gt 0 ] 2>/dev/null; then
      lock_age=$((now - lock_started))
    fi
    if agent_lock_pid_alive "$lock_pid" && [ "$lock_age" -lt "$ttl" ]; then
      echo "${label}: another operation is running (pid=${lock_pid})" >&2
      return 1
    fi
    rm -f "$lock_file" 2>/dev/null || true
  fi

  if (set -C; umask 077; printf 'pid=%s\nstarted_at=%s\n' "$$" "$(date +%s)" >"$lock_file") 2>/dev/null; then
    umask 022
    return 0
  fi

  echo "${label}: failed to acquire lock" >&2
  return 1
}

agent_release_stale_lock() {
  rm -f "$1" 2>/dev/null || true
}

agent_upgrade_lock_active() {
  lock_file="$(pfsense_upgrade_lock_dir)"
  if [ ! -f "$lock_file" ]; then
    return 1
  fi

  agent_read_stale_lock_fields "$lock_file"
  now="$(date +%s)"
  lock_age=999999
  if [ -n "$lock_started" ] && [ "$lock_started" -gt 0 ] 2>/dev/null; then
    lock_age=$((now - lock_started))
  fi

  if agent_lock_pid_alive "$lock_pid" && [ "$lock_age" -lt "$AGENT_UPGRADE_LOCK_STALE_SECONDS" ]; then
    return 0
  fi

  return 1
}

agent_cleanup_stale_locks() {
  if [ -f "$(backup_lock_dir)" ]; then
    agent_read_stale_lock_fields "$(backup_lock_dir)"
    backup_pid=$lock_pid
    backup_started=$lock_started
    now="$(date +%s)"
    backup_age=999999
    if [ -n "$backup_started" ] && [ "$backup_started" -gt 0 ] 2>/dev/null; then
      backup_age=$((now - backup_started))
    fi
    if ! agent_lock_pid_alive "$backup_pid" || [ "$backup_age" -ge "$AGENT_BACKUP_LOCK_STALE_SECONDS" ]; then
      agent_release_stale_lock "$(backup_lock_dir)"
    fi
  fi
  if [ -f "$(pfsense_upgrade_lock_dir)" ]; then
    agent_read_stale_lock_fields "$(pfsense_upgrade_lock_dir)"
    upgrade_pid=$lock_pid
    upgrade_started=$lock_started
    now="$(date +%s)"
    upgrade_age=999999
    if [ -n "$upgrade_started" ] && [ "$upgrade_started" -gt 0 ] 2>/dev/null; then
      upgrade_age=$((now - upgrade_started))
    fi
    if ! agent_lock_pid_alive "$upgrade_pid" || [ "$upgrade_age" -ge "$AGENT_UPGRADE_LOCK_STALE_SECONDS" ]; then
      agent_release_stale_lock "$(pfsense_upgrade_lock_dir)"
    fi
  fi
}

agent_post_command_ack() {
  backup_post_command_ack "$@"
}

agent_post_command_result_failed() {
  backup_post_command_failed "$@"
}

agent_post_command_result_succeeded() {
  command_id="$1"
  result_json="$2"
  CURL_CMD="$3"
  body_file="$(mktemp)"
  trap 'rm -f "$body_file"' EXIT INT TERM
  if [ -n "$result_json" ]; then
    printf '{"command_id":"%s","status":"succeeded","result_json":%s}\n' \
      "$(json_escape "$command_id")" \
      "$result_json" >"$body_file"
  else
    printf '{"command_id":"%s","status":"succeeded"}\n' \
      "$(json_escape "$command_id")" >"$body_file"
  fi
  backup_post_signed_json "/api/v1/ingest/command-result" "$body_file" "$CURL_CMD"
}

pfsense_upgrade_ha_detected() {
  state_file="$(backup_state_dir)/pfsense-update-check.json"
  if [ ! -f "$state_file" ]; then
    return 1
  fi

  ha="$(php -r '
    $data = json_decode(@file_get_contents($argv[1]), true);
    if (!is_array($data)) {
      exit(1);
    }
    echo !empty($data["ha_detected"]) ? "1" : "0";
  ' "$state_file" 2>/dev/null || printf '0')"

  [ "$ha" = "1" ]
}

pfsense_upgrade_cached_target_version() {
  state_file="$(backup_state_dir)/pfsense-update-check.json"
  if [ ! -f "$state_file" ]; then
    return 0
  fi

  php -r '
    $data = json_decode(@file_get_contents($argv[1]), true);
    if (!is_array($data)) {
      exit(0);
    }
    echo trim((string) ($data["target_version"] ?? ""));
  ' "$state_file" 2>/dev/null || true
}

dispatch_pfsense_upgrade() {
  command_id="$1"
  target_version="$2"
  CURL_CMD="$3"

  if pfsense_upgrade_ha_detected; then
    agent_post_command_result_failed \
      "$command_id" \
      "HA/CARP detected; pfSense OS upgrade blocked on this node" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  disk_percent="$(detect_disk_percent 2>/dev/null || true)"
  if [ -n "$disk_percent" ] && [ "$disk_percent" -ge 90 ] 2>/dev/null; then
    agent_post_command_result_failed \
      "$command_id" \
      "Insufficient disk space for upgrade (${disk_percent}% used on /)" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  if [ -n "$target_version" ]; then
    cached_target="$(pfsense_upgrade_cached_target_version 2>/dev/null || true)"
    if [ -n "$cached_target" ] && [ "$cached_target" != "$target_version" ]; then
      agent_post_command_result_failed \
        "$command_id" \
        "target_version mismatch (requested ${target_version}, cache ${cached_target})" \
        "$CURL_CMD" >/dev/null 2>&1 || true
      return 1
    fi
  fi

  if agent_upgrade_lock_active; then
    agent_post_command_result_failed "$command_id" "another upgrade is running" "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  agent_post_command_ack "$command_id" "picked_up" "$CURL_CMD" >/dev/null 2>&1 || true
  agent_post_command_ack "$command_id" "running" "$CURL_CMD" >/dev/null 2>&1 || true

  backup_ensure_state_dir
  state_file="$(pfsense_upgrade_state_file)"
  printf '{"command_id":"%s","target_version":"%s","started_at":"%s","status":"running","exec_enabled":"%s"}\n' \
    "$(json_escape "$command_id")" \
    "$(json_escape "$target_version")" \
    "$(json_escape "$(iso_now)")" \
    "$(json_escape "${MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED:-0}")" >"$state_file"

  wrapper="$SCRIPT_DIR/run_pfsense_upgrade.sh"
  if [ ! -f "$wrapper" ]; then
    agent_post_command_result_failed "$command_id" "run_pfsense_upgrade.sh missing" "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file"
    return 1
  fi
  chmod +x "$wrapper" 2>/dev/null || true

  nohup "$wrapper" "$command_id" "$target_version" "$state_file" >>/var/log/monitor-pfsense-agent-upgrade.log 2>&1 &
  wrapper_pid=$!

  if ! kill -0 "$wrapper_pid" 2>/dev/null; then
    agent_post_command_result_failed "$command_id" "failed to spawn upgrade wrapper" "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file"
    agent_release_stale_lock "$(pfsense_upgrade_lock_dir)"
    return 1
  fi

  # Semi-manual (default): ack running, state retained until reboot finalize — no immediate failed.
  return 0
}

finalize_pfsense_upgrade_if_pending() {
  CURL_CMD=""
  if ! resolve_curl_cmd >/dev/null 2>&1; then
    return 0
  fi
  CURL_CMD="$(resolve_curl_cmd)"

  state_file="$(pfsense_upgrade_state_file)"
  if [ ! -f "$state_file" ]; then
    return 0
  fi

  parsed="$(php -r '
    $data = json_decode(file_get_contents($argv[1]), true);
    if (!is_array($data)) {
      exit(1);
    }
    $commandId = trim((string) ($data["command_id"] ?? ""));
    if ($commandId === "") {
      exit(1);
    }
    echo $commandId;
  ' "$state_file" 2>/dev/null)" || return 0

  [ -n "$parsed" ] || return 0

  state_meta="$(php -r '
    $data = json_decode(@file_get_contents($argv[1]), true);
    if (!is_array($data)) {
      exit(0);
    }
    echo trim((string) ($data["status"] ?? "")) . "\n";
    echo trim((string) ($data["target_version"] ?? "")) . "\n";
    echo trim((string) ($data["started_at"] ?? "")) . "\n";
  ' "$state_file" 2>/dev/null || true)"

  status="$(printf '%s\n' "$state_meta" | sed -n '1p')"
  state_target_version="$(printf '%s\n' "$state_meta" | sed -n '2p')"
  started_at="$(printf '%s\n' "$state_meta" | sed -n '3p')"

  log_file="/conf/upgrade_log.latest.txt"
  new_version="$(detect_pfsense_version 2>/dev/null || true)"

  if [ "$status" = "failed" ]; then
    fail_msg="$(php -r '
      $data = json_decode(@file_get_contents($argv[1]), true);
      if (!is_array($data)) { exit(0); }
      echo trim((string) ($data["message"] ?? "pfSense OS upgrade failed"));
    ' "$state_file" 2>/dev/null || true)"
    agent_post_command_result_failed "$parsed" "${fail_msg:-pfSense OS upgrade failed}" "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file"
    agent_release_stale_lock "$(pfsense_upgrade_lock_dir)"
    return 0
  fi

  upgrade_version_matches_target() {
    [ -n "$state_target_version" ] && [ -n "$new_version" ] && [ "$new_version" = "$state_target_version" ]
  }

  if upgrade_version_matches_target; then
    excerpt=""
    if [ -f "$log_file" ]; then
      excerpt="$(tail -n 20 "$log_file" | tr '\n' ' ')"
    fi
    finalize_label="$status"
    if [ "$status" = "prepared_manual_confirm" ]; then
      finalize_label="completed_after_manual_confirm"
    elif [ "$status" = "executing" ] || [ "$status" = "rebooting" ]; then
      finalize_label="completed_after_reboot"
    fi
    agent_post_command_result_succeeded "$parsed" \
      "{\"target_version\":\"$(json_escape "$state_target_version")\",\"new_version\":\"$(json_escape "$new_version")\",\"started_at\":\"$(json_escape "$started_at")\",\"log_excerpt\":\"$(json_escape "$excerpt")\",\"finalize_status\":\"$(json_escape "$finalize_label")\"}" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file"
    agent_release_stale_lock "$(pfsense_upgrade_lock_dir)"
    return 0
  fi

  case "$status" in
    executing|rebooting|prepared_manual_confirm|running)
      return 0
      ;;
  esac

  if [ -f "$log_file" ] && [ -n "$state_target_version" ] && [ "$new_version" != "$state_target_version" ]; then
    agent_post_command_result_failed "$parsed" \
      "upgrade finished but version is ${new_version:-unknown} (expected ${state_target_version})" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file"
    agent_release_stale_lock "$(pfsense_upgrade_lock_dir)"
    return 0
  fi

  if [ "$status" != "prepared_manual_confirm" ] && [ ! -f "$log_file" ]; then
    agent_post_command_result_failed "$parsed" "upgrade finished without upgrade log" "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file"
    agent_release_stale_lock "$(pfsense_upgrade_lock_dir)"
  fi
}

certificates_collection_enabled() {
  enabled="${MONITOR_AGENT_CERTIFICATES_ENABLED:-0}"
  case "$enabled" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

build_certificates_json() {
  if ! certificates_collection_enabled; then
    printf '[]'
    return 0
  fi

  if ! command_exists php; then
    printf '[]'
    return 0
  fi

  config_path="$(pfsense_config_path)"
  if [ ! -f "$config_path" ]; then
    printf '[]'
    return 0
  fi

  PFSENSE_CONFIG_XML="$config_path" php -r '
    function pem_from_pfsense_crt(string $crt): ?string {
      $crt = trim($crt);
      if ($crt === "") {
        return null;
      }
      if (strpos($crt, "-----BEGIN") !== false) {
        return $crt;
      }
      $decoded = base64_decode($crt, true);
      if ($decoded === false) {
        return null;
      }
      if (strpos($decoded, "-----BEGIN") !== false) {
        return $decoded;
      }
      return "-----BEGIN CERTIFICATE-----\n"
        . chunk_split(base64_encode($decoded), 64, "\n")
        . "-----END CERTIFICATE-----\n";
    }

    function dn_to_string(array $parts): string {
      $chunks = [];
      foreach ($parts as $key => $value) {
        if (is_array($value)) {
          $value = implode(", ", $value);
        }
        $chunks[] = strtoupper((string) $key) . "=" . (string) $value;
      }
      return implode(", ", $chunks);
    }

    function cert_metadata(string $pem, string $certKey, string $usage): ?array {
      $x509 = @openssl_x509_read($pem);
      if ($x509 === false) {
        return null;
      }
      $parsed = @openssl_x509_parse($x509);
      if (!is_array($parsed)) {
        return null;
      }
      $subject = isset($parsed["subject"]) ? dn_to_string($parsed["subject"]) : "unknown";
      $issuer = isset($parsed["issuer"]) ? dn_to_string($parsed["issuer"]) : null;
      $notBefore = gmdate("c", (int) ($parsed["validFrom_time_t"] ?? 0));
      $notAfter = gmdate("c", (int) ($parsed["validTo_time_t"] ?? 0));
      if (($parsed["validTo_time_t"] ?? 0) <= 0) {
        return null;
      }
      return [
        "cert_key" => $certKey,
        "subject" => $subject,
        "issuer" => $issuer,
        "not_before" => $notBefore,
        "not_after" => $notAfter,
        "usage" => $usage,
      ];
    }

    function append_cert(array &$items, array $seen, ?array $entry): array {
      if ($entry === null) {
        return $seen;
      }
      $key = (string) ($entry["cert_key"] ?? "");
      if ($key === "" || isset($seen[$key])) {
        return $seen;
      }
      $seen[$key] = true;
      $items[] = $entry;
      return $seen;
    }

    $configPath = getenv("PFSENSE_CONFIG_XML") ?: "/conf/config.xml";
    $config = @simplexml_load_file($configPath);
    if (!$config) {
      echo "[]";
      exit(0);
    }

    $items = [];
    $seen = [];

    foreach (($config->cert ?? []) as $cert) {
      $refid = trim((string) ($cert->refid ?? ""));
      $descr = trim((string) ($cert->descr ?? "certificate"));
      $type = trim((string) ($cert->type ?? ""));
      $usage = $descr;
      if ($type !== "") {
        $usage = $descr . " (" . $type . ")";
      }
      $pem = pem_from_pfsense_crt((string) ($cert->crt ?? ""));
      if ($pem === null) {
        continue;
      }
      $certKey = $refid !== "" ? "cert:" . $refid : "cert:" . substr(hash("sha256", $pem), 0, 16);
      $seen = append_cert($items, $seen, cert_metadata($pem, $certKey, $usage));
    }

    foreach (($config->ca ?? []) as $ca) {
      $refid = trim((string) ($ca->refid ?? ""));
      $descr = trim((string) ($ca->descr ?? "CA"));
      $pem = pem_from_pfsense_crt((string) ($ca->crt ?? ""));
      if ($pem === null) {
        continue;
      }
      $certKey = $refid !== "" ? "ca:" . $refid : "ca:" . substr(hash("sha256", $pem), 0, 16);
      $seen = append_cert($items, $seen, cert_metadata($pem, $certKey, $descr . " (CA)"));
    }

    $webPaths = ["/var/etc/cert.pem", "/usr/local/etc/ssl/cert.pem"];
    foreach ($webPaths as $webPath) {
      if (!is_readable($webPath)) {
        continue;
      }
      $pem = trim((string) file_get_contents($webPath));
      if ($pem === "") {
        continue;
      }
      $certKey = "system:" . substr(hash("sha256", $pem), 0, 16);
      $seen = append_cert($items, $seen, cert_metadata($pem, $certKey, "Web GUI (system)"));
      break;
    }

    echo json_encode($items, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  ' 2>/dev/null || printf '[]'
}

capabilities_collection_enabled() {
  enabled="${MONITOR_AGENT_CAPABILITIES_ENABLED:-0}"
  case "$enabled" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

build_capabilities_json() {
  if ! capabilities_collection_enabled; then
    printf '{}'
    return 0
  fi

  pfrest_enabled="null"
  pfrest_version=""
  api_base_url=""

  if command_exists pkg; then
    if pkg info -e pfSense-restapi 2>/dev/null; then
      pfrest_enabled="true"
      pfrest_version="$(pkg info -q pfSense-restapi 2>/dev/null | head -n 1 || true)"
    else
      pfrest_enabled="false"
    fi
  fi

  mgmt_ip="$(detect_mgmt_ip 2>/dev/null || true)"
  if [ -n "$mgmt_ip" ]; then
    first_ip="$(printf '%s' "$mgmt_ip" | cut -d',' -f1 | tr -d ' ')"
    if [ -n "$first_ip" ]; then
      api_base_url="https://${first_ip}"
    fi
  fi

  modules_json='[]'
  if [ "$pfrest_enabled" = "true" ]; then
    modules_json='["pfrest","aliases"]'
  fi

  cat <<EOF
{
  "pfrest_enabled": $pfrest_enabled,
  "pfrest_version": "$(json_escape "$pfrest_version")",
  "api_base_url": $(json_nullable_string "$api_base_url"),
  "access_mode": "agent",
  "auth_method": "api_key",
  "modules": $modules_json
}
EOF
}

build_config_backup_json_fields() {
  if backup_is_enabled; then
    mode="${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_MODE:-hours}"
    interval_hours="${MONITOR_AGENT_CONFIG_BACKUP_INTERVAL_HOURS:-24}"
    schedule_time="${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_TIME:-03:00}"
    schedule_dow="${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_DOW:-1}"
    schedule_dom="${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_DOM:-1}"
    printf ',
  "config_backup": {
    "enabled": true,
    "schedule_mode": "%s",
    "interval_hours": %s,
    "schedule_time": "%s",
    "schedule_dow": %s,
    "schedule_dom": %s
  }' \
      "$(json_escape "$mode")" \
      "$(json_escape "$interval_hours")" \
      "$(json_escape "$schedule_time")" \
      "$(json_escape "$schedule_dow")" \
      "$(json_escape "$schedule_dom")"
    return 0
  fi

  printf ',
  "config_backup": {
    "enabled": false
  }'
}

build_payload() {
  run_pfsense_update_check
  update_fields="$(append_pfsense_update_json_fields 2>/dev/null || printf ',\n  "ha_detected": false')"
  config_backup_fields="$(build_config_backup_json_fields 2>/dev/null || true)"
  mgmt_ip="$(detect_mgmt_ip 2>/dev/null || true)"
  wan_ip="$(detect_wan_ip 2>/dev/null || true)"
  interfaces_json="$(build_interfaces_json 2>/dev/null)" || interfaces_json="[]"
  # Garantir que ao menos LAN/WAN apareçam no painel quando temos mgmt_ip ou wan_ip (fallback se build_interfaces_json falhar ou retornar vazio)
  if [ "$interfaces_json" = "[]" ] && { [ -n "$mgmt_ip" ] || [ -n "$wan_ip" ]; }; then
    _first=1
    interfaces_json="["
    if [ -n "$mgmt_ip" ]; then
      interfaces_json="${interfaces_json}{\"name\":\"LAN\",\"ip\":\"$(json_escape "$mgmt_ip")\",\"role\":\"lan\"}"
      _first=0
    fi
    if [ -n "$wan_ip" ]; then
      [ "$_first" = 1 ] || interfaces_json="${interfaces_json},"
      interfaces_json="${interfaces_json}{\"name\":\"WAN\",\"ip\":\"$(json_escape "$wan_ip")\",\"role\":\"wan\"}"
    fi
    interfaces_json="${interfaces_json}]"
  fi
  pfsense_version="$(detect_pfsense_version 2>/dev/null)" || pfsense_version="unknown"
  uptime_seconds="$(detect_uptime_seconds 2>/dev/null)" || uptime_seconds="0"
  cpu_percent="$(detect_cpu_percent 2>/dev/null || true)"
  memory_percent="$(detect_memory_percent 2>/dev/null || true)"
  disk_percent="$(detect_disk_percent 2>/dev/null || true)"
  heartbeat_id="${NODE_UID}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  sent_at="$(iso_now)"
  # Heartbeat leve: envia apenas dados essenciais; a API mantem ultimo estado de gateways/servicos (reduz carga).
  # Apos recovery ou N light bem-sucedidos, envia um heartbeat normal para recalcular status no controlador.
  light="${MONITOR_AGENT_LIGHT_HEARTBEAT:-0}"
  if [ "$light" = "1" ] || [ "$light" = "true" ] || [ "$light" = "yes" ]; then
    if light_heartbeat_should_send_normal; then
      light="0"
    fi
  fi
  if [ "$light" = "1" ] || [ "$light" = "true" ] || [ "$light" = "yes" ]; then
    services_json=""
    gateways_json=""
  else
    services_json="$(build_services_json 2>/dev/null)" || services_json="[]"
    gateways_json="$(build_gateways_json 2>/dev/null)" || gateways_json="[]"
  fi

  certificates_json=""
  if [ "$light" != "1" ] && [ "$light" != "true" ] && [ "$light" != "yes" ]; then
    if certificates_collection_enabled; then
      certificates_json="$(build_certificates_json 2>/dev/null)" || certificates_json="[]"
    fi
  fi

  capabilities_json=""
  if [ "$light" != "1" ] && [ "$light" != "true" ] && [ "$light" != "yes" ]; then
    if capabilities_collection_enabled; then
      capabilities_json="$(build_capabilities_json 2>/dev/null)" || capabilities_json=""
    fi
  fi

  local_users_json=""
  if [ "$light" != "1" ] && [ "$light" != "true" ] && [ "$light" != "yes" ]; then
    local_users_json="$(build_local_users_json 2>/dev/null)" || local_users_json="[]"
  fi

  if [ -n "${MONITOR_AGENT_NOTICES:-}" ]; then
    notices_json="$(json_string_array "$MONITOR_AGENT_NOTICES")"
  else
    notices_json='[]'
  fi

  if [ -n "$services_json" ]; then
    cert_field=""
    if [ -n "$certificates_json" ]; then
      cert_field=$(printf ',
  "certificates": %s' "$certificates_json")
    fi
    cap_field=""
    if [ -n "$capabilities_json" ]; then
      cap_field=$(printf ',
  "capabilities": %s' "$capabilities_json")
    fi
    local_users_field=""
    if [ -n "$local_users_json" ]; then
      local_users_field=$(printf ',
  "local_users": %s' "$local_users_json")
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
  "interfaces": ${interfaces_json:-[]},
  "notices": $notices_json$update_fields$config_backup_fields$cert_field$cap_field$local_users_field
}
EOF
  else
    cert_field=""
    if [ -n "$certificates_json" ]; then
      cert_field=$(printf ',
  "certificates": %s' "$certificates_json")
    fi
    cap_field=""
    if [ -n "$capabilities_json" ]; then
      cap_field=$(printf ',
  "capabilities": %s' "$capabilities_json")
    fi
    local_users_field=""
    if [ -n "$local_users_json" ]; then
      local_users_field=$(printf ',
  "local_users": %s' "$local_users_json")
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
  "interfaces": ${interfaces_json:-[]},
  "notices": $notices_json$update_fields$config_backup_fields$cert_field$cap_field$local_users_field
}
EOF
  fi
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

build_signed_body_signature() {
  timestamp="$1"
  body_file="$2"

  {
    printf '%s\n' "$timestamp"
    cat "$body_file"
  } | hex_hmac "$NODE_SECRET"
}

# Modos: body (default, arquivo JSON) | timestamp (test-connection, sem body)
# Saida: HTTP code em stdout; corpo em response_file; stderr em err_file quando informado.
http_post_signed_json() {
  endpoint="$1"
  CURL_CMD="$2"
  response_file="$3"
  mode="${4:-body}"
  body_file="${5:-}"
  err_file="${6:-}"

  timestamp="$(iso_now)"
  curl_err="${response_file}.curlerr"
  http_file="${response_file}.http"

  if [ "$mode" = "timestamp" ]; then
    signature="$(build_test_connection_signature "$timestamp")"
    set -- \
      -sS \
      -X POST \
      -H "X-Node-Uid: $NODE_UID" \
      -H "X-Timestamp: $timestamp" \
      -H "X-Signature: $signature"
  else
    signature="$(build_payload_signature "$timestamp" "$body_file")"
    set -- \
      -sS \
      -X POST \
      -H "Content-Type: application/json" \
      -H "X-Node-Uid: $NODE_UID" \
      -H "X-Timestamp: $timestamp" \
      -H "X-Signature: $signature" \
      --data-binary @"$body_file"
  fi

  if [ -n "$err_file" ]; then
    $CURL_CMD "$@" -o "$response_file" -w '%{http_code}' \
      "${CONTROLLER_URL}${endpoint}" >"$http_file" 2>"$curl_err" || true
    cp "$curl_err" "$err_file" 2>/dev/null || true
  else
    $CURL_CMD "$@" -o "$response_file" -w '%{http_code}' \
      "${CONTROLLER_URL}${endpoint}" >"$http_file" 2>"$curl_err" || true
  fi

  http_code="$(cat "$http_file" 2>/dev/null || true)"
  rm -f "$http_file" "$curl_err"
  printf '%s' "$http_code"
}

classify_http_error() {
  classify_upload_error "$1" "$2"
}

heartbeat_backoff_path() {
  printf '%s/heartbeat-upload-backoff.json' "$(backup_state_dir)"
}

heartbeat_backoff_path() {
  printf '%s/heartbeat-upload-backoff.json' "$(backup_state_dir)"
}

light_heartbeat_state_path() {
  printf '%s/light-heartbeat-state.json' "$(backup_state_dir)"
}

light_heartbeat_force_normal_after() {
  n="${MONITOR_AGENT_LIGHT_FORCE_NORMAL_AFTER:-3}"
  case "$n" in
    ''|*[!0-9]*) printf '3' ;;
    *) printf '%s' "$n" ;;
  esac
}

light_heartbeat_should_send_normal() {
  config_snapshot_is_light_mode || return 1
  path="$(light_heartbeat_state_path)"
  [ -f "$path" ] || return 1
  command_exists php || return 1

  threshold="$(light_heartbeat_force_normal_after)"
  php -r '
    $data = json_decode(@file_get_contents($argv[1]), true);
    if (!is_array($data)) {
      exit(1);
    }
    if (!empty($data["force_next_normal"])) {
      exit(0);
    }
    $threshold = max(1, (int) $argv[2]);
    $successes = (int) ($data["consecutive_light_successes"] ?? 0);
    exit($successes >= $threshold ? 0 : 1);
  ' "$path" "$threshold"
}

light_heartbeat_mark_recovery() {
  config_snapshot_is_light_mode || return 0
  backup_ensure_state_dir
  command_exists php || return 0

  php -r '
    $path = $argv[1];
    $current = [];
    if (is_file($path)) {
      $decoded = json_decode(file_get_contents($path), true);
      if (is_array($decoded)) {
        $current = $decoded;
      }
    }
    $current["force_next_normal"] = true;
    $current["updated_at"] = gmdate("Y-m-d\TH:i:s\Z");
    file_put_contents($path, json_encode($current, JSON_UNESCAPED_SLASHES));
  ' "$(light_heartbeat_state_path)"
}

light_heartbeat_record_success() {
  sent_as_light="$1"
  path="$(light_heartbeat_state_path)"
  backup_ensure_state_dir
  command_exists php || return 0

  threshold="$(light_heartbeat_force_normal_after)"
  php -r '
    $path = $argv[1];
    $sentAsLight = $argv[2] === "1";
    $threshold = max(1, (int) $argv[3]);
    $current = [];
    if (is_file($path)) {
      $decoded = json_decode(file_get_contents($path), true);
      if (is_array($decoded)) {
        $current = $decoded;
      }
    }
    if (!$sentAsLight) {
      $current["consecutive_light_successes"] = 0;
      $current["force_next_normal"] = false;
    } else {
      $successes = (int) ($current["consecutive_light_successes"] ?? 0) + 1;
      $current["consecutive_light_successes"] = $successes;
      if (!empty($current["force_next_normal"]) || $successes >= $threshold) {
        $current["force_next_normal"] = true;
      }
    }
    $current["updated_at"] = gmdate("Y-m-d\TH:i:s\Z");
    file_put_contents($path, json_encode($current, JSON_UNESCAPED_SLASHES));
  ' "$path" "$sent_as_light" "$threshold"
}

heartbeat_error_record() {
  http_code="${1:-}"
  curl_error="${2:-}"
  error_class="$(classify_http_error "$http_code" "$curl_error")"

  if [ "$error_class" = "success" ]; then
    rm -f "$(heartbeat_error_path)" 2>/dev/null || true
    return 0
  fi

  backup_ensure_state_dir
  command_exists php || return 0

  body_excerpt="$(truncate_text "$curl_error" 200)"
  php -r '
    $path = $argv[1];
    $class = $argv[2];
    $httpRaw = $argv[3];
    $excerpt = $argv[4];
    $http = $httpRaw !== "" ? (int) $httpRaw : null;
    $payload = [
      "recorded_at" => gmdate("Y-m-d\TH:i:s\Z"),
      "error_class" => $class,
      "http_code" => $http,
      "body_excerpt" => $excerpt,
    ];
    file_put_contents($path, json_encode($payload, JSON_UNESCAPED_SLASHES));
  ' "$(heartbeat_error_path)" "$error_class" "$http_code" "$body_excerpt"

  case "$error_class" in
    auth|validation)
      add_notice "heartbeat auth/validation failure (HTTP ${http_code:-?})"
      if [ "$error_class" = "auth" ] && [ "${http_code:-}" = "401" ]; then
        echo "heartbeat-auth-failure: HTTP 401 — autenticacao rejeitada; verifique node_secret ou solicite rekey no controlador" >&2
      fi
      ;;
  esac

  if [ "$error_class" != "auth" ] && [ "$error_class" != "validation" ]; then
    heartbeat_backoff_record_failure "$http_code" "$curl_error"
  fi

  echo "heartbeat-error class=${error_class} http=${http_code:-?}" >&2
}

heartbeat_backoff_record_failure() {
  http_code="${1:-}"
  curl_error="${2:-}"
  error_class="$(classify_http_error "$http_code" "$curl_error")"

  if [ "$error_class" = "success" ] || [ "$error_class" = "auth" ] || [ "$error_class" = "validation" ]; then
    return 0
  fi

  backup_ensure_state_dir
  command_exists php || return 0

  php -r '
    $path = $argv[1];
    $class = $argv[2];
    $httpRaw = $argv[3];
    $current = [];
    if (is_file($path)) {
      $decoded = json_decode(file_get_contents($path), true);
      if (is_array($decoded)) {
        $current = $decoded;
      }
    }
    $bases = ["upstream" => 60, "timeout" => 60, "client" => 300];
    $caps = ["upstream" => 300, "timeout" => 120, "client" => 600];
    $failures = (int) ($current["consecutive_failures"] ?? 0) + 1;
    $base = $bases[$class] ?? 60;
    $cap = $caps[$class] ?? 300;
    $delay = min($cap, $base * (2 ** ($failures - 1)));
    $jitter = 1 + (mt_rand(-100, 100) / 1000.0);
    $delay = (int) round($delay * $jitter);
    $next = gmdate("Y-m-d\TH:i:s\Z", time() + $delay);
    $http = $httpRaw !== "" ? (int) $httpRaw : null;
    $payload = [
      "consecutive_failures" => $failures,
      "next_attempt_at" => $next,
      "last_http_code" => $http,
      "last_error_class" => $class,
    ];
    file_put_contents($path, json_encode($payload, JSON_UNESCAPED_SLASHES));
    fwrite(STDERR, sprintf("heartbeat-backoff class=%s http=%s next=%s\n", $class, $httpRaw !== "" ? $httpRaw : "?", $next));
  ' "$(heartbeat_backoff_path)" "$error_class" "$http_code"
}

heartbeat_backoff_clear() {
  had_backoff=0
  if [ -f "$(heartbeat_backoff_path)" ]; then
    had_backoff=1
  fi
  rm -f "$(heartbeat_backoff_path)" 2>/dev/null || true
  if [ "$had_backoff" = "1" ]; then
    light_heartbeat_mark_recovery
  fi
}

heartbeat_backoff_blocks() {
  path="$(heartbeat_backoff_path)"
  [ -f "$path" ] || return 1
  command_exists php || return 1

  php -r '
    $data = json_decode(file_get_contents($argv[1]), true);
    if (!is_array($data) || empty($data["next_attempt_at"])) {
      exit(1);
    }
    $next = strtotime($data["next_attempt_at"]);
    if ($next === false) {
      exit(1);
    }
    exit(time() < $next ? 0 : 1);
  ' "$path"
}

resolve_curl_cmd() {
  if command -v curl >/dev/null 2>&1; then
    printf '%s' "curl"
    return 0
  fi
  if [ -x /usr/local/bin/curl ]; then
    printf '%s' "/usr/local/bin/curl"
    return 0
  fi
  return 1
}

is_uuid_v4() {
  uuid_value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$uuid_value" in
    ????????-????-4???-[89ab]???-????????????) return 0 ;;
    *) return 1 ;;
  esac
}

generate_uuid_v4() {
  candidate=""

  if command_exists php; then
    candidate="$(php -r '
      $data = random_bytes(16);
      $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
      $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
      echo vsprintf("%s%s-%s-%s-%s-%s%s%s", str_split(bin2hex($data), 4));
    ' 2>/dev/null)" || candidate=""
    if [ -n "$candidate" ] && is_uuid_v4 "$candidate"; then
      printf '%s' "$candidate"
      return 0
    fi
  fi

  if command -v uuidgen >/dev/null 2>&1; then
    if uuidgen -r >/dev/null 2>&1; then
      candidate="$(uuidgen -r 2>/dev/null | tr -d '\r\n')"
    else
      candidate="$(uuidgen 2>/dev/null | tr -d '\r\n')"
    fi
    if [ -n "$candidate" ] && is_uuid_v4 "$candidate"; then
      printf '%s' "$candidate"
      return 0
    fi
  fi

  return 1
}

sha256_file() {
  file_path="$1"
  if command -v sha256 >/dev/null 2>&1; then
    sha256 -q "$file_path"
    return 0
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}'
    return 0
  fi
  if command_exists openssl; then
    openssl dgst -sha256 "$file_path" | awk '{print $NF}'
    return 0
  fi
  return 1
}

backup_state_dir() {
  printf '%s' "${MONITOR_AGENT_CONFIG_BACKUP_STATE_DIR:-/var/db/monitor-pfsense-agent}"
}

backup_lock_dir() {
  printf '%s' "/var/run/monitor-pfsense-agent-backup.lock"
}

backup_is_enabled() {
  case "${MONITOR_AGENT_CONFIG_BACKUP_ENABLED:-1}" in
    0|false|no|off) return 1 ;;
    *) return 0 ;;
  esac
}

backup_accepts_remote_requests() {
  case "${MONITOR_AGENT_CONFIG_BACKUP_ACCEPT_REMOTE_REQUESTS:-1}" in
    0|false|no|off) return 1 ;;
    *) return 0 ;;
  esac
}

backup_ensure_state_dir() {
  state_dir="$(backup_state_dir)"
  mkdir -p "$state_dir" 2>/dev/null || true
}

backup_write_state() {
  field="$1"
  value="$2"
  backup_ensure_state_dir
  case "$field" in
    sha256) printf '%s' "$value" > "$(backup_state_dir)/last-config-backup.sha256" ;;
    at) printf '%s' "$value" > "$(backup_state_dir)/last-config-backup-at" ;;
    error) printf '%s' "$value" > "$(backup_state_dir)/last-config-backup-error" ;;
  esac
}

backup_acquire_lock() {
  agent_acquire_stale_lock "$(backup_lock_dir)" "$AGENT_BACKUP_LOCK_STALE_SECONDS" "config-backup"
}

backup_release_lock() {
  agent_release_stale_lock "$(backup_lock_dir)"
}

backup_should_compress() {
  case "${MONITOR_AGENT_CONFIG_BACKUP_COMPRESS:-1}" in
    0|false|no|off) return 1 ;;
    *) return 0 ;;
  esac
}

backup_config_xml_path() {
  printf '%s' "${MONITOR_AGENT_PFSENSE_CONFIG_XML:-/conf/config.xml}"
}

backup_backoff_path() {
  printf '%s/backup-upload-backoff.json' "$(backup_state_dir)"
}

classify_upload_error() {
  http_code="${1:-}"
  curl_error="${2:-}"

  case "$http_code" in
    502|503|504)
      printf 'upstream'
      return 0
      ;;
    408)
      printf 'timeout'
      return 0
      ;;
    401|403)
      printf 'auth'
      return 0
      ;;
    400|413|422)
      printf 'client'
      return 0
      ;;
  esac

  if [ -n "$http_code" ] && [ "$http_code" -ge 200 ] 2>/dev/null && [ "$http_code" -lt 300 ] 2>/dev/null; then
    printf 'success'
    return 0
  fi

  if printf '%s' "$curl_error" | grep -qiE 'timed out|timeout|Operation timed out'; then
    printf 'timeout'
    return 0
  fi

  if printf '%s' "$curl_error" | grep -qiE 'connection reset|connection refused|could not resolve|recv failure|Failed to connect'; then
    printf 'upstream'
    return 0
  fi

  if [ -z "$http_code" ] || [ "$http_code" = "0" ]; then
    printf 'upstream'
    return 0
  fi

  printf 'upstream'
}

backup_backoff_record_failure() {
  http_code="${1:-}"
  curl_error="${2:-}"
  error_class="$(classify_upload_error "$http_code" "$curl_error")"

  if [ "$error_class" = "success" ]; then
    return 0
  fi

  backup_ensure_state_dir
  command_exists php || return 0

  php -r '
    $path = $argv[1];
    $class = $argv[2];
    $httpRaw = $argv[3];
    $current = [];
    if (is_file($path)) {
      $decoded = json_decode(file_get_contents($path), true);
      if (is_array($decoded)) {
        $current = $decoded;
      }
    }
    $bases = ["upstream" => 300, "timeout" => 120, "auth" => 1800, "client" => 3600];
    $caps = ["upstream" => 21600, "timeout" => 7200, "auth" => 86400, "client" => 86400];
    $failures = (int) ($current["consecutive_failures"] ?? 0) + 1;
    $base = $bases[$class] ?? 300;
    $cap = $caps[$class] ?? 21600;
    $delay = min($cap, $base * (2 ** ($failures - 1)));
    $jitter = 1 + (mt_rand(-100, 100) / 1000.0);
    $delay = (int) round($delay * $jitter);
    $next = gmdate("Y-m-d\TH:i:s\Z", time() + $delay);
    $http = $httpRaw !== "" ? (int) $httpRaw : null;
    $payload = [
      "consecutive_failures" => $failures,
      "next_attempt_at" => $next,
      "last_http_code" => $http,
      "last_error_class" => $class,
    ];
    file_put_contents($path, json_encode($payload, JSON_UNESCAPED_SLASHES));
    fwrite(STDERR, sprintf("backup-backoff class=%s http=%s next=%s\n", $class, $httpRaw !== "" ? $httpRaw : "?", $next));
  ' "$(backup_backoff_path)" "$error_class" "$http_code"
}

backup_backoff_clear() {
  rm -f "$(backup_backoff_path)" 2>/dev/null || true
}

# Retorna 0 se backoff ativo (nao executar agendado), 1 se pode tentar.
backup_backoff_blocks_scheduled() {
  path="$(backup_backoff_path)"
  [ -f "$path" ] || return 1
  command_exists php || return 1

  php -r '
    $data = json_decode(file_get_contents($argv[1]), true);
    if (!is_array($data) || empty($data["next_attempt_at"])) {
      exit(1);
    }
    $next = strtotime($data["next_attempt_at"]);
    if ($next === false) {
      exit(1);
    }
    exit(time() < $next ? 0 : 1);
  ' "$path"
}

backup_post_signed_json() {
  endpoint="$1"
  body_file="$2"
  CURL_CMD="$3"

  response_file="$(mktemp)"
  err_file="$(mktemp)"

  http_code="$(http_post_signed_json "$endpoint" "$CURL_CMD" "$response_file" body "$body_file" "$err_file")"
  rm -f "$response_file" "$err_file"
  if [ -z "$http_code" ] || [ "$http_code" -lt 200 ] 2>/dev/null || [ "$http_code" -ge 300 ] 2>/dev/null; then
    return 1
  fi
  return 0
}

backup_post_command_ack() {
  command_id="$1"
  status="$2"
  CURL_CMD="$3"
  body_file="$(mktemp)"
  trap 'rm -f "$body_file"' EXIT INT TERM
  printf '{"command_id":"%s","status":"%s"}\n' "$(json_escape "$command_id")" "$(json_escape "$status")" >"$body_file"
  backup_post_signed_json "/api/v1/ingest/command-ack" "$body_file" "$CURL_CMD"
}

backup_post_command_failed() {
  command_id="$1"
  error_message="$2"
  CURL_CMD="$3"
  body_file="$(mktemp)"
  trap 'rm -f "$body_file"' EXIT INT TERM
  truncated="$(truncate_text "$error_message" 500)"
  printf '{"command_id":"%s","status":"failed","error_message":"%s"}\n' \
    "$(json_escape "$command_id")" \
    "$(json_escape "$truncated")" >"$body_file"
  backup_post_signed_json "/api/v1/ingest/command-result" "$body_file" "$CURL_CMD"
}

backup_upload_config() {
  command_id="${1:-}"
  CURL_CMD="$2"
  config_path="$(backup_config_xml_path)"
  upload_file=""
  payload_file=""
  cleanup_files=""

  if [ ! -f "$config_path" ] || [ ! -r "$config_path" ]; then
    echo "backup-config: config.xml not found at $config_path" >&2
    return 1
  fi

  if ! backup_acquire_lock; then
    echo "backup-config: another backup is running" >&2
    return 1
  fi

  config_sha256="$(sha256_file "$config_path")" || {
    backup_release_lock
    echo "backup-config: unable to hash config.xml" >&2
    return 1
  }
  config_size="$(wc -c < "$config_path" | tr -d ' ')"
  attempt_id="$(generate_uuid_v4)" || {
    backup_release_lock
    echo "backup-config: unable to generate backup id" >&2
    return 1
  }

  upload_file="$(mktemp)"
  payload_file="$upload_file"
  cleanup_files="$upload_file"

  if backup_should_compress; then
    if ! gzip -c "$config_path" >"$upload_file" 2>/dev/null; then
      backup_release_lock
      rm -f "$upload_file"
      echo "backup-config: gzip failed" >&2
      return 1
    fi
    content_type="application/gzip"
    compression_header="gzip"
  else
    cp "$config_path" "$upload_file"
    content_type="application/xml"
    compression_header=""
  fi

  timestamp="$(iso_now)"
  signature="$(build_signed_body_signature "$timestamp" "$upload_file")"
  response_file="$(mktemp)"
  cleanup_files="$cleanup_files $response_file"

  set -- \
    -X POST \
    -H "Content-Type: $content_type" \
    -H "X-Node-Uid: $NODE_UID" \
    -H "X-Timestamp: $timestamp" \
    -H "X-Signature: $signature" \
    -H "X-Config-Sha256: $config_sha256" \
    -H "X-Config-Size: $config_size" \
    -H "X-Backup-Id: $attempt_id" \
    -H "X-Agent-Version: ${AGENT_VERSION:-0.1.0}" \
    -H "X-Pfsense-Version: $(detect_pfsense_version 2>/dev/null || printf unknown)"

  if [ -n "$compression_header" ]; then
    set -- "$@" -H "X-Config-Compression: $compression_header"
  fi
  if [ -n "$command_id" ]; then
    set -- "$@" -H "X-Command-Id: $command_id"
  fi
  if backup_is_enabled; then
    set -- "$@" \
      -H "X-Config-Backup-Enabled: 1" \
      -H "X-Config-Backup-Schedule-Mode: ${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_MODE:-hours}" \
      -H "X-Config-Backup-Interval-Hours: ${MONITOR_AGENT_CONFIG_BACKUP_INTERVAL_HOURS:-24}" \
      -H "X-Config-Backup-Schedule-Time: ${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_TIME:-03:00}" \
      -H "X-Config-Backup-Schedule-Dow: ${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_DOW:-1}" \
      -H "X-Config-Backup-Schedule-Dom: ${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_DOM:-1}"
  else
    set -- "$@" -H "X-Config-Backup-Enabled: 0"
  fi

  if ! $CURL_CMD -sS "$@" --data-binary @"$upload_file" -o "$response_file" -w '%{http_code}' \
    "${CONTROLLER_URL}/api/v1/ingest/config-backup" >"${response_file}.http" 2>"${response_file}.err"; then
    upload_error="upload failed: $(truncate_text "$(cat "${response_file}.err" 2>/dev/null)" 200)"
    backup_write_state error "$upload_error"
    backup_backoff_record_failure "" "$(cat "${response_file}.err" 2>/dev/null)"
    if [ -n "$command_id" ]; then
      backup_post_command_failed "$command_id" "$upload_error" "$CURL_CMD" >/dev/null 2>&1 || true
    fi
    echo "$upload_error" >&2
    backup_release_lock
    rm -f "$upload_file" "$response_file" "${response_file}.http" "${response_file}.err"
    return 1
  fi

  http_code="$(cat "${response_file}.http" 2>/dev/null)"
  if [ -z "$http_code" ] || [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
    api_message="$(truncate_text "$(cat "$response_file" 2>/dev/null)" 300)"
    if [ -n "$api_message" ]; then
      upload_error="upload failed (HTTP ${http_code:-?}): $api_message"
    else
      upload_error="upload failed (HTTP ${http_code:-?})"
    fi
    backup_write_state error "$upload_error"
    backup_backoff_record_failure "$http_code" "$(cat "${response_file}.err" 2>/dev/null)"
    if [ -n "$command_id" ]; then
      backup_post_command_failed "$command_id" "$upload_error" "$CURL_CMD" >/dev/null 2>&1 || true
    fi
    echo "$upload_error" >&2
    backup_release_lock
    rm -f "$upload_file" "$response_file" "${response_file}.http" "${response_file}.err"
    return 1
  fi

  rm -f "${response_file}.http" "${response_file}.err"

  backup_write_state sha256 "$config_sha256"
  backup_write_state at "$(iso_now)"
  backup_write_state error ""
  backup_backoff_clear
  backup_release_lock
  cat "$response_file"
  rm -f "$upload_file" "$response_file"
  return 0
}

backup_config_now() {
  command_id="${1:-}"
  require_var CONTROLLER_URL
  require_var NODE_UID
  require_var NODE_SECRET

  if [ -z "$command_id" ]; then
    case "${MONITOR_AGENT_CONFIG_BACKUP_ON_CHANGE:-1}" in
      0|false|no|off) ;;
      *)
        backup_content_changed || return 0
        ;;
    esac
  fi

  CURL_CMD=""
  if ! resolve_curl_cmd >/dev/null 2>&1; then
    CURL_CMD=""
  else
    CURL_CMD="$(resolve_curl_cmd)"
  fi
  if [ -z "$CURL_CMD" ]; then
    echo "backup-config: curl not found" >&2
    return 1
  fi

  if [ -n "$command_id" ]; then
    backup_post_command_ack "$command_id" "picked_up" "$CURL_CMD" >/dev/null 2>&1 || true
  fi

  backup_upload_config "$command_id" "$CURL_CMD"
}

backup_status() {
  backup_ensure_state_dir
  printf 'enabled=%s\n' "$(backup_is_enabled && printf yes || printf no)"
  printf 'config_xml=%s\n' "$(backup_config_xml_path)"
  if [ -f "$(backup_state_dir)/last-config-backup.sha256" ]; then
    printf 'last_sha256=%s\n' "$(cat "$(backup_state_dir)/last-config-backup.sha256" 2>/dev/null)"
  else
    printf 'last_sha256=\n'
  fi
  if [ -f "$(backup_state_dir)/last-config-backup-at" ]; then
    printf 'last_at=%s\n' "$(cat "$(backup_state_dir)/last-config-backup-at" 2>/dev/null)"
  else
    printf 'last_at=\n'
  fi
  if [ -f "$(backup_state_dir)/last-config-backup-error" ]; then
    printf 'last_error=%s\n' "$(cat "$(backup_state_dir)/last-config-backup-error" 2>/dev/null)"
  else
    printf 'last_error=\n'
  fi
}

backup_schedule_due() {
  last_at_file="$(backup_state_dir)/last-config-backup-at"
  last_at=""
  if [ -f "$last_at_file" ]; then
    last_at="$(cat "$last_at_file" 2>/dev/null)"
  fi

  mode="${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_MODE:-hours}"
  interval_hours="${MONITOR_AGENT_CONFIG_BACKUP_INTERVAL_HOURS:-24}"
  schedule_time="${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_TIME:-03:00}"
  schedule_dow="${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_DOW:-1}"
  schedule_dom="${MONITOR_AGENT_CONFIG_BACKUP_SCHEDULE_DOM:-1}"

  php -r '
    $lastRaw = trim($argv[1]);
    $lastAt = $lastRaw !== "" ? strtotime($lastRaw) : false;
    $now = time();
    if ($lastRaw !== "" && $lastAt === false) {
      // Timestamp local ilegivel: nao tratar como "nunca fez backup" (evita loop).
      exit(1);
    }
    if ($lastAt === false) {
      exit(0);
    }

    $mode = $argv[2];
    $hours = max(1, (int) $argv[3]);
    $time = $argv[4];
    $dow = (int) $argv[5];
    $dom = (int) $argv[6];

    if ($mode === "hours") {
      exit(($now - $lastAt) >= ($hours * 3600) ? 0 : 1);
    }

    if (!preg_match("/^(\d{2}):(\d{2})$/", $time, $parts)) {
      exit(1);
    }

    $hour = (int) $parts[1];
    $minute = (int) $parts[2];
    $tz = new DateTimeZone(date_default_timezone_get());
    $cursor = new DateTime("@".$lastAt);
    $cursor->setTimezone($tz);
    $cursor->modify("+1 minute");

    $next = null;
    if ($mode === "daily") {
      $next = clone $cursor;
      $next->setTime($hour, $minute, 0);
      if ($next <= $cursor) {
        $next->modify("+1 day");
      }
    } elseif ($mode === "weekly") {
      for ($i = 0; $i < 8; $i++) {
        $candidate = clone $cursor;
        $candidate->setTime($hour, $minute, 0);
        $delta = ($dow - (int) $candidate->format("w") + 7) % 7;
        if ($delta === 0 && $candidate <= $cursor) {
          $delta = 7;
        }
        if ($delta > 0) {
          $candidate->modify("+".$delta." days");
        }
        $next = $candidate;
        break;
      }
    } elseif ($mode === "monthly") {
      $candidate = clone $cursor;
      $candidate->setDate((int) $candidate->format("Y"), (int) $candidate->format("n"), min($dom, (int) $candidate->format("t")));
      $candidate->setTime($hour, $minute, 0);
      if ($candidate <= $cursor) {
        $candidate->modify("first day of next month");
        $candidate->setDate((int) $candidate->format("Y"), (int) $candidate->format("n"), min($dom, (int) $candidate->format("t")));
        $candidate->setTime($hour, $minute, 0);
      }
      $next = $candidate;
    } else {
      exit(($now - $lastAt) >= ($hours * 3600) ? 0 : 1);
    }

    if ($next === null) {
      exit(1);
    }

    exit($now >= $next->getTimestamp() ? 0 : 1);
  ' "$last_at" "$mode" "$interval_hours" "$schedule_time" "$schedule_dow" "$schedule_dom"
}

backup_content_changed() {
  config_path="$(backup_config_xml_path)"
  last_sha_file="$(backup_state_dir)/last-config-backup.sha256"
  if [ ! -f "$last_sha_file" ]; then
    return 0
  fi
  current_sha="$(sha256_file "$config_path" 2>/dev/null || true)"
  last_sha="$(cat "$last_sha_file" 2>/dev/null)"
  [ -n "$current_sha" ] && [ "$current_sha" != "$last_sha" ]
}

backup_should_run_scheduled() {
  # Convencao: exit 0 = pular, exit 1 = executar.
  # Caller: if backup_should_run_scheduled; then return; fi; backup_config_now
  backup_is_enabled || return 0
  if backup_backoff_blocks_scheduled; then
    return 0
  fi
  backup_schedule_due || return 0
  case "${MONITOR_AGENT_CONFIG_BACKUP_ON_CHANGE:-1}" in
    0|false|no|off) return 1 ;;
    *)
      if backup_content_changed; then
        return 1
      fi
      return 0
      ;;
  esac
}

backup_scheduled() {
  # exit 0 de backup_should_run_scheduled = pular; exit 1 = executar.
  # (o "if !" anterior invertia a convencao e rodava backup com flag desligada)
  if backup_should_run_scheduled; then
    return 0
  fi
  backup_config_now ""
}

operational_actions_enabled() {
  flag="${MONITOR_AGENT_OPERATIONAL_ACTIONS_ENABLED:-0}"
  case "$flag" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

service_restart_enabled() {
  operational_actions_enabled || return 1
  flag="${MONITOR_AGENT_SERVICE_RESTART_ENABLED:-0}"
  case "$flag" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

node_reboot_enabled() {
  operational_actions_enabled || return 1
  flag="${MONITOR_AGENT_NODE_REBOOT_ENABLED:-0}"
  case "$flag" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

technician_accounts_enabled() {
  # Default on (package 0.5.5+): gestão de técnicos habilitada salvo override explícito off.
  flag="${MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED:-1}"
  case "$flag" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

service_restart_allowlist() {
  printf '%s' "monitor_pfsense_agent unbound dhcpd ntpd dpinger"
}

service_restart_is_allowed() {
  service_name="$1"
  for allowed in $(service_restart_allowlist); do
    if [ "$service_name" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

operational_action_lock_file() {
  printf '%s' "/var/run/monitor-pfsense-agent-operational.lock"
}

operational_action_lock_active() {
  lock_file="$(operational_action_lock_file)"
  [ -f "$lock_file" ] || return 1
  lock_pid=""
  while IFS='=' read -r key value; do
    case "$key" in
      pid) lock_pid="$value" ;;
    esac
  done <"$lock_file" 2>/dev/null || true
  if [ -n "$lock_pid" ] && agent_lock_pid_alive "$lock_pid"; then
    return 0
  fi
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -f "run_node_reboot.sh" >/dev/null 2>&1 && return 0
  fi
  return 1
}

operational_action_acquire_lock() {
  lock_file="$(operational_action_lock_file)"
  if operational_action_lock_active; then
    return 1
  fi
  printf 'pid=%s\naction=%s\nstarted=%s\n' "$$" "$1" "$(iso_now)" >"$lock_file"
  return 0
}

operational_action_release_lock() {
  rm -f "$(operational_action_lock_file)" 2>/dev/null || true
}

dispatch_service_restart() {
  command_id="$1"
  service_name="$2"
  CURL_CMD="$3"

  if ! service_restart_enabled; then
    agent_post_command_result_failed \
      "$command_id" \
      "service restart disabled on agent" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  if ! service_restart_is_allowed "$service_name"; then
    agent_post_command_result_failed \
      "$command_id" \
      "service not in allowlist" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  if ! operational_action_acquire_lock "service_restart"; then
    agent_post_command_result_failed \
      "$command_id" \
      "another operational action is running" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  agent_post_command_ack "$command_id" "picked_up" "$CURL_CMD" >/dev/null 2>&1 || true
  agent_post_command_ack "$command_id" "running" "$CURL_CMD" >/dev/null 2>&1 || true

  restart_ok="0"
  restart_detail=""
  if command_exists service; then
    if service "$service_name" restart >/tmp/monitor-svc-restart.log 2>&1; then
      restart_ok="1"
    else
      restart_detail="$(head -n 3 /tmp/monitor-svc-restart.log 2>/dev/null | tr '\n' ' ')"
    fi
  else
    restart_detail="service command not found"
  fi

  operational_action_release_lock

  if [ "$restart_ok" = "1" ]; then
    result_json="{\"service\":\"$(json_escape "$service_name")\",\"restarted\":true}"
    agent_post_command_result_succeeded "$command_id" "$result_json" "$CURL_CMD" >/dev/null 2>&1 || true
    return 0
  fi

  agent_post_command_result_failed \
    "$command_id" \
    "${restart_detail:-service restart failed}" \
    "$CURL_CMD" >/dev/null 2>&1 || true
  return 1
}

dispatch_node_reboot() {
  command_id="$1"
  delay_seconds="$2"
  CURL_CMD="$3"

  if ! node_reboot_enabled; then
    agent_post_command_result_failed \
      "$command_id" \
      "node reboot disabled on agent" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  if operational_action_lock_active; then
    agent_post_command_result_failed \
      "$command_id" \
      "another operational action is running" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  case "$delay_seconds" in
    ''|*[!0-9]*) delay_seconds=60 ;;
  esac
  if [ "$delay_seconds" -lt 30 ] 2>/dev/null; then
    delay_seconds=30
  fi
  if [ "$delay_seconds" -gt 600 ] 2>/dev/null; then
    delay_seconds=600
  fi

  agent_post_command_ack "$command_id" "picked_up" "$CURL_CMD" >/dev/null 2>&1 || true
  agent_post_command_ack "$command_id" "running" "$CURL_CMD" >/dev/null 2>&1 || true

  state_file="$(backup_state_dir)/node-reboot-pending.json"
  printf '{"command_id":"%s","delay_seconds":"%s","started_at":"%s","status":"running"}\n' \
    "$(json_escape "$command_id")" \
    "$(json_escape "$delay_seconds")" \
    "$(json_escape "$(iso_now)")" >"$state_file"

  wrapper="$SCRIPT_DIR/run_node_reboot.sh"
  if [ ! -x "$wrapper" ]; then
    agent_post_command_result_failed "$command_id" "run_node_reboot.sh missing" "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file" 2>/dev/null || true
    return 1
  fi

  if ! operational_action_acquire_lock "node_reboot"; then
    agent_post_command_result_failed \
      "$command_id" \
      "failed to acquire operational lock" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file" 2>/dev/null || true
    return 1
  fi

  nohup "$wrapper" "$command_id" "$delay_seconds" "$state_file" "$CURL_CMD" \
    >>/var/log/monitor-pfsense-agent-operational.log 2>&1 &
  wrapper_pid=$!
  if [ -z "$wrapper_pid" ]; then
    operational_action_release_lock
    agent_post_command_result_failed "$command_id" "failed to spawn reboot wrapper" "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file" 2>/dev/null || true
    return 1
  fi

  return 0
}

dispatch_local_user_action() {
  action="$1"
  command_id="$2"
  payload_file="$3"
  CURL_CMD="$4"

  cleanup_payload() {
    rm -f "$payload_file" 2>/dev/null || true
  }
  trap cleanup_payload EXIT INT TERM

  if ! technician_accounts_enabled; then
    agent_post_command_result_failed \
      "$command_id" \
      "technician accounts disabled on agent" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  if ! operational_action_acquire_lock "local_user_${action}"; then
    agent_post_command_result_failed \
      "$command_id" \
      "another operational action is running" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  agent_post_command_ack "$command_id" "picked_up" "$CURL_CMD" >/dev/null 2>&1 || true
  agent_post_command_ack "$command_id" "running" "$CURL_CMD" >/dev/null 2>&1 || true

  helper="$SCRIPT_DIR/manage_local_user.php"
  if [ ! -f "$helper" ]; then
    operational_action_release_lock
    agent_post_command_result_failed \
      "$command_id" \
      "manage_local_user.php missing" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  if [ -z "$payload_file" ] || [ ! -r "$payload_file" ]; then
    fallback_payload="$(backup_state_dir)/cmd-payload-${command_id}.json"
    if [ -r "$fallback_payload" ]; then
      payload_file="$fallback_payload"
    else
      operational_action_release_lock
      agent_post_command_result_failed \
        "$command_id" \
        "local user payload file missing" \
        "$CURL_CMD" >/dev/null 2>&1 || true
      return 1
    fi
  fi

  php_bin="php"
  if [ -x /usr/local/bin/php ]; then
    php_bin="/usr/local/bin/php"
  elif ! command_exists php; then
    operational_action_release_lock
    agent_post_command_result_failed \
      "$command_id" \
      "php interpreter not found" \
      "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  stderr_file="$(mktemp)"
  result_json=""
  php_exit=0
  result_json="$("$php_bin" -f "$helper" "$action" "$payload_file" 2>"$stderr_file")" || php_exit=$?

  operational_action_release_lock

  if [ -n "$result_json" ]; then
    ok_flag="$(printf '%s' "$result_json" | "$php_bin" -r '$d=json_decode(stream_get_contents(STDIN), true); echo is_array($d) && !empty($d["ok"]) ? "1" : "0";' 2>/dev/null || echo 0)"
    if [ "$ok_flag" = "1" ]; then
      rm -f "$stderr_file" 2>/dev/null || true
      agent_post_command_result_succeeded "$command_id" "$result_json" "$CURL_CMD" >/dev/null 2>&1 || true
      return 0
    fi
    err_msg="$(printf '%s' "$result_json" | "$php_bin" -r '$d=json_decode(stream_get_contents(STDIN), true); echo is_array($d) ? (string)($d["message"] ?? "failed") : "failed";' 2>/dev/null || echo failed)"
    rm -f "$stderr_file" 2>/dev/null || true
    agent_post_command_result_failed "$command_id" "$err_msg" "$CURL_CMD" >/dev/null 2>&1 || true
    return 1
  fi

  err_detail="local user action failed"
  if [ -s "$stderr_file" ]; then
    err_detail="$(head -n 1 "$stderr_file" | tr '\r\n' ' ' | cut -c1-200)"
  elif [ "$php_exit" -ne 0 ]; then
    err_detail="local user php exited with status ${php_exit}"
  fi
  rm -f "$stderr_file" 2>/dev/null || true
  agent_post_command_result_failed \
    "$command_id" \
    "$err_detail" \
    "$CURL_CMD" >/dev/null 2>&1 || true
  return 1
}

dispatch_local_user_disable() {
  dispatch_local_user_action "disable" "$1" "$2" "$3"
}

dispatch_local_user_delete() {
  dispatch_local_user_action "delete" "$1" "$2" "$3"
}

dispatch_local_user_create() {
  dispatch_local_user_action "create" "$1" "$2" "$3"
}

dispatch_local_user_set_password() {
  dispatch_local_user_action "set_password" "$1" "$2" "$3"
}

process_heartbeat_commands() {
  response_file="$1"
  CURL_CMD="$2"

  command_exists php || return 0
  [ -f "$response_file" ] || return 0

  dispatch_file="$(mktemp)"
  payload_state_dir="$(backup_state_dir)"

  php -r '
    $responseFile = $argv[1];
    $payloadDir = $argv[2];
    $payload = json_decode(file_get_contents($responseFile), true);
    if (!is_array($payload["commands"] ?? null)) {
      exit(0);
    }
    if (!is_dir($payloadDir)) {
      @mkdir($payloadDir, 0750, true);
    }
    foreach ($payload["commands"] as $command) {
      $type = trim((string) ($command["type"] ?? ""));
      $id = trim((string) ($command["id"] ?? ""));
      if ($id === "" || $type === "") {
        continue;
      }
      $payloadPath = "";
      if (strncmp($type, "local_user_", 11) === 0) {
        $cmdPayload = $command["payload"] ?? null;
        if (!is_array($cmdPayload)) {
          continue;
        }
        $payloadPath = rtrim($payloadDir, "/") . "/cmd-payload-" . $id . ".json";
        // Reentrega pos picked_up vem sem password (scrub no controlador). Nao
        // sobrescrever arquivo 0600 que ainda tem a senha para execucao.
        if (is_readable($payloadPath)) {
          $existingPayload = json_decode((string) file_get_contents($payloadPath), true);
          $existingHasPassword = is_array($existingPayload)
            && isset($existingPayload["password"])
            && (string) $existingPayload["password"] !== "";
          $incomingHasPassword = isset($cmdPayload["password"])
            && (string) $cmdPayload["password"] !== "";
          if ($existingHasPassword && !$incomingHasPassword) {
            echo $type . "\t" . $id . "\t\t\t\t\t\t" . $payloadPath . "\n";
            continue;
          }
        }
        $encoded = json_encode($cmdPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
          continue;
        }
        $prevUmask = umask(0077);
        $written = @file_put_contents($payloadPath, $encoded . "\n", LOCK_EX);
        umask($prevUmask);
        if ($written === false) {
          continue;
        }
        @chmod($payloadPath, 0600);
        echo $type . "\t" . $id . "\t\t\t\t\t\t" . $payloadPath . "\n";
        continue;
      }
      $cmdPayload = $command["payload"] ?? null;
      $target = "";
      $artifactUrl = "";
      $sha256 = "";
      $service = "";
      $delaySeconds = "";
      if (is_array($cmdPayload)) {
        $target = trim((string) ($cmdPayload["target_version"] ?? ""));
        $artifactUrl = trim((string) ($cmdPayload["artifact_url"] ?? ""));
        $sha256 = trim((string) ($cmdPayload["sha256"] ?? ""));
        $service = trim((string) ($cmdPayload["service"] ?? ""));
        $delaySeconds = trim((string) ($cmdPayload["delay_seconds"] ?? ""));
      }
      echo $type . "\t" . $id . "\t" . $target . "\t" . $artifactUrl . "\t" . $sha256 . "\t" . $service . "\t" . $delaySeconds . "\t\n";
    }
  ' "$response_file" "$payload_state_dir" >"$dispatch_file" 2>/dev/null || {
    rm -f "$dispatch_file"
    return 0
  }

  if [ ! -s "$dispatch_file" ]; then
    rm -f "$dispatch_file"
    return 0
  fi

  while IFS="$(printf '\t')" read -r command_type command_id target_version artifact_url sha256 service_name delay_seconds payload_path; do
    [ -z "$command_id" ] && continue
    case "$command_type" in
      config_backup_now)
        if ! backup_is_enabled; then
          backup_post_command_failed \
            "$command_id" \
            "config backup disabled on agent" \
            "$CURL_CMD" || true
        elif ! backup_accepts_remote_requests; then
          backup_post_command_failed \
            "$command_id" \
            "remote backup requests disabled on agent" \
            "$CURL_CMD" || true
        else
          backup_config_now "$command_id" || true
        fi
        ;;
      pfsense_upgrade)
        dispatch_pfsense_upgrade "$command_id" "$target_version" "$CURL_CMD" || true
        ;;
      package_upgrade)
        dispatch_package_upgrade "$command_id" "$target_version" "$artifact_url" "$sha256" "$CURL_CMD" || true
        ;;
      service_restart)
        dispatch_service_restart "$command_id" "$service_name" "$CURL_CMD" || true
        ;;
      node_reboot)
        dispatch_node_reboot "$command_id" "$delay_seconds" "$CURL_CMD" || true
        ;;
      local_user_disable)
        resolved_payload="$payload_path"
        if [ -z "$resolved_payload" ]; then
          resolved_payload="$(backup_state_dir)/cmd-payload-${command_id}.json"
        fi
        dispatch_local_user_disable "$command_id" "$resolved_payload" "$CURL_CMD" || true
        ;;
      local_user_delete)
        resolved_payload="$payload_path"
        if [ -z "$resolved_payload" ]; then
          resolved_payload="$(backup_state_dir)/cmd-payload-${command_id}.json"
        fi
        dispatch_local_user_delete "$command_id" "$resolved_payload" "$CURL_CMD" || true
        ;;
      local_user_create)
        resolved_payload="$payload_path"
        if [ -z "$resolved_payload" ]; then
          resolved_payload="$(backup_state_dir)/cmd-payload-${command_id}.json"
        fi
        dispatch_local_user_create "$command_id" "$resolved_payload" "$CURL_CMD" || true
        ;;
      local_user_set_password)
        resolved_payload="$payload_path"
        if [ -z "$resolved_payload" ]; then
          resolved_payload="$(backup_state_dir)/cmd-payload-${command_id}.json"
        fi
        dispatch_local_user_set_password "$command_id" "$resolved_payload" "$CURL_CMD" || true
        ;;
      *)
        agent_post_command_result_failed \
          "$command_id" \
          "unknown command type" \
          "$CURL_CMD" || true
        ;;
    esac
  done <"$dispatch_file"

  rm -f "$dispatch_file"
}

print_config() {
  cat "$CONFIG_FILE"
}

heartbeat() {
  require_var CONTROLLER_URL
  require_var NODE_UID
  require_var NODE_SECRET
  require_var CUSTOMER_CODE

  agent_cleanup_stale_locks

  finalize_pfsense_upgrade_if_pending

  if heartbeat_backoff_blocks; then
    echo "heartbeat: backoff active, skipping send" >&2
    exit 0
  fi

  CURL_CMD=""
  if ! resolve_curl_cmd >/dev/null 2>&1; then
    echo "heartbeat: curl not found (PATH=$PATH)" >&2
    exit 1
  fi
  CURL_CMD="$(resolve_curl_cmd)"

  timestamp="$(iso_now)"
  payload_file="$(mktemp)"
  response_file="$(mktemp)"
  err_file="$(mktemp)"

  heartbeat_cleanup_temp() {
    rm -f "$payload_file" "$response_file" "$err_file" 2>/dev/null || true
  }

  build_payload >"$payload_file" 2>/dev/null
  if [ ! -s "$payload_file" ]; then
    echo "heartbeat: build_payload failed" >&2
    heartbeat_cleanup_temp
    exit 1
  fi

  payload_was_light="0"
  if ! grep -q '"services"' "$payload_file" 2>/dev/null; then
    payload_was_light="1"
  fi

  http_code="$(http_post_signed_json "/api/v1/ingest/heartbeat" "$CURL_CMD" "$response_file" body "$payload_file" "$err_file")"
  curl_error="$(cat "$err_file" 2>/dev/null || true)"

  if [ -n "$http_code" ] && [ "$http_code" -ge 200 ] 2>/dev/null && [ "$http_code" -lt 300 ] 2>/dev/null; then
    heartbeat_backoff_clear
    rm -f "$(heartbeat_error_path)" 2>/dev/null || true
    light_heartbeat_record_success "$payload_was_light"
    process_heartbeat_commands "$response_file" "$CURL_CMD"
    maybe_run_deferred_pfsense_update_check "$response_file"
    heartbeat_cleanup_temp
    return 0
  fi

  if [ "${http_code:-}" = "401" ]; then
    light_heartbeat_mark_recovery
  fi

  heartbeat_error_record "$http_code" "$curl_error"
  heartbeat_cleanup_temp
  exit 1
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

  response_file="$(mktemp)"
  err_file="$(mktemp)"
  trap 'rm -f "$response_file" "$err_file"' EXIT INT TERM

  http_code="$(http_post_signed_json "/api/v1/ingest/test-connection" "$CURL_CMD" "$response_file" timestamp "" "$err_file")"
  curl_error="$(cat "$err_file" 2>/dev/null || true)"

  if [ -n "$http_code" ] && [ "$http_code" -ge 200 ] 2>/dev/null && [ "$http_code" -lt 300 ] 2>/dev/null; then
    cat "$response_file"
    return 0
  fi

  error_class="$(classify_http_error "$http_code" "$curl_error")"
  echo "test-connection failed class=${error_class} http=${http_code:-?}" >&2
  cat "$response_file" 2>/dev/null || true
  exit 1
}

post_command_result() {
  command_id="${2:-}"
  status="${3:-}"
  payload="${4:-}"

  if [ -z "$command_id" ] || [ -z "$status" ]; then
    echo "post-command-result: command_id and status required" >&2
    exit 1
  fi

  require_var NODE_UID
  require_var NODE_SECRET
  CURL_CMD="$(resolve_curl_cmd)"

  case "$status" in
    succeeded)
      agent_post_command_result_succeeded "$command_id" "$payload" "$CURL_CMD"
      ;;
    failed)
      agent_post_command_result_failed "$command_id" "$payload" "$CURL_CMD"
      ;;
    *)
      echo "post-command-result: invalid status (expected succeeded|failed)" >&2
      exit 1
      ;;
  esac
}

usage() {
  cat <<EOF
Usage:
  $0 heartbeat
  $0 test-connection
  $0 print-config
  $0 backup-config [command-id]
  $0 backup-status
  $0 backup-scheduled
  $0 post-command-result <command_id> <succeeded|failed> [payload]
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
  backup-config)
    backup_config_now "${2:-}"
    ;;
  backup-status)
    backup_status
    ;;
  backup-scheduled)
    backup_scheduled
    ;;
  post-command-result)
    post_command_result "$@"
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
