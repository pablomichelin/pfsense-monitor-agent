#!/bin/sh
# Detecta atualização pfSense OS (pfSense-upgrade -d -c) com throttle.
# Grava cache em /var/db/monitor-pfsense-agent/pfsense-update-check.json

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
DEFAULT_CONFIG="$SCRIPT_DIR/../monitor-pfsense-agent.conf"
if [ -f /usr/local/etc/monitor-pfsense-agent.conf ]; then
  DEFAULT_CONFIG="/usr/local/etc/monitor-pfsense-agent.conf"
fi
CONFIG_FILE="${MONITOR_AGENT_CONFIG:-$DEFAULT_CONFIG}"

if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
fi

STATE_DIR="${MONITOR_AGENT_CONFIG_BACKUP_STATE_DIR:-/var/db/monitor-pfsense-agent}"
STATE_FILE="$STATE_DIR/pfsense-update-check.json"
INTERVAL_HOURS="${MONITOR_AGENT_PFSENSE_UPDATE_CHECK_INTERVAL_HOURS:-6}"
# Bump quando o formato do cache ou o parser mudar (invalida resultado antigo).
# v7: firmware branch no cache + ação set-branch (allowlist).
CACHE_VERSION=7
REPO_REFRESH_TIMEOUT_SEC="${MONITOR_AGENT_PFSENSE_REPO_REFRESH_TIMEOUT_SEC:-180}"
CHECK_TIMEOUT_SEC="${MONITOR_AGENT_PFSENSE_UPDATE_CHECK_TIMEOUT_SEC:-120}"
REPAIR_TIMEOUT_SEC="${MONITOR_AGENT_PFSENSE_REPO_REPAIR_TIMEOUT_SEC:-180}"
UPGRADE_LOG_FILE="/conf/upgrade_log.latest.txt"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

iso_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

ensure_state_dir() {
  mkdir -p "$STATE_DIR" 2>/dev/null || true
}

read_last_check_epoch() {
  if [ ! -f "$STATE_FILE" ]; then
    printf '0'
    return
  fi

  php -r '
    $data = json_decode(file_get_contents($argv[1]), true);
    if (!is_array($data)) {
      exit(0);
    }
    $checked = trim((string) ($data["checked_at"] ?? ""));
    if ($checked === "") {
      exit(0);
    }
    $epoch = strtotime($checked);
    echo $epoch > 0 ? (string) $epoch : "0";
  ' "$STATE_FILE" 2>/dev/null || printf '0'
}

state_cache_stale() {
  if [ ! -f "$STATE_FILE" ]; then
    return 0
  fi

  stale="$(php -r '
    $data = json_decode(@file_get_contents($argv[1]), true);
    if (!is_array($data)) {
      echo "1";
      exit(0);
    }
    $expected = (int) $argv[2];
    $current = (int) ($data["cache_version"] ?? 0);
    echo $current >= $expected ? "0" : "1";
  ' "$STATE_FILE" "$CACHE_VERSION" 2>/dev/null || printf '1')"

  if [ "$stale" = "1" ]; then
    return 0
  fi

  return 1
}

invalidate_state_cache() {
  rm -f "$STATE_FILE" 2>/dev/null || true
}

first_output_line() {
  head -n 1 "$1" 2>/dev/null | tr -d '\r\n'
}

