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
# Retrocompat: se o .conf legado ainda trouxer NODE_SECRET, ele e respeitado.
NODE_SECRET_FILE="${NODE_SECRET_FILE:-/var/db/monitor-pfsense-agent/node_secret}"
if [ -z "${NODE_SECRET:-}" ] && [ -r "${NODE_SECRET_FILE}" ]; then
  NODE_SECRET="$(tr -d '\r\n' <"${NODE_SECRET_FILE}" 2>/dev/null || true)"
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

run_pfsense_update_check() {
  helper="$SCRIPT_DIR/check_pfsense_update_available.sh"
  if [ ! -x "$helper" ]; then
    return
  fi

  state_file="$(backup_state_dir)/pfsense-update-check.json"
  if [ -f "$state_file" ]; then
    cache_ok="$(php -r '
      $data = json_decode(@file_get_contents($argv[1]), true);
      if (!is_array($data)) {
        echo "0";
        exit(0);
      }
      echo ((int) ($data["cache_version"] ?? 0) >= 4) ? "1" : "0";
    ' "$state_file" 2>/dev/null || printf '0')"
    if [ "$cache_ok" != "1" ]; then
      "$helper" force-check >/dev/null 2>&1 || true
      return
    fi
  fi

  "$helper" check >/dev/null 2>&1 || true
}

pfsense_upgrade_state_file() {
  printf '%s' "$(backup_state_dir)/pfsense-upgrade-pending.json"
}

pfsense_upgrade_lock_dir() {
  printf '%s' "/var/run/monitor-pfsense-agent-upgrade.lock"
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

  lock_dir="$(pfsense_upgrade_lock_dir)"
  if ! mkdir "$lock_dir" 2>/dev/null; then
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
    rmdir "$lock_dir" 2>/dev/null || true
    return 1
  fi
  chmod +x "$wrapper" 2>/dev/null || true

  nohup "$wrapper" "$command_id" "$target_version" "$state_file" >>/var/log/monitor-pfsense-agent-upgrade.log 2>&1 &
  wrapper_pid=$!

  if ! kill -0 "$wrapper_pid" 2>/dev/null; then
    agent_post_command_result_failed "$command_id" "failed to spawn upgrade wrapper" "$CURL_CMD" >/dev/null 2>&1 || true
    rm -f "$state_file"
    rmdir "$lock_dir" 2>/dev/null || true
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
  if [ -f "$log_file" ]; then
    excerpt="$(tail -n 20 "$log_file" | tr '\n' ' ')"
    new_version="$(detect_pfsense_version 2>/dev/null || true)"
    agent_post_command_result_succeeded "$parsed" \
      "{\"target_version\":\"$(json_escape "$state_target_version")\",\"new_version\":\"$(json_escape "$new_version")\",\"started_at\":\"$(json_escape "$started_at")\",\"log_excerpt\":\"$(json_escape "$excerpt")\",\"finalize_status\":\"$(json_escape "$status")\"}" \
      "$CURL_CMD" >/dev/null 2>&1 || true
  elif [ "$status" = "prepared_manual_confirm" ]; then
    # Still awaiting manual Confirm / reboot — keep state, do not fail yet.
    return 0
  else
    agent_post_command_result_failed "$parsed" "upgrade finished without upgrade log" "$CURL_CMD" >/dev/null 2>&1 || true
  fi

  rm -f "$state_file"
  rmdir "$(pfsense_upgrade_lock_dir)" 2>/dev/null || true
}

build_payload() {
  run_pfsense_update_check
  update_fields="$(append_pfsense_update_json_fields 2>/dev/null || printf ',\n  "ha_detected": false')"
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
  light="${MONITOR_AGENT_LIGHT_HEARTBEAT:-0}"
  if [ "$light" = "1" ] || [ "$light" = "true" ] || [ "$light" = "yes" ]; then
    services_json=""
    gateways_json=""
  else
    services_json="$(build_services_json 2>/dev/null)" || services_json="[]"
    gateways_json="$(build_gateways_json 2>/dev/null)" || gateways_json="[]"
  fi

  if [ -n "${MONITOR_AGENT_NOTICES:-}" ]; then
    notices_json="$(json_string_array "$MONITOR_AGENT_NOTICES")"
  else
    notices_json='[]'
  fi

  if [ -n "$services_json" ]; then
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
  "notices": $notices_json$update_fields
}
EOF
  else
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
  "notices": $notices_json$update_fields
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
  rm -f "$(heartbeat_backoff_path)" 2>/dev/null || true
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
  case "${MONITOR_AGENT_CONFIG_BACKUP_ENABLED:-0}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
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
  lock_dir="$(backup_lock_dir)"
  if mkdir "$lock_dir" 2>/dev/null; then
    return 0
  fi
  return 1
}

backup_release_lock() {
  rmdir "$(backup_lock_dir)" 2>/dev/null || true
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
  # Convencao com backup_scheduled (if ! ...): 0 = nao executar, 1 = executar.
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
  if ! backup_should_run_scheduled; then
    return 0
  fi
  backup_config_now ""
}

process_heartbeat_commands() {
  response_file="$1"
  CURL_CMD="$2"

  command_exists php || return 0
  [ -f "$response_file" ] || return 0

  dispatch_file="$(mktemp)"

  php -r '
    $payload = json_decode(file_get_contents($argv[1]), true);
    if (!is_array($payload["commands"] ?? null)) {
      exit(0);
    }
    foreach ($payload["commands"] as $command) {
      $type = trim((string) ($command["type"] ?? ""));
      $id = trim((string) ($command["id"] ?? ""));
      if ($id === "" || $type === "") {
        continue;
      }
      $payload = $command["payload"] ?? null;
      $target = "";
      if (is_array($payload)) {
        $target = trim((string) ($payload["target_version"] ?? ""));
      }
      echo $type . "\t" . $id . "\t" . $target . "\n";
    }
  ' "$response_file" >"$dispatch_file" 2>/dev/null || {
    rm -f "$dispatch_file"
    return 0
  }

  if [ ! -s "$dispatch_file" ]; then
    rm -f "$dispatch_file"
    return 0
  fi

  while IFS="$(printf '\t')" read -r command_type command_id target_version; do
    [ -z "$command_id" ] && continue
    case "$command_type" in
      config_backup_now)
        if backup_is_enabled && backup_accepts_remote_requests; then
          backup_config_now "$command_id" >>/dev/null 2>&1 || true
        fi
        ;;
      pfsense_upgrade)
        dispatch_pfsense_upgrade "$command_id" "$target_version" "$CURL_CMD" >>/dev/null 2>&1 || true
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

  http_code="$(http_post_signed_json "/api/v1/ingest/heartbeat" "$CURL_CMD" "$response_file" body "$payload_file" "$err_file")"
  curl_error="$(cat "$err_file" 2>/dev/null || true)"

  if [ -n "$http_code" ] && [ "$http_code" -ge 200 ] 2>/dev/null && [ "$http_code" -lt 300 ] 2>/dev/null; then
    heartbeat_backoff_clear
    rm -f "$(heartbeat_error_path)" 2>/dev/null || true
    process_heartbeat_commands "$response_file" "$CURL_CMD"
    heartbeat_cleanup_temp
    return 0
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

usage() {
  cat <<EOF
Usage:
  $0 heartbeat
  $0 test-connection
  $0 print-config
  $0 backup-config [command-id]
  $0 backup-status
  $0 backup-scheduled
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
  *)
    usage >&2
    exit 1
    ;;
esac
