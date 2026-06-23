#!/usr/bin/env php
<?php
/**
 * Testes das regras de harden do auto-update (URL allowlist, SHA256).
 * Copia logica de systemup_monitor.inc para rodar fora do pfSense.
 */

declare(strict_types=1);

function systemup_monitor_truncate_log_url($url, $max = 120)
{
    $url = trim((string) $url);
    if (strlen($url) <= $max) {
        return $url;
    }

    return substr($url, 0, $max) . '...';
}

function systemup_monitor_url_allowed_for_controller($url, $controllerUrl)
{
    $url = trim((string) $url);
    $controllerUrl = rtrim(trim((string) $controllerUrl), '/');
    if ($url === '' || $controllerUrl === '') {
        return false;
    }

    $parsedUrl = parse_url($url);
    if (!is_array($parsedUrl) || empty($parsedUrl['host'])) {
        return false;
    }

    if (strpos($url, $controllerUrl . '/') === 0) {
        return true;
    }

    $parsedController = parse_url($controllerUrl);
    $controllerHost = trim((string) ($parsedController['host'] ?? ''));
    if ($controllerHost !== '' && strcasecmp($parsedUrl['host'], $controllerHost) === 0) {
        return true;
    }

    $allowedHosts = array(
        'raw.githubusercontent.com',
        'github.com',
        'objects.githubusercontent.com',
    );
    foreach ($allowedHosts as $host) {
        if (strcasecmp($parsedUrl['host'], $host) === 0) {
            return true;
        }
    }

    return false;
}

function systemup_monitor_validate_release_urls($controllerUrl, array $release)
{
    foreach (array('artifact_url', 'installer_url') as $field) {
        $url = trim((string) ($release[$field] ?? ''));
        if ($url === '') {
            return 'Release sem URL: ' . $field;
        }
        if (!systemup_monitor_url_allowed_for_controller($url, $controllerUrl)) {
            return 'URL de release nao permitida (' . $field . '): '
                . systemup_monitor_truncate_log_url($url);
        }
    }

    $sha256 = trim((string) ($release['sha256'] ?? ''));
    if ($sha256 === '' || !preg_match('/^[a-f0-9]{64}$/i', $sha256)) {
        return 'Release sem SHA256 valido.';
    }

    return '';
}

$controller = 'https://pfs-monitor.systemup.inf.br';

$okRelease = array(
    'artifact_url' => 'https://raw.githubusercontent.com/org/repo/main/dist/pfsense-package/monitor-pfsense-package-v0.3.7.tar.gz',
    'installer_url' => 'https://raw.githubusercontent.com/org/repo/main/packages/pfsense-package/bootstrap/install-from-release.sh',
    'sha256' => str_repeat('a', 64),
);

assert(systemup_monitor_validate_release_urls($controller, $okRelease) === '');

$badHost = $okRelease;
$badHost['artifact_url'] = 'https://evil.example.com/pkg.tar.gz';
assert(systemup_monitor_validate_release_urls($controller, $badHost) !== '');

$badSha = $okRelease;
$badSha['sha256'] = 'not-a-hash';
assert(systemup_monitor_validate_release_urls($controller, $badSha) !== '');

assert(systemup_monitor_url_allowed_for_controller(
    'https://pfs-monitor.systemup.inf.br/dist/pfsense-package/pkg.tar.gz',
    $controller
) === true);

echo "test-package-update-harden OK\n";