parse_update_output() {
  php -r '
    $output = @file_get_contents($argv[1]);
    if ($output === false) {
      exit(1);
    }

    $output = preg_replace("/\x1b\[[0-9;]*m/", "", $output);
    $rawLines = array_values(
      array_filter(
        array_map("trim", preg_split("/\R/", $output)),
        static fn ($line) => $line !== "",
      ),
    );
    $text = preg_replace("/[ \t\r\n]+/", " ", $output);
    $tailLines = array_slice($rawLines, -5);
    $tailText = implode(" ", $tailLines);
    $lastLine = $rawLines !== [] ? $rawLines[count($rawLines) - 1] : "";
    $segments = array_values(
      array_unique(
        array_filter([$lastLine, $tailText, $text], static fn ($s) => $s !== ""),
      ),
    );

    $version = "([0-9]+(?:\\.[0-9]+){1,3}(?:[-_][A-Za-z0-9.]+)?)";
    $availablePatterns = [
      "/\\bVersion\\s+" . $version . "\\s+is\\s+available\\b/i",
      "/\\b" . $version . "\\s+version\\s+of\\s+pfSense\\s+is\\s+available\\b/i",
      "/\\b(?:new|latest)\\s+version(?:\\s+available)?\\s*:?\\s*" . $version . "\\b/i",
      "/\\b(?:update|upgrade)\\s+available\\b.*?\\b" . $version . "\\b/i",
      "/\\b" . $version . "\\b.*?\\b(?:update|upgrade)\\s+(?:is\\s+)?available\\b/i",
    ];

    $tryAvailable = static function (string $segment) use ($availablePatterns, $version): ?array {
      foreach ($availablePatterns as $pattern) {
        if (preg_match($pattern, $segment, $matches)) {
          return ["true", $matches[1] ?? ""];
        }
      }
      if (preg_match("/\\bversion\\s+of\\s+pfSense\\s+is\\s+available\\b/i", $segment)) {
        return ["true", ""];
      }
      if (
        preg_match("/\\b(?:new\\s+version|update\\s+available|upgrade\\s+available)\\b/i", $segment) &&
        !preg_match("/\\bno\\s+(?:updates?|upgrades?)\\s+(?:are\\s+)?available\\b/i", $segment)
      ) {
        return ["true", ""];
      }
      return null;
    };

    foreach ($segments as $segment) {
      $available = $tryAvailable($segment);
      if ($available !== null) {
        echo $available[0] . "\n" . $available[1] . "\n";
        exit(0);
      }
    }

    $upToDatePatterns = [
      "/\\bYour system is up to date\\b/i",
      "/\\bpfSense is up to date\\b/i",
      "/\\balready\\s+(?:on|at)\\s+(?:the\\s+)?(?:latest|current)\\b/i",
      "/\\bno\\s+(?:updates?|upgrades?)\\s+(?:are\\s+)?available\\b/i",
      "/\\bnothing\\s+to\\s+do\\b/i",
    ];

    $upToDateScope = $tailText !== "" ? $tailText : $text;
    foreach ($upToDatePatterns as $pattern) {
      if (preg_match($pattern, $upToDateScope)) {
        echo "false\n\n";
        exit(0);
      }
    }

    echo "unknown\n\n";
  ' "$1"
}

should_run_check() {
  force="${1:-0}"
  if [ "$force" = "1" ]; then
    return 0
  fi

  if state_cache_stale; then
    invalidate_state_cache
    return 0
  fi

  last_epoch="$(read_last_check_epoch)"
  now_epoch="$(date -u +%s)"
  interval_sec=$((INTERVAL_HOURS * 3600))

  if [ "$last_epoch" = "0" ] || [ $((now_epoch - last_epoch)) -ge "$interval_sec" ]; then
    return 0
  fi

  return 1
}

run_timed() {
  limit="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$limit" "$@"
    return $?
  fi
  "$@"
}

extract_lock_pid() {
  if [ ! -f "$1" ]; then
    return 0
  fi
  php -r '
    $t = @file_get_contents($argv[1]);
    if ($t === false) {
      exit(0);
    }
    if (preg_match("/pid\s*=\s*(\d+)/i", $t, $matches)) {
      echo $matches[1];
      exit(0);
    }
    if (preg_match("/\b(\d{2,7})\b/", $t, $matches)) {
      echo $matches[1];
    }
  ' "$1" 2>/dev/null || true
}

is_pid_alive() {
  [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null
}

file_age_sec() {
  file="$1"
  now="$(date -u +%s)"
  mtime="$(stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null || printf '0')"
  if [ -z "$mtime" ] || [ "$mtime" = "0" ]; then
    printf '0'
    return
  fi
  printf '%s' $((now - mtime))
}

pkg_process_busy() {
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -x pkg-static >/dev/null 2>&1 && return 0
    pgrep -x pfSense-upgrade >/dev/null 2>&1 && return 0
    pgrep -x pkg >/dev/null 2>&1 && return 0
  fi
  return 1
}

clear_stale_pfsense_upgrade_locks() {
  for lock in \
    /tmp/pfSense-upgrade.lock \
    /var/run/pfSense-upgrade.lock \
    /var/run/pfSense-upgrade.pid \
    /tmp/pkg.lock \
    /var/run/pkg.lock
  do
    [ -e "$lock" ] || continue
    pid="$(extract_lock_pid "$lock")"
    if is_pid_alive "$pid"; then
      continue
    fi
    case "$lock" in
      *pkg.lock)
        if pkg_process_busy; then
          continue
        fi
        ;;
    esac
    rm -f "$lock" 2>/dev/null || true
  done
}

