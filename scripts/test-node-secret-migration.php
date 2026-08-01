<?php
/**
 * Testes unitarios: migracao node_secret XML -> arquivo runtime.
 * Executar: php scripts/test-node-secret-migration.php
 */

declare(strict_types=1);

$incPath = dirname(__DIR__) . '/packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc';
if (!is_file($incPath)) {
    fwrite(STDERR, "systemup_monitor.inc not found: {$incPath}\n");
    exit(1);
}

$stubDir = sys_get_temp_dir() . '/systemup-node-secret-test-' . getmypid();
$secretDir = $stubDir . '/var/db/monitor-pfsense-agent';
mkdir($secretDir, 0700, true);
file_put_contents("{$stubDir}/config.inc", "<?php\n");
file_put_contents("{$stubDir}/globals.inc", "<?php\n");
set_include_path($stubDir . PATH_SEPARATOR . get_include_path());

$config = [];
$writeConfigReasons = [];

if (!defined('SYSTEMUP_MONITOR_NODE_SECRET_FILE')) {
    define('SYSTEMUP_MONITOR_NODE_SECRET_FILE', $secretDir . '/node_secret');
}

function config_read(): void
{
}

function write_config(string $reason): void
{
    global $writeConfigReasons;
    $writeConfigReasons[] = $reason;
}

require_once $incPath;

$failures = 0;

function assert_true(bool $condition, string $label): void
{
    global $failures;
    if ($condition) {
        echo "OK   {$label}\n";
        return;
    }
    echo "FAIL {$label}\n";
    $failures++;
}

function reset_pkg(array $overrides = []): array
{
    global $config;
    $config = [
        'installedpackages' => [
            'systemupmonitor' => [
                'config' => [
                    array_merge([
                        'controller_url' => 'https://example.test',
                        'node_uid' => 'node-test-1',
                        'customer_code' => 'CLIENT',
                        'node_secret' => '',
                        'secret_stored' => '',
                        'enabled' => 'on',
                    ], $overrides),
                ],
            ],
        ],
    ];

    @unlink(SYSTEMUP_MONITOR_NODE_SECRET_FILE);

    return systemup_monitor_config_ref();
}

// 1) Resolve from file when present
$pkg = reset_pkg();
systemup_monitor_write_node_secret_file('secret-from-file-abc');
assert_true(
    systemup_monitor_resolve_node_secret($pkg) === 'secret-from-file-abc',
    'resolve le secret do arquivo'
);
assert_true(
    systemup_monitor_node_secret_is_stored($pkg),
    'node_secret_is_stored com arquivo'
);

// 2) Migrate legacy XML to file
$pkg = reset_pkg(['node_secret' => 'legacy-xml-secret-xyz', 'secret_stored' => '']);
$migrated = systemup_monitor_migrate_node_secret_from_xml($pkg, false);
assert_true($migrated, 'migra secret legado do XML');
assert_true(
    systemup_monitor_read_node_secret_file() === 'legacy-xml-secret-xyz',
    'arquivo contem secret migrado'
);
assert_true($pkg['node_secret'] === '', 'XML node_secret limpo apos migracao');
assert_true(($pkg['secret_stored'] ?? '') === 'on', 'secret_stored marcado on');

// 3) has_required_runtime_config usa arquivo
$missing = [];
assert_true(
    systemup_monitor_has_required_runtime_config($pkg, $missing),
    'runtime config ok com secret no arquivo'
);

// 4) render_agent_config inclui NODE_SECRET do arquivo
$rendered = systemup_monitor_render_agent_config($pkg);
assert_true(
    strpos($rendered, 'NODE_SECRET="legacy-xml-secret-xyz"') !== false,
    'render_agent_config usa secret do arquivo'
);
assert_true(
    strpos($rendered, 'MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED="1"') !== false,
    'render inclui flag upgrade exec default 0'
);

// 5) store_node_secret via bootstrap path
$pkg = reset_pkg();
systemup_monitor_store_node_secret($pkg, 'bootstrap-new-secret', false);
assert_true(
    systemup_monitor_read_node_secret_file() === 'bootstrap-new-secret',
    'store_node_secret grava arquivo'
);
assert_true($pkg['node_secret'] === '', 'store limpa XML');

// 6) display label
assert_true(
    systemup_monitor_secret_display_label($pkg) === 'configurado',
    'secret_display_label retorna configurado'
);

// cleanup
array_map('unlink', glob($secretDir . '/*') ?: []);
@rmdir($secretDir);
@rmdir(dirname($secretDir));
@rmdir(dirname(dirname($secretDir)));
@rmdir($stubDir);

if ($failures > 0) {
    echo "\n{$failures} failure(s)\n";
    exit(1);
}

echo "\nAll node_secret migration tests passed.\n";
exit(0);
