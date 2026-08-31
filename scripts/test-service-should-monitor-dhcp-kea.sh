#!/usr/bin/env bash
# Executa service_should_be_monitored() pela camada de shell (php -r quoted),
# nao o bloco PHP isolado. Cobre Kea / kea-dhcp4 / ISC / DHCP off.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT="$ROOT/packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

if ! command -v php >/dev/null 2>&1; then
  echo "FAIL: php nao encontrado no host do teste"
  exit 1
fi

sh -n "$AGENT"
echo "OK   sh -n monitor-pfsense-agent.sh"

# Mesmas funcoes do agente: extrai o bloco real (inclui o php -r com quoting do sh).
# Remove o redirect que engole Fatal error, para o teste poder falhar se o quoting quebrar.
{
  printf '%s\n' 'command_exists() { command -v "$1" >/dev/null 2>&1; }'
  printf '%s\n' 'pfsense_config_path() { printf "%s" "${MONITOR_AGENT_PFSENSE_CONFIG_XML:-/conf/config.xml}"; }'
  awk '
    /^service_should_be_monitored\(\)/ { p = 1 }
    p && /^append_service_json\(\)/ { exit }
    p { print }
  ' "$AGENT" | sed 's| >/dev/null 2>&1||'
} >"$WORKDIR/fn.sh"

# shellcheck disable=SC1091
. "$WORKDIR/fn.sh"

if grep -q "\$config->{'kea-dhcp4'}" "$WORKDIR/fn.sh" \
  || grep -q "\$kea->{'dhcp4-enable'}" "$WORKDIR/fn.sh"; then
  echo "FAIL: bloco extraido ainda tem aspas simples em propriedade PHP"
  exit 1
fi

write_xml() {
  local path="$1"
  cat >"$path"
}

assert_monitor() {
  local label="$1" xml="$2" expect_rc="$3"
  local err rc=0
  err="$WORKDIR/err.$label"
  MONITOR_AGENT_PFSENSE_CONFIG_XML="$xml"
  set +e
  service_should_be_monitored dhcpd >"$WORKDIR/out.$label" 2>"$err"
  rc=$?
  set -e
  if grep -Eiq 'Fatal error|Undefined constant|Parse error' "$err" "$WORKDIR/out.$label"; then
    echo "FAIL $label: PHP fatal/parse no bloco via shell"
    cat "$err" "$WORKDIR/out.$label"
    return 1
  fi
  if [ "$rc" -ne "$expect_rc" ]; then
    echo "FAIL $label: esperado rc=$expect_rc, obteve $rc"
    sed -n '1,20p' "$err"
    return 1
  fi
  echo "OK   $label -> rc=$rc (sem fatal)"
}

xml_backend_kea="$WORKDIR/backend-kea.xml"
write_xml "$xml_backend_kea" <<'EOF'
<?xml version="1.0"?>
<pfsense>
  <system>
    <dhcpbackend>kea</dhcpbackend>
  </system>
</pfsense>
EOF

xml_kea_dhcp4="$WORKDIR/kea-dhcp4.xml"
write_xml "$xml_kea_dhcp4" <<'EOF'
<?xml version="1.0"?>
<pfsense>
  <system></system>
  <kea-dhcp4>
    <lan>
      <enable>1</enable>
    </lan>
  </kea-dhcp4>
</pfsense>
EOF

xml_kea_node="$WORKDIR/kea-node.xml"
write_xml "$xml_kea_node" <<'EOF'
<?xml version="1.0"?>
<pfsense>
  <system></system>
  <kea>
    <enable>1</enable>
    <dhcp4>
      <lan>
        <enable>1</enable>
      </lan>
    </dhcp4>
  </kea>
</pfsense>
EOF

xml_isc="$WORKDIR/isc-dhcpd.xml"
write_xml "$xml_isc" <<'EOF'
<?xml version="1.0"?>
<pfsense>
  <system></system>
  <dhcpd>
    <lan>
      <enable>1</enable>
    </lan>
  </dhcpd>
</pfsense>
EOF

xml_off="$WORKDIR/dhcp-off.xml"
write_xml "$xml_off" <<'EOF'
<?xml version="1.0"?>
<pfsense>
  <system></system>
  <dhcpd>
    <lan></lan>
  </dhcpd>
</pfsense>
EOF

failures=0
assert_monitor "dhcpbackend-kea" "$xml_backend_kea" 0 || failures=$((failures + 1))
assert_monitor "node-kea-dhcp4" "$xml_kea_dhcp4" 0 || failures=$((failures + 1))
assert_monitor "node-kea" "$xml_kea_node" 0 || failures=$((failures + 1))
assert_monitor "isc-dhcpd" "$xml_isc" 0 || failures=$((failures + 1))
assert_monitor "dhcp-off" "$xml_off" 1 || failures=$((failures + 1))

if [ "$failures" -ne 0 ]; then
  echo "FAILED $failures caso(s)"
  exit 1
fi

echo "PASS service_should_be_monitored dhcp/kea via shell"