looks_like_tls_error() {
  printf '%s' "$1" | grep -qiE 'ssl certificate|certificate chain|cafile: none|does not trust|fetching package|self-signed|certificate problem|certctl'
}

looks_like_dns_error() {
  printf '%s' "$1" | grep -qiE 'no address record|name does not resolve|nxdomain|temporary failure in name resolution|cannot resolve'
}

looks_like_metadata_error() {
  printf '%s' "$1" | grep -qiE 'wrong version|meta cannot be loaded|repository meta'
}

looks_like_lock_error() {
  printf '%s' "$1" | grep -qiE 'another instance|already running|is locked|lock present'
}

looks_like_timeout_or_route() {
  printf '%s' "$1" | grep -qiE 'timed out|timeout|no route to host|network is unreachable|cannot assign requested'
}

classify_check_error() {
  msg="$1"
  if looks_like_lock_error "$msg"; then
    printf 'lock'
  elif looks_like_tls_error "$msg"; then
    printf 'tls'
  elif looks_like_dns_error "$msg"; then
    printf 'dns'
  elif looks_like_metadata_error "$msg"; then
    printf 'metadata'
  elif looks_like_timeout_or_route "$msg"; then
    printf 'ipv6'
  else
    printf 'unknown'
  fi
}

upgrade_log_snippet() {
  if [ ! -f "$UPGRADE_LOG_FILE" ]; then
    return 0
  fi
  php -r '
    $lines = @file($argv[1], FILE_IGNORE_NEW_LINES);
    if (!is_array($lines)) {
      exit(0);
    }
    $lines = array_values(array_filter(array_map("trim", $lines), static fn ($line) => $line !== ""));
    if ($lines === []) {
      exit(0);
    }
    echo substr($lines[count($lines) - 1], 0, 300);
  ' "$UPGRADE_LOG_FILE" 2>/dev/null || true
}

run_certctl_rehash() {
  if command -v certctl >/dev/null 2>&1; then
    certctl rehash >/dev/null 2>&1 || true
    return 0
  fi
  return 1
}

pkg_static_bin() {
  if [ -x /usr/local/sbin/pkg-static ]; then
    printf '%s' /usr/local/sbin/pkg-static
    return
  fi
  command -v pkg-static 2>/dev/null || true
}

pfsense_upgrade_in_progress() {
  agent_lock="/var/run/monitor-pfsense-agent-upgrade.lock"
  if [ -f "$agent_lock" ]; then
    pid="$(extract_lock_pid "$agent_lock")"
    if is_pid_alive "$pid"; then
      return 0
    fi
  fi

  for lock in \
    /tmp/pfSense-upgrade.lock \
    /var/run/pfSense-upgrade.lock \
    /var/run/pfSense-upgrade.pid
  do
    [ -e "$lock" ] || continue
    pid="$(extract_lock_pid "$lock")"
    if is_pid_alive "$pid"; then
      return 0
    fi
  done

  if pkg_process_busy; then
    return 0
  fi

  return 1
}

summarize_cmd_failure() {
  log_file="$1"
  default_msg="$2"
  exit_code="$3"
  first="$(first_output_line "$log_file")"
  if [ -n "$first" ]; then
    printf '%s' "$first"
    return
  fi
  if [ "$exit_code" -eq 124 ]; then
    printf '%s timed out' "$default_msg"
    return
  fi
  printf '%s' "$default_msg"
}

run_pfsense_upgrade_cmd() {
  ipv4_only="$1"
  mode="$2"
  out_file="$3"
  limit="$4"
  if [ "$ipv4_only" = "1" ]; then
    run_timed "$limit" pfSense-upgrade -4 -d "$mode" >"$out_file" 2>&1
    return $?
  fi
  run_timed "$limit" pfSense-upgrade -d "$mode" >"$out_file" 2>&1
}

