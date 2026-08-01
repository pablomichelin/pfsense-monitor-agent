#!/usr/local/bin/php
<?php

set_include_path(get_include_path() . PATH_SEPARATOR . '/etc/inc' . PATH_SEPARATOR . '/usr/local/pkg');

require_once('/etc/inc/config.inc');
require_once('/etc/inc/globals.inc');
require_once('/etc/inc/pkg-utils.inc');
require_once('/usr/local/pkg/systemup_monitor.inc');

function systemup_monitor_cli_usage()
{
    $usage = <<<TXT
Usage:
  systemup_monitor_cli.php seed [--controller-url URL] [--node-uid UID] [--node-secret SECRET] [--customer-code CODE] [--interval-seconds N] [--services CSV] [--heartbeat-mode normal|light] [--config-backup-enabled yes|no] [--enable]
  systemup_monitor_cli.php register-gui  Registra menu Services/Status no config.xml (reparo quando arquivos existem mas GUI nao aparece).
  systemup_monitor_cli.php sync   Regenera o config do agente com a versão atual do package (AGENT_VERSION).
  systemup_monitor_cli.php upgrade [--force]  Atualiza o package para a versão publicada no controlador.
  systemup_monitor_cli.php release-check  Testa consulta de release no controlador (diagnóstico).
  systemup_monitor_cli.php upgrade-check [--force]  Verifica atualização pfSense OS (pfSense-upgrade -d -c).
  systemup_monitor_cli.php remove
TXT;

    fwrite(STDERR, $usage . PHP_EOL);
}

function systemup_monitor_cli_parse_args($argv)
{
    $options = array(
        'enable' => false,
    );
    $count = count($argv);

    for ($index = 2; $index < $count; $index++) {
        $arg = $argv[$index];
        switch ($arg) {
            case '--controller-url':
                $options['controller_url'] = $argv[++$index] ?? '';
                break;
            case '--node-uid':
                $options['node_uid'] = $argv[++$index] ?? '';
                break;
            case '--node-secret':
                $options['node_secret'] = $argv[++$index] ?? '';
                break;
            case '--customer-code':
                $options['customer_code'] = $argv[++$index] ?? '';
                break;
            case '--interval-seconds':
                $options['interval_seconds'] = $argv[++$index] ?? '';
                break;
            case '--services':
                $options['services_csv'] = $argv[++$index] ?? '';
                break;
            case '--heartbeat-mode':
                $options['heartbeat_mode'] = $argv[++$index] ?? '';
                break;
            case '--enable':
                $options['enable'] = true;
                break;
            case '--config-backup-enabled':
                $options['config_backup_enabled'] = $argv[++$index] ?? '';
                break;
            default:
                throw new InvalidArgumentException('Unknown option: ' . $arg);
        }
    }

    return $options;
}

function systemup_monitor_cli_seed($options)
{
    install_package_xml('systemup-monitor');

    $pkg =& systemup_monitor_config_ref();
    systemup_monitor_apply_defaults();

    foreach (array('controller_url', 'node_uid', 'node_secret', 'customer_code', 'interval_seconds', 'services_csv') as $field) {
        if (isset($options[$field]) && $options[$field] !== '') {
            if ($field === 'node_secret') {
                systemup_monitor_store_node_secret($pkg, $options[$field], false);
            } else {
                $pkg[$field] = $options[$field];
            }
        }
    }
    if (isset($options['heartbeat_mode']) && $options['heartbeat_mode'] !== '') {
        $pkg['heartbeat_mode'] = systemup_monitor_normalize_heartbeat_mode($options['heartbeat_mode']);
    }
    if (isset($options['config_backup_enabled']) && $options['config_backup_enabled'] !== '') {
        $pkg['config_backup_enabled'] = systemup_monitor_normalize_yes_no(
            $options['config_backup_enabled'],
            'on'
        );
    }

    $pkg['enabled'] = $options['enable'] ? 'on' : '';

    systemup_monitor_persist_package_config('SystemUp Monitor package bootstrap updated');
    systemup_monitor_sync_config();

    echo "SystemUp Monitor package config seeded.\n";
}

function systemup_monitor_cli_register_gui()
{
    if (!systemup_monitor_ensure_gui_registration('SystemUp Monitor GUI registration repair')) {
        fwrite(STDERR, "SystemUp Monitor GUI registration failed (menu still missing).\n");
        exit(1);
    }

    echo "SystemUp Monitor GUI registration refreshed.\n";
}

function systemup_monitor_cli_remove()
{
    global $config;

    systemup_monitor_package_uninstall();

    $pkg =& systemup_monitor_config_ref();
    $pkg['enabled'] = '';
    systemup_monitor_sync_config(false, false);
    systemup_monitor_unregister_service();

    unset($config['installedpackages']['systemupmonitor']);
    delete_package_xml('systemup-monitor');
    $snapshot = systemup_monitor_export_package_snapshot();
    $snapshot['remove_systemupmonitor'] = true;
    $snapshot['remove_monitor_service'] = true;
    systemup_monitor_persist_package_config('SystemUp Monitor package bootstrap removed', $snapshot);

    echo "SystemUp Monitor package config removed.\n";
}

try {
    $action = $argv[1] ?? '';

    switch ($action) {
        case 'seed':
            systemup_monitor_cli_seed(systemup_monitor_cli_parse_args($argv));
            exit(0);
        case 'register-gui':
            systemup_monitor_cli_register_gui();
            exit(0);
        case 'sync':
            systemup_monitor_sync_config();
            echo "Config do agente regenerado (AGENT_VERSION=" . (defined('SYSTEMUP_MONITOR_AGENT_VERSION') ? SYSTEMUP_MONITOR_AGENT_VERSION : '0.2.0') . ").\n";
            exit(0);
        case 'upgrade':
            $force = in_array('--force', $argv, true);
            $result = systemup_monitor_start_package_update($force);
            echo $result['output'] . "\n";
            exit((int) $result['exit_code'] === 0 ? 0 : 1);
        case 'release-check':
            $status = systemup_monitor_update_status();
            echo "installed=" . $status['installed_version'] . "\n";
            echo "remote=" . ($status['remote_version'] !== '' ? $status['remote_version'] : '-') . "\n";
            echo "check_ok=" . ($status['check_ok'] ? 'yes' : 'no') . "\n";
            echo "update_available=" . ($status['update_available'] ? 'yes' : 'no') . "\n";
            if ($status['check_error'] !== '') {
                echo "error=" . $status['check_error'] . "\n";
            }
            exit($status['check_ok'] ? 0 : 1);
        case 'upgrade-check':
            $helper = '/usr/local/libexec/monitor-pfsense-agent/check_pfsense_update_available.sh';
            if (!is_file($helper) || !is_executable($helper)) {
                fwrite(STDERR, "Helper not found: {$helper}\n");
                exit(1);
            }
            $force = in_array('--force', $argv, true);
            $action = $force ? 'force-check' : 'check';
            $output = array();
            $exitCode = 0;
            exec(escapeshellarg($helper) . ' ' . escapeshellarg($action), $output, $exitCode);
            echo implode("\n", $output) . "\n";
            exit($exitCode === 0 ? 0 : 1);
        case 'remove':
            systemup_monitor_cli_remove();
            exit(0);
        default:
            systemup_monitor_cli_usage();
            exit(1);
    }
} catch (Throwable $exception) {
    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    exit(1);
}
