#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAPSHOT_PHP="$ROOT_DIR/packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/collect_config_snapshot.php"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

CONFIG_XML="$WORK_DIR/config.xml"
SNAPSHOT="$WORK_DIR/config-snapshot.json"

cat >"$CONFIG_XML" <<'XML'
<?xml version="1.0"?>
<pfsense>
  <interfaces>
    <wan><if>em0</if><descr>WAN</descr><ipaddr>203.0.113.10</ipaddr></wan>
    <lan><if>em1</if><descr>LAN</descr><ipaddr>192.168.1.1</ipaddr></lan>
  </interfaces>
  <gateways>
    <gateway_item><name>WAN_GW</name><monitor>8.8.8.8</monitor></gateway_item>
  </gateways>
</pfsense>
XML

PFSENSE_CONFIG_XML="$CONFIG_XML" MONITOR_AGENT_CONFIG_SNAPSHOT_TTL_SECONDS=86400 \
  php -f "$SNAPSHOT_PHP" >"$SNAPSHOT"

grep -q '"mgmt_ips":"192.168.1.1"' "$SNAPSHOT"
grep -q '"wan_ips":"203.0.113.10"' "$SNAPSHOT"
grep -q 'WAN_GW' "$SNAPSHOT"
grep -q '"ttl_seconds":86400' "$SNAPSHOT"

php -r '
  $data = json_decode(file_get_contents($argv[1]), true);
  $ttl = (int) ($data["ttl_seconds"] ?? 0);
  $generated = strtotime($data["generated_at"] ?? "");
  if ($ttl < 60 || $generated === false || (time() - $generated) >= $ttl) {
    exit(1);
  }
' "$SNAPSHOT"

echo "test-config-snapshot-cache OK"