refresh_pkg_repositories() {
  refresh_log="$(mktemp)"
  set +e
  run_pfsense_upgrade_cmd 0 -u "$refresh_log" "$REPO_REFRESH_TIMEOUT_SEC"
  refresh_code=$?
  set -e

  if [ "$refresh_code" -eq 0 ]; then
    rm -f "$refresh_log" 2>/dev/null || true
    return 0
  fi

  first="$(summarize_cmd_failure "$refresh_log" "pfSense-upgrade -u failed" "$refresh_code")"

  if looks_like_tls_error "$first" || looks_like_tls_error "$(cat "$refresh_log" 2>/dev/null || true)"; then
    run_certctl_rehash || true
    set +e
    run_pfsense_upgrade_cmd 0 -u "$refresh_log" "$REPO_REFRESH_TIMEOUT_SEC"
    refresh_code=$?
    set -e
    if [ "$refresh_code" -eq 0 ]; then
      rm -f "$refresh_log" 2>/dev/null || true
      return 0
    fi
    first="$(summarize_cmd_failure "$refresh_log" "pfSense-upgrade -u failed after certctl rehash" "$refresh_code")"
  fi

  if looks_like_timeout_or_route "$first" || looks_like_timeout_or_route "$(cat "$refresh_log" 2>/dev/null || true)"; then
    set +e
    run_pfsense_upgrade_cmd 1 -u "$refresh_log" "$REPO_REFRESH_TIMEOUT_SEC"
    refresh_code=$?
    set -e
    if [ "$refresh_code" -eq 0 ]; then
      PFSENSE_UPGRADE_IPV4=1
      rm -f "$refresh_log" 2>/dev/null || true
      return 0
    fi
    first="$(summarize_cmd_failure "$refresh_log" "pfSense-upgrade -4 -u failed" "$refresh_code")"
  fi

  rm -f "$refresh_log" 2>/dev/null || true
  printf '%s' "$first"
  return 1
}

detect_ha_detected() {
  config_path="${MONITOR_AGENT_PFSENSE_CONFIG_XML:-/conf/config.xml}"
  if [ ! -f "$config_path" ]; then
    return 1
  fi

  if grep -q '<synchronizestatus>' "$config_path" 2>/dev/null; then
    if grep -A3 '<synchronizestatus>' "$config_path" | grep -q '<enable>yes</enable>'; then
      return 0
    fi
  fi

  if grep -q '<carp>' "$config_path" 2>/dev/null; then
    if grep -A5 '<carp>' "$config_path" | grep -q '<enable>yes</enable>'; then
      return 0
    fi
  fi

  return 1
}

read_firmware_branch_fields() {
  helper="$SCRIPT_DIR/set_pfsense_update_branch.php"
  if [ ! -f "$helper" ]; then
    printf '%s\n' "" "" ""
    return
  fi
  php -r '
    $data = json_decode(shell_exec(escapeshellarg($argv[1]) . " list 2>/dev/null"), true);
    if (!is_array($data)) {
      echo "\n\n\n";
      exit(0);
    }
    $name = substr(trim((string) ($data["current_name"] ?? "")), 0, 64);
    $descr = substr(trim((string) ($data["current_descr"] ?? "")), 0, 160);
    $branches = $data["branches"] ?? [];
    if (!is_array($branches)) {
      $branches = [];
    }
    $branches = array_slice(array_values(array_filter(array_map("strval", $branches))), 0, 12);
    echo $name . "\n" . $descr . "\n" . implode(",", $branches) . "\n";
  ' "$helper" 2>/dev/null || printf '%s\n' "" "" ""
}

