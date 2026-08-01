#!/usr/bin/env bash
# Testes estaticos: dispatch_pfsense_upgrade + run_pfsense_upgrade.sh (sem pfSense real)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_SH="$ROOT_DIR/packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh"
WRAPPER="$ROOT_DIR/packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/run_pfsense_upgrade.sh"

failures=0

assert_contains() {
  local file="$1"
  local needle="$2"
  local label="$3"
  if grep -q "$needle" "$file"; then
    echo "OK   $label"
  else
    echo "FAIL $label (missing: $needle)"
    failures=$((failures + 1))
  fi
}

assert_exec() {
  local label="$1"
  shift
  if "$@"; then
    echo "OK   $label"
  else
    echo "FAIL $label"
    failures=$((failures + 1))
  fi
}

assert_contains "$AGENT_SH" "pfsense_upgrade_ha_detected" "dispatch define ha pre-check"
assert_contains "$AGENT_SH" "run_pfsense_upgrade.sh" "dispatch spawns wrapper"
assert_contains "$AGENT_SH" "prepared_manual_confirm" "finalize respects semi-manual state"
assert_contains "$AGENT_SH" "upgrade_version_matches_target" "finalize requires version match"
assert_contains "$WRAPPER" "pfSense-upgrade -d -y" "wrapper runs non-interactive upgrade"
assert_contains "$WRAPPER" "ASSUME_ALWAYS_YES=yes" "wrapper sets pkg non-interactive env"
assert_contains "$AGENT_SH" "Insufficient disk space" "dispatch disk pre-check"
assert_contains "$AGENT_SH" "target_version mismatch" "dispatch target coherence"

assert_exec "sh -n monitor-pfsense-agent.sh" sh -n "$AGENT_SH"
assert_exec "sh -n run_pfsense_upgrade.sh" sh -n "$WRAPPER"

if [[ "$failures" -gt 0 ]]; then
  echo "$failures failure(s)" >&2
  exit 1
fi

echo "test-pfsense-upgrade-dispatch: OK"
