#!/usr/local/bin/php
<?php
/**
 * Coleta status runtime de gateways monitorados (dpinger) via APIs pfSense.
 * Saida: JSON array conforme contrato heartbeat (name, status, latency_ms, loss_percent).
 * Em ambiente sem gwlib/config retorna [] (exit 0).
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(1);
}

$configPath = getenv('PFSENSE_CONFIG_XML') ?: '/conf/config.xml';

/**
 * @return list<array{name: string, status: string, latency_ms?: int, loss_percent?: float}>
 */
function monitor_map_gateway_status(string $name, array $gwStatus): array
{
    $status = strtolower(trim((string) ($gwStatus['status'] ?? '')));
    $substatus = strtolower(trim((string) ($gwStatus['substatus'] ?? 'none')));

    $mapped = 'unknown';
    if ($status === 'down' || $substatus === 'force_down' || $substatus === 'down' || $substatus === 'highloss' || $substatus === 'highdelay') {
        $mapped = 'down';
    } elseif ($substatus === 'loss' || $substatus === 'delay' || $substatus === 'latency') {
        $mapped = 'degraded';
    } elseif ($status === 'online' || $substatus === 'none' || $substatus === '') {
        $mapped = 'online';
    }

    $delayRaw = trim((string) ($gwStatus['delay'] ?? ''));
    $lossRaw = trim((string) ($gwStatus['loss'] ?? ''));

    $latencyMs = null;
    if ($delayRaw !== '' && preg_match('/^([\d.]+)\s*ms$/i', $delayRaw, $m)) {
        $latencyMs = (int) round((float) $m[1]);
    }

    $lossPercent = null;
    if ($lossRaw !== '' && preg_match('/^([\d.]+)\s*%?$/', $lossRaw, $m)) {
        $lossPercent = round((float) $m[1], 1);
    }

    $entry = [
        'name' => $name,
        'status' => $mapped,
    ];
    if ($latencyMs !== null) {
        $entry['latency_ms'] = $latencyMs;
    }
    if ($lossPercent !== null) {
        $entry['loss_percent'] = $lossPercent;
    }

    return $entry;
}

/**
 * @return list<string>
 */
function monitor_gateway_is_monitored(array $gatewayConfig): bool
{
    if (!empty($gatewayConfig['monitor_disable'])) {
        return false;
    }
    $monitor = trim((string) ($gatewayConfig['monitor'] ?? ''));
    if ($monitor === '' || strcasecmp($monitor, 'disable') === 0) {
        return false;
    }

    return true;
}

try {
    $includePaths = [
        '/etc/inc',
        '/usr/local/pkg',
    ];
    set_include_path(get_include_path() . PATH_SEPARATOR . implode(PATH_SEPARATOR, $includePaths));

    if (!is_file($configPath)) {
        echo "[]\n";
        exit(0);
    }

    if (!is_readable('/etc/inc/config.inc') || !is_readable('/etc/inc/gwlib.inc')) {
        echo "[]\n";
        exit(0);
    }

    require_once '/etc/inc/config.inc';
    require_once '/etc/inc/gwlib.inc';

    if (!function_exists('return_gateways_status') || !function_exists('get_gateways')) {
        echo "[]\n";
        exit(0);
    }

    $gatewaysConfig = get_gateways();
    $statuses = return_gateways_status(true);
    if (!is_array($statuses)) {
        $statuses = [];
    }

    $result = [];
    foreach ($statuses as $gwName => $gwStatus) {
        if (!is_array($gwStatus)) {
            continue;
        }
        $name = trim((string) ($gwStatus['name'] ?? $gwName));
        if ($name === '') {
            continue;
        }

        $configGw = $gatewaysConfig[$name] ?? null;
        if (is_array($configGw) && !monitor_gateway_is_monitored($configGw)) {
            continue;
        }

        $result[] = monitor_map_gateway_status($name, $gwStatus);
    }

    echo json_encode($result, JSON_UNESCAPED_SLASHES) . "\n";
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'collect_gateways: ' . $e->getMessage() . "\n");
    echo "[]\n";
    exit(0);
}