write_state() {
  available="$1"
  target_version="$2"
  check_error="$3"
  ha_detected="$4"
  error_class="${5:-}"
  log_snippet="${6:-}"
  checked_at="$(iso_now)"

  ensure_state_dir

  if [ "$available" = "true" ]; then
    available_json='true'
  elif [ "$available" = "false" ]; then
    available_json='false'
  else
    available_json='null'
  fi

  if [ "$ha_detected" = "true" ]; then
    ha_json='true'
  else
    ha_json='false'
  fi

  if [ -z "$error_class" ] && [ -n "$check_error" ]; then
    error_class="$(classify_check_error "$check_error")"
  fi
  if [ -z "$log_snippet" ] && [ -n "$check_error" ]; then
    log_snippet="$(upgrade_log_snippet || true)"
  fi

  branch_name=""
  branch_descr=""
  branch_list=""
  branch_fields="$(read_firmware_branch_fields || true)"
  if [ -n "$branch_fields" ]; then
    branch_name="$(printf '%s\n' "$branch_fields" | sed -n '1p' | tr -d '\r')"
    branch_descr="$(printf '%s\n' "$branch_fields" | sed -n '2p' | tr -d '\r')"
    branch_list="$(printf '%s\n' "$branch_fields" | sed -n '3p' | tr -d '\r')"
  fi

  cat >"$STATE_FILE" <<EOF
{
  "cache_version": $CACHE_VERSION,
  "available": $available_json,
  "target_version": "$(json_escape "$target_version")",
  "checked_at": "$(json_escape "$checked_at")",
  "check_error": "$(json_escape "$check_error")",
  "error_class": "$(json_escape "$error_class")",
  "log_snippet": "$(json_escape "$log_snippet")",
  "firmware_branch": "$(json_escape "$branch_name")",
  "firmware_branch_descr": "$(json_escape "$branch_descr")",
  "firmware_branches": "$(json_escape "$branch_list")",
  "ha_detected": $ha_json
}
EOF
}

fail_check() {
  check_error="$1"
  error_class="${2:-}"
  write_state "" "" "$check_error" "$ha_detected" "$error_class" "$(upgrade_log_snippet || true)"
  return 1
}

run_check() {
  target_version=""
  check_error=""
  available=""
  ha_detected="false"
  PFSENSE_UPGRADE_IPV4=0

  if detect_ha_detected; then
    ha_detected="true"
  fi

  if ! command -v pfSense-upgrade >/dev/null 2>&1; then
    fail_check "pfSense-upgrade not found" "unknown"
    return 1
  fi

  clear_stale_pfsense_upgrade_locks

  if pfsense_upgrade_in_progress; then
    fail_check "pfSense-upgrade already running" "lock"
    return 1
  fi

  refresh_error="$(refresh_pkg_repositories || true)"
  if [ -n "$refresh_error" ]; then
    fail_check "$refresh_error"
    return 1
  fi

  output_file="$(mktemp)"
  trap 'rm -f "$output_file"' EXIT INT TERM

  set +e
  run_pfsense_upgrade_cmd "$PFSENSE_UPGRADE_IPV4" -c "$output_file" "$CHECK_TIMEOUT_SEC"
  exit_code=$?
  set -e

  parsed="$(parse_update_output "$output_file" 2>/dev/null || printf 'unknown\n\n')"
  available="$(printf '%s\n' "$parsed" | sed -n '1p' | tr -d '\r')"
  target_version="$(printf '%s\n' "$parsed" | sed -n '2p' | tr -d '\r')"

  case "$available" in
    true|false)
      ;;
    *)
      check_error="$(first_output_line "$output_file")"
      if [ -z "$check_error" ]; then
        if [ "$exit_code" -ne 0 ]; then
          check_error="pfSense-upgrade check failed"
        else
          check_error="Unable to parse pfSense-upgrade output"
        fi
      fi
      fail_check "$check_error"
      return 1
      ;;
  esac

  write_state "$available" "$target_version" "" "$ha_detected" "" ""
  return 0
}

