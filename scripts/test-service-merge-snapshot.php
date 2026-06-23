<?php
/**
 * Smoke unitario: merge cirurgico de installedpackages.service (package 0.3.6+).
 * Executar: php scripts/test-service-merge-snapshot.php
 */

declare(strict_types=1);

$incPath = dirname(__DIR__) . '/packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc';
if (!is_file($incPath)) {
    fwrite(STDERR, "systemup_monitor.inc not found: {$incPath}\n");
    exit(1);
}

$stubDir = sys_get_temp_dir() . '/systemup-monitor-test-' . getmypid();
mkdir($stubDir, 0700, true);
file_put_contents("{$stubDir}/config.inc", "<?php\n");
file_put_contents("{$stubDir}/globals.inc", "<?php\n");
set_include_path($stubDir . PATH_SEPARATOR . get_include_path());

$config = [];
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

function reset_config(array $services = []): void
{
    global $config;
    $config = [
        'installedpackages' => [
            'systemupmonitor' => ['enabled' => 'on'],
            'service' => $services,
        ],
    ];
}

$otherService = [
    'name' => 'fake_other_package_service',
    'description' => 'Fake Other Package',
    'rcfile' => 'fake_other',
];

$monitorDefinition = systemup_monitor_service_definition();

reset_config([$otherService, $monitorDefinition]);

$snapshot = systemup_monitor_export_package_snapshot();
assert_true(
    count($snapshot['monitor_service_entry'] ?? []) > 0,
    'export contem apenas monitor_service_entry'
);
assert_true(
    !array_key_exists('service_entries', $snapshot),
    'export nao inclui service_entries legado'
);
assert_true(
    ($snapshot['monitor_service_entry']['name'] ?? '') === 'monitor_pfsense_agent',
    'export monitor_service_entry e nossa entrada'
);

// Simula config do disco com outro servico + snapshot antigo com array completo stale.
reset_config([$otherService]);
$staleSnapshot = [
    'remove_systemupmonitor' => false,
    'systemupmonitor' => ['enabled' => 'on'],
    'service_entries' => [
        $monitorDefinition,
        ['name' => 'ghost_removed_service', 'rcfile' => 'ghost'],
    ],
];
systemup_monitor_import_package_snapshot($staleSnapshot);

$names = array_map(
    static fn($s) => is_array($s) ? ($s['name'] ?? '') : '',
    $config['installedpackages']['service'] ?? []
);
assert_true(in_array('fake_other_package_service', $names, true), 'servico de terceiro preservado apos import legado');
assert_true(in_array('monitor_pfsense_agent', $names, true), 'nossa entrada upsert apos import legado');
assert_true(!in_array('ghost_removed_service', $names, true), 'servico fantasma do snapshot stale nao aplicado');

// Import moderno: remove_monitor_service
reset_config([$otherService, $monitorDefinition]);
$removeSnapshot = systemup_monitor_export_package_snapshot();
$removeSnapshot['remove_monitor_service'] = true;
$removeSnapshot['monitor_service_entry'] = null;
systemup_monitor_import_package_snapshot($removeSnapshot);
$namesAfterRemove = array_map(
    static fn($s) => is_array($s) ? ($s['name'] ?? '') : '',
    $config['installedpackages']['service'] ?? []
);
assert_true(!in_array('monitor_pfsense_agent', $namesAfterRemove, true), 'remove_monitor_service remove so nossa entrada');
assert_true(in_array('fake_other_package_service', $namesAfterRemove, true), 'remove_monitor_service preserva terceiros');

// unregister_service isolado
reset_config([$otherService, $monitorDefinition]);
systemup_monitor_unregister_service();
$namesAfterUnregister = array_map(
    static fn($s) => is_array($s) ? ($s['name'] ?? '') : '',
    $config['installedpackages']['service'] ?? []
);
assert_true(count($namesAfterUnregister) === 1, 'unregister remove apenas uma entrada');
assert_true($namesAfterUnregister[0] === 'fake_other_package_service', 'unregister preserva servico de terceiro');

echo PHP_EOL;
if ($failures > 0) {
    echo "RESULTADO: {$failures} falha(s)\n";
    exit(1);
}
echo "RESULTADO: todos os cenarios passaram\n";
exit(0);
