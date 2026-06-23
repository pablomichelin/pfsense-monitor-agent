#!/usr/local/bin/php
<?php
/**
 * Parse unico de config.xml para cache diario (interfaces, IPs, nomes de gateway).
 * Saida: JSON em stdout; stderr apenas em erro fatal.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(1);
}

$configPath = getenv('PFSENSE_CONFIG_XML') ?: '/conf/config.xml';
$ttlSeconds = (int) (getenv('MONITOR_AGENT_CONFIG_SNAPSHOT_TTL_SECONDS') ?: '86400');
if ($ttlSeconds < 60) {
    $ttlSeconds = 86400;
}

if (!is_file($configPath) || !is_readable($configPath)) {
    fwrite(STDERR, "config.xml not readable: {$configPath}\n");
    exit(1);
}

$config = @simplexml_load_file($configPath);
if ($config === false) {
    fwrite(STDERR, "failed to parse config.xml\n");
    exit(1);
}

$interfaces = [];
if (isset($config->interfaces)) {
    foreach ($config->interfaces->children() as $role => $node) {
        $if = trim((string) ($node->if ?? ''));
        if ($if === '') {
            continue;
        }
        $descr = trim((string) ($node->descr ?? ''));
        $ipaddr = trim((string) ($node->ipaddr ?? ''));
        if ($ipaddr !== '' && !preg_match('/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/', $ipaddr)) {
            $ipaddr = '';
        }
        $display = $descr !== '' ? $descr : (string) $role;
        $entry = [
            'name' => $display,
            'role' => (string) $role,
            'if' => $if,
        ];
        if ($ipaddr !== '') {
            $entry['ip'] = $ipaddr;
        }
        $interfaces[] = $entry;
    }
}

$gatewayNames = [];
if (isset($config->gateways->gateway_item)) {
    foreach ($config->gateways->gateway_item as $item) {
        $name = trim((string) ($item->name ?? ''));
        if ($name === '') {
            continue;
        }
        $monitorDisable = trim((string) ($item->monitor_disable ?? ''));
        $monitor = trim((string) ($item->monitor ?? ''));
        if ($monitorDisable !== '' && $monitorDisable !== '0') {
            continue;
        }
        if ($monitor === '' || strcasecmp($monitor, 'disable') === 0) {
            continue;
        }
        $gatewayNames[] = $name;
    }
}

$mgmtIps = [];
$wanIps = [];
foreach ($interfaces as $iface) {
    $role = strtolower((string) ($iface['role'] ?? ''));
    $ip = trim((string) ($iface['ip'] ?? ''));
    if ($ip === '') {
        continue;
    }
    if ($role === 'wan') {
        $wanIps[] = $ip;
    } elseif ($role === 'lan' || strncmp($role, 'opt', 3) === 0) {
        $mgmtIps[] = $ip;
    }
}

$snapshot = [
    'generated_at' => gmdate('Y-m-d\TH:i:s\Z'),
    'ttl_seconds' => $ttlSeconds,
    'config_mtime' => (int) @filemtime($configPath),
    'interfaces' => $interfaces,
    'gateway_names' => array_values(array_unique($gatewayNames)),
    'mgmt_ips' => implode(',', $mgmtIps),
    'wan_ips' => implode(',', $wanIps),
];

echo json_encode($snapshot, JSON_UNESCAPED_SLASHES) . "\n";
exit(0);
