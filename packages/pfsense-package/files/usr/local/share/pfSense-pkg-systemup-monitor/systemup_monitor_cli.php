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
  systemup_monitor_cli.php seed [--controller-url URL] [--node-uid UID] [--node-secret SECRET] [--customer-code CODE] [--interval-seconds N] [--services CSV] [--enable]
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
            case '--enable':
                $options['enable'] = true;
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
            $pkg[$field] = $options[$field];
        }
    }

    $pkg['enabled'] = $options['enable'] ? 'on' : '';

    write_config('SystemUp Monitor package bootstrap updated');
    systemup_monitor_sync_config();

    echo "SystemUp Monitor package config seeded.\n";
}

function systemup_monitor_cli_remove()
{
    global $config;

    $pkg =& systemup_monitor_config_ref();
    $pkg['enabled'] = '';
    systemup_monitor_sync_config();

    unset($config['installedpackages']['systemupmonitor']);
    delete_package_xml('systemup-monitor');
    write_config('SystemUp Monitor package bootstrap removed');

    echo "SystemUp Monitor package config removed.\n";
}

try {
    $action = $argv[1] ?? '';

    switch ($action) {
        case 'seed':
            systemup_monitor_cli_seed(systemup_monitor_cli_parse_args($argv));
            exit(0);
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
