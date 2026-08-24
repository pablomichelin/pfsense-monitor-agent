#!/usr/local/bin/php
<?php
/**
 * Lista ou aponta o firmware branch do pfSense.
 *
 * list — só lê arquivos locais + config.xml (barato, para o heartbeat).
 * set  — mesma sequência da GUI: update_repos(), grava pkg_repo_conf_path,
 *        pkg_switch_repo(). Allowlist: latest | 2.8.1 | 2.9.0.
 *        Nunca devel / snapshot / Plus upgrade.
 *
 * Uso: set_pfsense_update_branch.php list
 *      set_pfsense_update_branch.php set <latest|2.8.1|2.9.0>
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(1);
}

const ALLOWED_TARGETS = ['latest', '2.8.1', '2.9.0'];
const REPO_DIRS = [
    '/usr/local/share/pfSense/pkg/repos',
    '/usr/local/share/pfSense-plus/pkg/repos',
];

$action = $argv[1] ?? '';
$target = strtolower(trim((string) ($argv[2] ?? '')));

if ($action === 'list') {
    emit_json(build_list_payload(false));
    exit(0);
}

if ($action === 'set') {
    if (!in_array($target, ALLOWED_TARGETS, true)) {
        emit_json([
            'ok' => false,
            'error' => 'target not allowlisted',
        ], 1);
    }

    $result = apply_branch($target);
    emit_json($result, !empty($result['ok']) ? 0 : 1);
}

fwrite(STDERR, "usage: set_pfsense_update_branch.php list|set <latest|2.8.1|2.9.0>\n");
exit(1);

function emit_json(array $payload, int $exitCode = 0): void
{
    echo json_encode($payload, JSON_UNESCAPED_SLASHES) . "\n";
    exit($exitCode);
}

function product_is_plus(): bool
{
    $version = trim((string) @file_get_contents('/etc/version'));
    if ($version === '') {
        return false;
    }
    if (preg_match('/^(2[1-9]|[3-9]\d)\.\d+/', $version) === 1) {
        return true;
    }

    return stripos($version, 'plus') !== false;
}

function repo_is_forbidden(array $repo): bool
{
    $hay = strtolower(trim(($repo['name'] ?? '') . ' ' . ($repo['descr'] ?? '')));
    if (preg_match('/\b(devel|development|snapshot)\b/', $hay) === 1) {
        return true;
    }
    if (preg_match('/next major|plus upgrade|pfsense plus upgrade|migrate.*plus/', $hay) === 1) {
        return true;
    }

    return false;
}

function scan_repos_from_disk(): array
{
    $result = [];
    foreach (REPO_DIRS as $dir) {
        if (!is_dir($dir)) {
            continue;
        }
        foreach (glob($dir . '/*-repo-*.name') ?: [] as $nameFile) {
            $name = trim((string) @file_get_contents($nameFile));
            if ($name === '' || strlen($name) > 64) {
                continue;
            }
            $base = preg_replace('/\.name$/', '', $nameFile);
            $conf = $base . '.conf';
            if (!is_file($conf)) {
                $alt = $dir . '/pfSense-repo-' . $name . '.conf';
                $conf = is_file($alt) ? $alt : '';
            }
            if ($conf === '') {
                continue;
            }
            $descrFile = $base . '.descr';
            $descr = is_file($descrFile)
                ? trim((string) @file_get_contents($descrFile))
                : $name;
            $result[] = [
                'name' => $name,
                'path' => $conf,
                'descr' => $descr !== '' ? $descr : $name,
                'default' => is_file($base . '.default'),
            ];
        }
    }

    return $result;
}

function current_repo_saved_value(): string
{
    $xml = (string) @file_get_contents(
        getenv('PFSENSE_CONFIG_XML') ?: '/conf/config.xml'
    );
    if ($xml === '') {
        return '';
    }
    if (preg_match('#<pkg_repo_conf_path>([^<]*)</pkg_repo_conf_path>#', $xml, $matches) !== 1) {
        return '';
    }

    return html_entity_decode(trim($matches[1]), ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function resolve_current(array $repos): array
{
    $saved = current_repo_saved_value();
    $fallback = [
        'name' => '',
        'path' => $saved,
        'descr' => '',
        'default' => false,
    ];
    foreach ($repos as $repo) {
        if (isset($repo['default']) && $repo['default']) {
            $fallback = $repo;
            break;
        }
    }
    if ($saved === '') {
        return $fallback;
    }
    foreach ($repos as $repo) {
        if (
            $saved === ($repo['name'] ?? '')
            || $saved === ($repo['path'] ?? '')
            || basename($saved) === basename((string) ($repo['path'] ?? ''))
        ) {
            return $repo;
        }
    }

    return $fallback + ['name' => $saved];
}

function allowed_repo_names(array $repos): array
{
    $names = [];
    foreach ($repos as $repo) {
        if (repo_is_forbidden($repo)) {
            continue;
        }
        $name = trim((string) ($repo['name'] ?? ''));
        if ($name !== '') {
            $names[] = $name;
        }
    }

    return array_values(array_unique($names));
}

function build_list_payload(bool $refresh): array
{
    $repos = $refresh ? official_repo_list() : scan_repos_from_disk();
    $current = resolve_current($repos);
    $plus = product_is_plus();

    return [
        'ok' => true,
        'product' => $plus ? 'plus' : 'ce',
        'current_name' => substr(trim((string) ($current['name'] ?? '')), 0, 64),
        'current_descr' => substr(trim((string) ($current['descr'] ?? '')), 0, 160),
        'current_path' => substr(trim((string) ($current['path'] ?? '')), 0, 200),
        'branches' => allowed_repo_names($repos),
        'repos' => array_map(
            static function (array $repo) use ($plus): array {
                return [
                    'name' => $repo['name'] ?? '',
                    'descr' => $repo['descr'] ?? '',
                    'default' => !empty($repo['default']),
                    'allowed' => !repo_is_forbidden($repo)
                        && (!$plus || !preg_match('/^2\.[89]\./', (string) ($repo['name'] ?? ''))),
                ];
            },
            $repos
        ),
    ];
}

function official_repo_list(): array
{
    if (is_file('/etc/inc/pkg-utils.inc')) {
        require_once '/etc/inc/config.inc';
        require_once '/etc/inc/pkg-utils.inc';
        if (function_exists('update_repos')) {
            try {
                update_repos();
            } catch (Throwable $exception) {
                // segue com a lista local
            }
        }
        if (function_exists('pkg_list_repos')) {
            $repos = pkg_list_repos();
            if (is_array($repos) && $repos !== []) {
                return $repos;
            }
        }
    }

    return scan_repos_from_disk();
}

function repo_matches_version(array $repo, string $version): bool
{
    $hay = strtolower(
        ($repo['name'] ?? '') . ' ' . ($repo['descr'] ?? '') . ' ' . ($repo['path'] ?? '')
    );
    $compact = str_replace('.', '', $version);
    $underscore = str_replace('.', '_', $version);

    return str_contains($hay, strtolower($version))
        || str_contains($hay, $underscore)
        || str_contains($hay, $compact);
}

function pick_repo(array $repos, string $target, bool $plus): ?array
{
    $candidates = [];
    foreach ($repos as $repo) {
        if (repo_is_forbidden($repo)) {
            continue;
        }
        $name = trim((string) ($repo['name'] ?? ''));
        if ($plus && preg_match('/^2\.[89]\./', $name) === 1) {
            continue;
        }
        $candidates[] = $repo;
    }

    if ($candidates === []) {
        return null;
    }

    if ($target === 'latest') {
        foreach ($candidates as $repo) {
            if (!empty($repo['default'])) {
                return $repo;
            }
        }
        foreach ($candidates as $repo) {
            $descr = strtolower((string) ($repo['descr'] ?? ''));
            if (preg_match('/current stable|latest stable/', $descr) === 1) {
                return $repo;
            }
        }
        $newest = $candidates[0];
        foreach ($candidates as $repo) {
            if (version_compare(
                preg_replace('/[^0-9.]/', '', (string) ($repo['name'] ?? '')) ?: '0',
                preg_replace('/[^0-9.]/', '', (string) ($newest['name'] ?? '')) ?: '0',
                '>'
            )) {
                $newest = $repo;
            }
        }

        return $newest;
    }

    foreach ($candidates as $repo) {
        if (strcasecmp((string) ($repo['name'] ?? ''), $target) === 0) {
            return $repo;
        }
    }
    foreach ($candidates as $repo) {
        if (repo_matches_version($repo, $target)) {
            return $repo;
        }
    }

    return null;
}

function apply_branch(string $target): array
{
    $plus = product_is_plus();
    if ($plus && $target !== 'latest') {
        return [
            'ok' => false,
            'error' => 'plus firmware only accepts latest',
            'product' => 'plus',
        ];
    }

    if (!is_file('/etc/inc/config.inc') || !is_file('/etc/inc/pkg-utils.inc')) {
        return [
            'ok' => false,
            'error' => 'pfSense pkg-utils.inc not found',
        ];
    }

    require_once '/etc/inc/config.inc';
    require_once '/etc/inc/pkg-utils.inc';

    if (function_exists('update_repos')) {
        try {
            update_repos();
        } catch (Throwable $exception) {
            // tenta com a lista já presente
        }
    }

    $repos = function_exists('pkg_list_repos') ? pkg_list_repos() : scan_repos_from_disk();
    if (!is_array($repos) || $repos === []) {
        $repos = scan_repos_from_disk();
    }

    $chosen = pick_repo($repos, $target, $plus);
    if ($chosen === null) {
        return [
            'ok' => false,
            'error' => 'requested branch is not offered on this firewall',
            'target' => $target,
            'branches' => allowed_repo_names($repos),
        ];
    }

    if (!function_exists('pkg_switch_repo') || !function_exists('write_config')) {
        return [
            'ok' => false,
            'error' => 'pkg_switch_repo/write_config unavailable',
        ];
    }

    $required = (new ReflectionFunction('pkg_switch_repo'))->getNumberOfRequiredParameters();
    $confValue = $required >= 2
        ? (string) $chosen['path']
        : (string) $chosen['name'];

    if (function_exists('config_set_path')) {
        config_set_path('system/pkg_repo_conf_path', $confValue);
    } else {
        global $config;
        if (!is_array($config)) {
            $config = [];
        }
        $config['system']['pkg_repo_conf_path'] = $confValue;
    }

    write_config('systemup-monitor: set firmware update branch');

    if ($required >= 2) {
        pkg_switch_repo((string) $chosen['path'], (string) $chosen['name']);
    } else {
        pkg_switch_repo();
    }

    $after = resolve_current(
        function_exists('pkg_list_repos') ? pkg_list_repos() : $repos
    );

    return [
        'ok' => true,
        'target' => $target,
        'current_name' => substr(trim((string) ($after['name'] ?? $chosen['name'])), 0, 64),
        'current_descr' => substr(trim((string) ($after['descr'] ?? $chosen['descr'])), 0, 160),
        'switched' => true,
    ];
}