run_repair_repo() {
  ha_detected="false"
  if detect_ha_detected; then
    ha_detected="true"
  fi

  clear_stale_pfsense_upgrade_locks

  if pfsense_upgrade_in_progress; then
    fail_check "pfSense-upgrade already running" "lock"
    return 1
  fi

  run_certctl_rehash || true

  pkgbin="$(pkg_static_bin)"
  if [ -z "$pkgbin" ]; then
    fail_check "pkg-static not found" "unknown"
    return 1
  fi

  repair_log="$(mktemp)"
  trap 'rm -f "$repair_log" "$output_file"' EXIT INT TERM

  set +e
  run_timed "$REPAIR_TIMEOUT_SEC" "$pkgbin" clean -ay >"$repair_log" 2>&1
  clean_code=$?
  set -e
  if [ "$clean_code" -ne 0 ]; then
    fail_check "$(summarize_cmd_failure "$repair_log" "pkg-static clean failed" "$clean_code")"
    return 1
  fi

  set +e
  run_timed "$REPAIR_TIMEOUT_SEC" "$pkgbin" install -fy pkg >"$repair_log" 2>&1
  pkg_code=$?
  set -e
  if [ "$pkg_code" -ne 0 ]; then
    first="$(summarize_cmd_failure "$repair_log" "pkg-static install pkg failed" "$pkg_code")"
    if looks_like_metadata_error "$first"; then
      set +e
      run_timed "$REPAIR_TIMEOUT_SEC" env ASSUME_ALWAYS_YES=yes "$pkgbin" bootstrap -f >"$repair_log" 2>&1
      boot_code=$?
      set -e
      if [ "$boot_code" -ne 0 ]; then
        fail_check "$(summarize_cmd_failure "$repair_log" "pkg-static bootstrap failed" "$boot_code")" "metadata"
        return 1
      fi
    else
      fail_check "$first"
      return 1
    fi
  fi

  set +e
  run_timed "$REPAIR_TIMEOUT_SEC" "$pkgbin" install -xfy pfSense-repo pfSense-upgrade >"$repair_log" 2>&1
  repo_code=$?
  set -e
  if [ "$repo_code" -ne 0 ]; then
    fail_check "$(summarize_cmd_failure "$repair_log" "pkg-static install pfSense-repo/upgrade failed" "$repo_code")"
    return 1
  fi

  invalidate_state_cache
  run_check || true
}

run_set_branch() {
  target="$1"
  case "$target" in
    latest|2.8.1|2.9.0)
      ;;
    *)
      ha_detected="false"
      if detect_ha_detected; then
        ha_detected="true"
      fi
      fail_check "invalid firmware branch target" "branch"
      return 1
      ;;
  esac
  ha_detected="false"
  if detect_ha_detected; then
    ha_detected="true"
  fi

  helper="$SCRIPT_DIR/set_pfsense_update_branch.php"
  if [ ! -f "$helper" ]; then
    fail_check "set_pfsense_update_branch.php not found" "branch"
    return 1
  fi
  chmod 0755 "$helper" 2>/dev/null || true

  set_log="$(mktemp)"
  trap 'rm -f "$set_log" "$repair_log" "$output_file"' EXIT INT TERM
  set +e
  php "$helper" set "$target" >"$set_log" 2>&1
  set_code=$?
  set -e

  if [ "$set_code" -ne 0 ]; then
    first="$(php -r '
      $raw = @file_get_contents($argv[1]);
      $data = json_decode((string) $raw, true);
      if (is_array($data) && trim((string) ($data["error"] ?? "")) !== "") {
        echo substr(trim((string) $data["error"]), 0, 300);
        exit(0);
      }
      $line = trim((string) strtok((string) $raw, "\n"));
      echo $line !== "" ? substr($line, 0, 300) : "firmware branch switch failed";
    ' "$set_log" 2>/dev/null || printf 'firmware branch switch failed')"
    fail_check "$first" "branch"
    return 1
  fi

  invalidate_state_cache
  run_check || true
}

print_cached_state() {
  if [ ! -f "$STATE_FILE" ]; then
    printf '{}'
    return
  fi
  cat "$STATE_FILE"
}

main() {
  action="${1:-check}"

  case "$action" in
    check)
      if should_run_check 0; then
        run_check || true
      fi
      print_cached_state
      ;;
    force-check)
      invalidate_state_cache
      run_check || true
      print_cached_state
      ;;
    repair-repo)
      run_repair_repo || true
      print_cached_state
      ;;
    set-branch)
      run_set_branch "${2:-}" || true
      print_cached_state
      ;;
    needed)
      if should_run_check 0; then
        exit 0
      fi
      exit 1
      ;;
    cache)
      print_cached_state
      ;;
    *)
      echo "usage: $0 [check|force-check|repair-repo|set-branch <target>|needed|cache]" >&2
      exit 1
      ;;
  esac
}

main "$@"
