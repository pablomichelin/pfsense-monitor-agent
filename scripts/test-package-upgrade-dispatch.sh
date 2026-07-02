#!/usr/bin/env bash
# Testes estáticos: dispatch_package_upgrade + run_package_upgrade.sh (sem pfSense real)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_SH="$ROOT_DIR/packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh"
WRAPPER="$ROOT_DIR/packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/run_package_upgrade.sh"

assert_contains() {
  file="$1"
  needle="$2"
  label="$3"
  if grep -q "$needle" "$file"; then
    echo "OK   $label"
  else
    echo "FAIL $label (missing: $needle)"
    exit 1
  fi
}

assert_exec() {
  label="$1"
  shift
  if "$@"; then
    echo "OK   $label"
  else
    echo "FAIL $label"
    exit 1
  fi
}

echo "=== package_upgrade dispatch (monitor-pfsense-agent.sh) ==="
assert_contains "$AGENT_SH" "dispatch_package_upgrade" "dispatch defined"
assert_contains "$AGENT_SH" "package_upgrade)" "command case handler"
assert_contains "$AGENT_SH" "artifact_url" "heartbeat parser reads artifact_url"
assert_contains "$AGENT_SH" "package_upgrade_url_allowed" "URL allowlist check"
assert_contains "$AGENT_SH" "run_package_upgrade.sh" "dispatch spawns wrapper"

echo "=== run_package_upgrade.sh ==="
assert_exec "sh -n run_package_upgrade.sh" sh -n "$WRAPPER"
assert_contains "$WRAPPER" "install-from-release.sh" "wrapper uses install-from-release"
assert_contains "$WRAPPER" "package_upgrade_url_allowed" "wrapper validates URLs"
assert_contains "$WRAPPER" "post_command_succeeded" "wrapper reports success"

echo "=== API node_commands payload ==="
API_SRC="$ROOT_DIR/apps/api/src/node-commands/node-commands.service.ts"
assert_contains "$API_SRC" "package_upgrade" "enum type handled"
assert_contains "$API_SRC" "artifact_url" "payload includes artifact_url"

echo "All package upgrade static checks passed."
