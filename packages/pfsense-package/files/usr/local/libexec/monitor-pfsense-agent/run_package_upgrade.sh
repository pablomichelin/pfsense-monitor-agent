#!/bin/sh
# Wrapper package upgrade — desacoplado do heartbeat loop.
# Spawned by dispatch_package_upgrade; resultado via command-result API.

set -eu

# The upgrade reads its canonical secret below; never forward an inherited copy.
unset MONITOR_UPDATE_NODE_SECRET

COMMAND_ID="${1:-}"
TARGET_VERSION="${2:-}"
ARTIFACT_URL="${3:-}"
SHA256="${4:-}"
STATE_FILE="${5:-}"
CURL_CMD="${6:-curl}"
LOG_FILE="${MONITOR_AGENT_LOG_FILE:-/var/log/monitor-pfsense-agent.log}"
UPGRADE_LOG="${MONITOR_PACKAGE_UPGRADE_LOG:-/var/log/monitor-pfsense-package-upgrade.log}"
LOCK_FILE="${MONITOR_PACKAGE_UPGRADE_LOCK:-/var/run/monitor-pfsense-package-upgrade.lock}"
WORK_DIR=""
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
  [ -z "$WORK_DIR" ] || rm -rf "$WORK_DIR" 2>/dev/null || true
  rm -f "$LOCK_FILE" 2>/dev/null || true
  # Remove o marcador de upgrade pendente para o dedup de reentrega não
  # considerar um upgrade concluído como "em andamento".
  [ -n "$STATE_FILE" ] && rm -f "$STATE_FILE" 2>/dev/null || true
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
    $parsedController = parse_url($controller);
    if (!is_array($parsedController) || isset($parsed["user"]) || isset($parsed["pass"])
      || isset($parsed["fragment"])) { exit(1); }
    $scheme = strtolower((string) ($parsed["scheme"] ?? ""));
    $controllerScheme = strtolower((string) ($parsedController["scheme"] ?? ""));
    if (!in_array($scheme, ["http", "https"], true)) { exit(1); }
    $port = $parsed["port"] ?? ($scheme === "https" ? 443 : 80);
    $controllerPort = $parsedController["port"] ?? ($controllerScheme === "https" ? 443 : 80);
    if ($scheme === $controllerScheme && $port === $controllerPort
      && strcasecmp($parsed["host"], (string) ($parsedController["host"] ?? "")) === 0) { exit(0); }
    if ($scheme !== "https" || $port !== 443) { exit(1); }
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

# Serialize with repository checks without touching native pkg locks.
if [ "${MONITOR_UPDATE_LOCK_HELD:-0}" != "1" ]; then
  lock_helper="$(dirname "$0")/update_operation.php"
  set +e
  php "$lock_helper" --wait 300 sh "$0" "$@"
  lock_result=$?
  if [ "$lock_result" -eq 75 ]; then
    post_command_failed "update operation busy; installation was not started"
  fi
  exit "$lock_result"
fi

if ! acquire_lock; then
  post_command_failed "another package upgrade operation is running"
  exit 1
fi

trap 'cleanup_lock' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

log_msg "start command_id=$COMMAND_ID target=$TARGET_VERSION"

if ! package_upgrade_url_allowed "$ARTIFACT_URL"; then
  log_msg "artifact URL not allowed"
  post_command_failed "artifact URL not allowed"
  exit 1
fi

# Only execute the installer INSIDE the artifact authenticated by the command.
# No mutable main-branch bootstrap download and no temporary node-secret copy.
case "$SHA256" in
  *[!0-9a-fA-F]*|'') post_command_failed "invalid SHA256"; exit 1 ;;
esac
if [ "${#SHA256}" -ne 64 ]; then
  post_command_failed "invalid SHA256"
  exit 1
fi
WORK_DIR="$(mktemp -d)"
chmod 700 "$WORK_DIR"
archive="$WORK_DIR/package.tar.gz"
mkdir "$WORK_DIR/extract"

if ! "$CURL_CMD" -fsSL --proto '=http,https' --proto-redir '=https' \
  "$ARTIFACT_URL" -o "$archive" >>"$UPGRADE_LOG" 2>&1; then
  post_command_failed "package artifact download failed"
  exit 1
fi
actual_sha256="$(php -r 'echo hash_file("sha256", $argv[1]);' "$archive")"
expected_sha256="$(printf '%s' "$SHA256" | tr 'A-F' 'a-f')"
if [ "$actual_sha256" != "$expected_sha256" ]; then
  post_command_failed "package artifact SHA256 mismatch"
  exit 1
fi
if ! tar -C "$WORK_DIR/extract" -xzf "$archive" >>"$UPGRADE_LOG" 2>&1; then
  post_command_failed "package artifact extraction failed"
  exit 1
fi
# Same layout as build-pfsense-package-artifact.sh / install-from-release.sh.
installer="$WORK_DIR/extract/pfsense-package/bootstrap/install.sh"
if [ ! -f "$installer" ] || [ -L "$installer" ]; then
  post_command_failed "verified package installer missing"
  exit 1
fi

node_secret="$(read_config_value NODE_SECRET 2>/dev/null || true)"
node_secret_file="$(read_config_value NODE_SECRET_FILE 2>/dev/null || true)"
node_secret_file="${node_secret_file:-/var/db/monitor-pfsense-agent/node_secret}"
if [ -z "$node_secret" ] && [ -r "$node_secret_file" ]; then
  node_secret="$(cat "$node_secret_file")"
fi
if [ -z "$node_secret" ]; then
  post_command_failed "node secret unavailable"
  exit 1
fi

controller_url="$(read_config_value CONTROLLER_URL)"
node_uid="$(read_config_value NODE_UID)"
customer_code="$(read_config_value CUSTOMER_CODE)"
heartbeat_mode="$(read_config_value HEARTBEAT_MODE)"
heartbeat_mode="${heartbeat_mode:-normal}"

set +e
MONITOR_PACKAGE_UPGRADE_MODE=1 \
MONITOR_UPDATE_NODE_SECRET="$node_secret" /bin/sh "$installer" \
  --controller-url "$controller_url" \
  --node-uid "$node_uid" \
  --customer-code "$customer_code" \
  --heartbeat-mode "$heartbeat_mode" >>"$UPGRADE_LOG" 2>&1
install_code=$?
set -e
unset node_secret

if [ "$install_code" -ne 0 ]; then
  log_msg "install-from-release failed exit=$install_code"
  post_command_failed "install-from-release failed (see $UPGRADE_LOG)"
  exit 1
fi

if [ -f /usr/local/etc/rc.d/monitor_pfsense_agent ]; then
  /usr/sbin/sysrc monitor_pfsense_agent_enable=YES 2>/dev/null || true
  /usr/sbin/service monitor_pfsense_agent restart >>"$UPGRADE_LOG" 2>&1 \
    || /usr/sbin/service monitor_pfsense_agent start >>"$UPGRADE_LOG" 2>&1 \
    || true
fi

log_msg "package upgrade succeeded target=$TARGET_VERSION"
result_json="{\"target_version\":\"$(json_escape "$TARGET_VERSION")\",\"installed_at\":\"$(iso_now)\"}"
post_command_succeeded "$result_json"
exit 0
