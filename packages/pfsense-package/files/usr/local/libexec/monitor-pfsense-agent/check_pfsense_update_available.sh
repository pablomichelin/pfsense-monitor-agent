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
CACHE_VERSION=4

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

write_state() {
  available="$1"
  target_version="$2"
  check_error="$3"
  ha_detected="$4"
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

  cat >"$STATE_FILE" <<EOF
{
  "cache_version": $CACHE_VERSION,
  "available": $available_json,
  "target_version": "$(json_escape "$target_version")",
  "checked_at": "$(json_escape "$checked_at")",
  "check_error": "$(json_escape "$check_error")",
  "ha_detected": $ha_json
}
EOF
}

run_check() {
  checked_at="$(iso_now)"
  target_version=""
  check_error=""
  available=""
  ha_detected="false"

  if detect_ha_detected; then
    ha_detected="true"
  fi

  if ! command -v pfSense-upgrade >/dev/null 2>&1; then
    check_error="pfSense-upgrade not found"
    write_state "" "" "$check_error" "$ha_detected"
    return 1
  fi

  output_file="$(mktemp)"
  trap 'rm -f "$output_file"' EXIT INT TERM

  set +e
  pfSense-upgrade -d -c >"$output_file" 2>&1
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
      write_state "" "" "$check_error" "$ha_detected"
      return 1
      ;;
  esac

  write_state "$available" "$target_version" "" "$ha_detected"
  return 0
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
    cache)
      print_cached_state
      ;;
    *)
      echo "usage: $0 [check|force-check|cache]" >&2
      exit 1
      ;;
  esac
}

main "$@"
