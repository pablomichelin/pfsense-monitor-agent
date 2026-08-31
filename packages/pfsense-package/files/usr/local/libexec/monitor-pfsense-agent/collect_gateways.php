#!/usr/local/bin/php
<?php
/**
 * Coleta status runtime de gateways monitorados (dpinger) via APIs pfSense.
 * Saida: JSON array conforme contrato heartbeat (name, status, latency_ms, loss_percent).
 * Em ambiente sem gwlb/config retorna [] (exit 0).
 * Include canônico: /etc/inc/gwlb.inc (CE 2.x / Plus). Fallback: gwlib.inc.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(1);
}

$configPath = getenv('PFSENSE_CONFIG_XML') ?: '/conf/config.xml';

/**
 * P-GW: log estruturado em stderr (não quebra a saída JSON em stdout). Quando os
 * includes/APIs do pfSense não estão disponíveis, registramos o motivo em vez de
 * falhar em silêncio. Use MONITOR_AGENT_DEBUG=0 para silenciar.
 */
function monitor_gw_log(string $reason, array $context = []): void
{
    if ((getenv('MONITOR_AGENT_DEBUG') ?: '1') === '0') {
        return;
    }
    $ctx = $context ? ' ' . json_encode($context, JSON_UNESCAPED_SLASHES) : '';
    fwrite(STDERR, '[collect_gateways] ' . $reason . $ctx . "\n");
}

/**
 * @return list<array{name: string, status: string, latency_ms?: int, loss_percent?: float, impact_on_status?: string}>
 */
function monitor_gateway_impact_on_status(string $name, ?array $configGw): string
{
    $ipproto = is_array($configGw)
        ? strtolower(trim((string) ($configGw['ipprotocol'] ?? '')))
        : '';
    if ($ipproto === 'inet6') {
        return 'optional';
    }
    if (preg_match('/dhcp6|slaac|(^|_)v6(_|$)|ipv6|\\bip6\\b/i', $name)) {
        return 'optional';
    }
    if (preg_match('/(^|_)vpn|ovpnc|wg_/i', $name)) {
        return 'optional';
    }

    return 'critical';
}

/**
 * @return array{name: string, status: string, latency_ms?: int, loss_percent?: float, impact_on_status: string}
 */
function monitor_map_gateway_status(string $name, array $gwStatus, ?array $configGw = null): array
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
        'impact_on_status' => monitor_gateway_impact_on_status($name, $configGw),
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
        monitor_gw_log('config.xml ausente; retornando lista vazia', ['config_path' => $configPath]);
        echo "[]\n";
        exit(0);
    }

    if (!is_readable('/etc/inc/config.inc')) {
        monitor_gw_log('includes do pfSense indisponiveis (config.inc); retornando lista vazia');
        echo "[]\n";
        exit(0);
    }

    $gatewayInc = null;
    foreach (['/etc/inc/gwlb.inc', '/etc/inc/gwlib.inc'] as $candidate) {
        if (is_readable($candidate)) {
            $gatewayInc = $candidate;
            break;
        }
    }
    if ($gatewayInc === null) {
        monitor_gw_log('includes de gateway indisponiveis (gwlb.inc/gwlib.inc); retornando lista vazia');
        echo "[]\n";
        exit(0);
    }

    require_once '/etc/inc/config.inc';
    require_once $gatewayInc;

    if (!function_exists('return_gateways_status') || !function_exists('get_gateways')) {
        monitor_gw_log('APIs de gateway indisponiveis (return_gateways_status/get_gateways ausentes); retornando lista vazia');
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

        $result[] = monitor_map_gateway_status(
            $name,
            $gwStatus,
            is_array($configGw) ? $configGw : null,
        );
    }

    echo json_encode($result, JSON_UNESCAPED_SLASHES) . "\n";
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'collect_gateways: ' . $e->getMessage() . "\n");
    echo "[]\n";
    exit(0);
}
