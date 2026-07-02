#!/bin/sh
# Wrapper package upgrade — desacoplado do heartbeat loop.
# Spawned by dispatch_package_upgrade; resultado via command-result API.

set -eu

COMMAND_ID="${1:-}"
TARGET_VERSION="${2:-}"
ARTIFACT_URL="${3:-}"
SHA256="${4:-}"
STATE_FILE="${5:-}"
CURL_CMD="${6:-curl}"
LOG_FILE="${MONITOR_AGENT_LOG_FILE:-/var/log/monitor-pfsense-agent.log}"
UPGRADE_LOG="/var/log/monitor-pfsense-package-upgrade.log"
LOCK_FILE="/var/run/monitor-pfsense-package-upgrade.lock"
CONFIG_FILE="${MONITOR_AGENT_CONFIG_FILE:-/usr/local/etc/monitor-pfsense-agent.conf}"
AGENT_BIN="${MONITOR_AGENT_BIN:-/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh}"

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

shell_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

iso_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

log_msg() {
  line="$(iso_now) [package-upgrade] $*"
  printf '%s\n' "$line" >>"$UPGRADE_LOG" 2>/dev/null || true
  printf '%s\n' "$line" >>"$LOG_FILE" 2>/dev/null || true
}

cleanup_lock() {
  rm -f "$LOCK_FILE" 2>/dev/null || true
}

acquire_lock() {
  if [ -f "$LOCK_FILE" ]; then
    lock_pid=""
    while IFS='=' read -r key value; do
      case "$key" in
        pid) lock_pid="$value" ;;
      esac
    done <"$LOCK_FILE" 2>/dev/null || true
    if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
      log_msg "package upgrade lock held by pid=${lock_pid}"
      return 1
    fi
    rm -f "$LOCK_FILE" 2>/dev/null || true
  fi

  if (set -C; umask 077; printf 'pid=%s\nstarted_at=%s\n' "$$" "$(date +%s)" >"$LOCK_FILE") 2>/dev/null; then
    umask 022
    return 0
  fi

  log_msg "failed to acquire package upgrade lock"
  return 1
}

post_command_failed() {
  "$AGENT_BIN" post-command-result "$COMMAND_ID" failed "$1" >>"$UPGRADE_LOG" 2>&1 || true
}

post_command_succeeded() {
  "$AGENT_BIN" post-command-result "$COMMAND_ID" succeeded "$1" >>"$UPGRADE_LOG" 2>&1 || true
}

read_config_value() {
  key="$1"
  [ -f "$CONFIG_FILE" ] || return 1
  awk -F= -v k="$key" '$1 == k { sub(/^[^=]*=/, ""); gsub(/^"|"$/, ""); print; exit }' "$CONFIG_FILE"
}

package_upgrade_url_allowed() {
  url="$1"
  controller_url="$(read_config_value CONTROLLER_URL 2>/dev/null || true)"
  controller_url="${controller_url%/}"

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

if [ -z "$COMMAND_ID" ] || [ -z "$ARTIFACT_URL" ] || [ -z "$SHA256" ]; then
  log_msg "missing required arguments"
  exit 1
fi

if ! acquire_lock; then
  post_command_failed "another package upgrade operation is running"
  exit 1
fi

trap 'cleanup_lock' EXIT INT TERM

log_msg "start command_id=$COMMAND_ID target=$TARGET_VERSION"

if ! package_upgrade_url_allowed "$ARTIFACT_URL"; then
  log_msg "artifact URL not allowed"
  post_command_failed "artifact URL not allowed"
  exit 1
fi

repo_base="${MONITOR_PACKAGE_RELEASE_REPO_RAW_BASE:-https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main}"
repo_base="${repo_base%/}"
installer_url="${repo_base}/packages/pfsense-package/bootstrap/install-from-release.sh"

if ! package_upgrade_url_allowed "$installer_url"; then
  log_msg "installer URL not allowed"
  post_command_failed "installer URL not allowed"
  exit 1
fi

node_secret="$(read_config_value NODE_SECRET 2>/dev/null || true)"
if [ -z "$node_secret" ] && [ -r /var/db/monitor-pfsense-agent/node_secret ]; then
  node_secret="$(cat /var/db/monitor-pfsense-agent/node_secret)"
fi

if [ -z "$node_secret" ]; then
  log_msg "node secret unavailable"
  post_command_failed "node secret unavailable"
  exit 1
fi

secret_file="/var/db/monitor-pfsense-agent/.update-node-secret"
mkdir -p /var/db/monitor-pfsense-agent
umask 077
printf '%s' "$node_secret" >"$secret_file"
chmod 600 "$secret_file"
umask 022

controller_url="$(read_config_value CONTROLLER_URL)"
node_uid="$(read_config_value NODE_UID)"
customer_code="$(read_config_value CUSTOMER_CODE)"
heartbeat_mode="$(read_config_value HEARTBEAT_MODE)"
heartbeat_mode="${heartbeat_mode:-normal}"

install_args=""
install_args="$install_args $(shell_quote "$controller_url")"
install_args="$install_args $(shell_quote "$node_uid")"
install_args="$install_args $(shell_quote "$customer_code")"
install_args="$install_args $(shell_quote "$heartbeat_mode")"

if command -v fetch >/dev/null 2>&1; then
  fetch -o /tmp/install-from-release.sh "$installer_url" >>"$UPGRADE_LOG" 2>&1
else
  $CURL_CMD -fsSL "$installer_url" -o /tmp/install-from-release.sh >>"$UPGRADE_LOG" 2>&1
fi
chmod +x /tmp/install-from-release.sh

set +e
MONITOR_UPDATE_NODE_SECRET="$node_secret" /tmp/install-from-release.sh \
  --release-url "$ARTIFACT_URL" \
  --sha256 "$SHA256" \
  --secret-file "$secret_file" \
  --controller-url "$controller_url" \
  --node-uid "$node_uid" \
  --customer-code "$customer_code" \
  --heartbeat-mode "$heartbeat_mode" >>"$UPGRADE_LOG" 2>&1
install_code=$?
set -e

rm -f "$secret_file"

if [ "$install_code" -ne 0 ]; then
  log_msg "install-from-release failed exit=$install_code"
  post_command_failed "install-from-release failed (see $UPGRADE_LOG)"
  exit 1
fi

log_msg "package upgrade succeeded target=$TARGET_VERSION"
result_json="{\"target_version\":\"$(json_escape "$TARGET_VERSION")\",\"installed_at\":\"$(iso_now)\"}"
post_command_succeeded "$result_json"
exit 0
