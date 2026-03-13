<?php

require_once("config.inc");
require_once("globals.inc");

if (!defined("SYSTEMUP_MONITOR_DEFAULT_CONTROLLER_URL")) {
    define("SYSTEMUP_MONITOR_DEFAULT_CONTROLLER_URL", "https://pfs-monitor.systemup.inf.br");
}
if (!defined("SYSTEMUP_MONITOR_DEFAULT_INTERVAL")) {
    define("SYSTEMUP_MONITOR_DEFAULT_INTERVAL", "30");
}
if (!defined("SYSTEMUP_MONITOR_DEFAULT_SERVICES")) {
    define("SYSTEMUP_MONITOR_DEFAULT_SERVICES", "unbound,dhcpd,openvpn,ipsec,wireguard,ntpd,dpinger");
}

function &systemup_monitor_config_ref()
{
    global $config;

    if (!is_array($config['installedpackages'])) {
        $config['installedpackages'] = array();
    }

    if (!is_array($config['installedpackages']['systemupmonitor'])) {
        $config['installedpackages']['systemupmonitor'] = array();
    }

    if (!is_array($config['installedpackages']['systemupmonitor']['config'])) {
        $config['installedpackages']['systemupmonitor']['config'] = array(array());
    }

    return $config['installedpackages']['systemupmonitor']['config'][0];
}

function systemup_monitor_defaults()
{
    return array(
        'enabled' => '',
        'controller_url' => SYSTEMUP_MONITOR_DEFAULT_CONTROLLER_URL,
        'interval_seconds' => SYSTEMUP_MONITOR_DEFAULT_INTERVAL,
        'services_csv' => SYSTEMUP_MONITOR_DEFAULT_SERVICES,
    );
}

function systemup_monitor_apply_defaults()
{
    $pkg =& systemup_monitor_config_ref();
    $defaults = systemup_monitor_defaults();

    foreach ($defaults as $key => $value) {
        if (!isset($pkg[$key]) || $pkg[$key] === '') {
            $pkg[$key] = $value;
        }
    }
}

function systemup_monitor_read_config()
{
    systemup_monitor_apply_defaults();
    $pkg =& systemup_monitor_config_ref();
    return $pkg;
}

function systemup_monitor_runtime_paths()
{
    return array(
        'config_file' => '/usr/local/etc/monitor-pfsense-agent.conf',
        'log_file' => '/var/log/monitor-pfsense-agent.log',
        'agent_bin' => '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh',
        'loop_bin' => '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh',
        'rc_script' => '/usr/local/etc/rc.d/monitor_pfsense_agent',
    );
}

function systemup_monitor_service_definition()
{
    return array(
        'name' => 'monitor_pfsense_agent',
        'description' => 'SystemUp Monitor Agent',
        'rcfile' => 'monitor_pfsense_agent',
        'custom_php_service_status_command' => 'mwexec("/usr/sbin/service monitor_pfsense_agent onestatus >/dev/null 2>&1") == 0;',
    );
}

function systemup_monitor_register_service()
{
    global $config;

    if (!is_array($config['installedpackages']['service'])) {
        $config['installedpackages']['service'] = array();
    }

    $service_name = systemup_monitor_service_definition()['name'];

    foreach ($config['installedpackages']['service'] as $index => $service) {
        if (!is_array($service) || ($service['name'] ?? '') !== $service_name) {
            continue;
        }

        $config['installedpackages']['service'][$index] = systemup_monitor_service_definition();
        return;
    }

    $config['installedpackages']['service'][] = systemup_monitor_service_definition();
}

function systemup_monitor_unregister_service()
{
    global $config;

    if (!is_array($config['installedpackages']['service'])) {
        return;
    }

    $service_name = systemup_monitor_service_definition()['name'];

    foreach ($config['installedpackages']['service'] as $index => $service) {
        if (is_array($service) && ($service['name'] ?? '') === $service_name) {
            unset($config['installedpackages']['service'][$index]);
        }
    }

    $config['installedpackages']['service'] = array_values($config['installedpackages']['service']);
}

function systemup_monitor_is_enabled($pkg)
{
    return isset($pkg['enabled']) && $pkg['enabled'] === 'on';
}

function systemup_monitor_has_required_runtime_config($pkg, &$missing_fields = array())
{
    $missing_fields = array();

    foreach (array('controller_url', 'node_uid', 'customer_code', 'node_secret') as $field) {
        if (!isset($pkg[$field]) || trim((string) $pkg[$field]) === '') {
            $missing_fields[] = $field;
        }
    }

    return empty($missing_fields);
}

function systemup_monitor_escape_shell_value($value)
{
    return str_replace(array("\\", "\"", "\n", "\r"), array("\\\\", "\\\"", "", ""), (string) $value);
}

function systemup_monitor_ensure_directory($directory)
{
    if (!is_dir($directory)) {
        @mkdir($directory, 0755, true);
    }
}

function systemup_monitor_touch_log_file($path)
{
    $directory = dirname($path);
    systemup_monitor_ensure_directory($directory);

    if (!file_exists($path)) {
        @touch($path);
    }
}

function systemup_monitor_render_agent_config($pkg)
{
    $lines = array(
        'CONTROLLER_URL="' . systemup_monitor_escape_shell_value($pkg['controller_url']) . '"',
        'NODE_UID="' . systemup_monitor_escape_shell_value($pkg['node_uid']) . '"',
        'NODE_SECRET="' . systemup_monitor_escape_shell_value($pkg['node_secret']) . '"',
        'CUSTOMER_CODE="' . systemup_monitor_escape_shell_value($pkg['customer_code']) . '"',
        'AGENT_VERSION="0.1.1"',
        'SCHEMA_VERSION="2026-01"',
        'MONITOR_AGENT_INTERVAL_SECONDS="' . systemup_monitor_escape_shell_value($pkg['interval_seconds']) . '"',
        'MONITOR_AGENT_LOG_FILE="/var/log/monitor-pfsense-agent.log"',
        'MONITOR_AGENT_SERVICES="' . systemup_monitor_escape_shell_value($pkg['services_csv']) . '"',
    );

    return implode("\n", $lines) . "\n";
}

function systemup_monitor_write_runtime_config($pkg)
{
    $paths = systemup_monitor_runtime_paths();
    $directory = dirname($paths['config_file']);

    systemup_monitor_ensure_directory($directory);
    file_put_contents($paths['config_file'], systemup_monitor_render_agent_config($pkg));
    @chmod($paths['config_file'], 0600);

    systemup_monitor_touch_log_file($paths['log_file']);
}

function systemup_monitor_remove_runtime_config()
{
    $paths = systemup_monitor_runtime_paths();

    if (file_exists($paths['config_file'])) {
        @unlink($paths['config_file']);
    }
}

function systemup_monitor_run_command($command)
{
    $output = array();
    $exit_code = 0;

    exec($command . ' 2>&1', $output, $exit_code);

    return array(
        'exit_code' => $exit_code,
        'output' => implode("\n", $output),
    );
}

function systemup_monitor_sync_service($enabled, $config_ready)
{
    $paths = systemup_monitor_runtime_paths();

    if (!file_exists($paths['rc_script']) || !file_exists('/usr/sbin/service')) {
        return;
    }

    if (file_exists('/usr/sbin/sysrc')) {
        $enable_value = ($enabled && $config_ready) ? 'YES' : 'NO';
        systemup_monitor_run_command('/usr/sbin/sysrc monitor_pfsense_agent_enable=' . $enable_value);
    }

    if ($enabled && $config_ready) {
        systemup_monitor_run_command('/bin/sh -c "/usr/sbin/service monitor_pfsense_agent restart || /usr/sbin/service monitor_pfsense_agent start"');
        return;
    }

    systemup_monitor_run_command('/bin/sh -c "/usr/sbin/service monitor_pfsense_agent stop || true"');
}

function systemup_monitor_sync_config()
{
    systemup_monitor_apply_defaults();
    systemup_monitor_register_service();
    $pkg = systemup_monitor_read_config();
    $missing_fields = array();
    $config_ready = systemup_monitor_has_required_runtime_config($pkg, $missing_fields);

    if ($config_ready) {
        systemup_monitor_write_runtime_config($pkg);
    } else {
        systemup_monitor_remove_runtime_config();
    }

    systemup_monitor_sync_service(systemup_monitor_is_enabled($pkg), $config_ready);
    write_config('SystemUp Monitor package settings updated');

    return true;
}

function systemup_monitor_mask_secret($secret)
{
    if (empty($secret)) {
        return 'nao configurado';
    }

    $length = strlen($secret);
    if ($length <= 8) {
        return str_repeat('*', $length);
    }

    return substr($secret, 0, 3) . str_repeat('*', $length - 6) . substr($secret, -3);
}

function systemup_monitor_local_commands()
{
    return array(
        'service monitor_pfsense_agent status',
        '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh print-config',
        '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh test-connection',
        '/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh heartbeat',
        'tail -n 50 /var/log/monitor-pfsense-agent.log',
    );
}

function systemup_monitor_runtime_summary()
{
    $pkg = systemup_monitor_read_config();
    $paths = systemup_monitor_runtime_paths();
    $missing_fields = array();
    $config_ready = systemup_monitor_has_required_runtime_config($pkg, $missing_fields);
    $service_status = 'not installed';
    $service_detail = '';

    if (file_exists($paths['rc_script']) && file_exists('/usr/sbin/service')) {
        $result = systemup_monitor_run_command('/usr/sbin/service monitor_pfsense_agent onestatus');
        if ($result['exit_code'] === 0) {
            $service_status = 'running';
            $service_detail = $result['output'];
        } else {
            $result = systemup_monitor_run_command('/usr/sbin/service monitor_pfsense_agent status');
            $service_status = 'stopped';
            $service_detail = $result['output'];
        }
    }

    return array(
        'enabled' => systemup_monitor_is_enabled($pkg),
        'config_ready' => $config_ready,
        'missing_fields' => $missing_fields,
        'config_exists' => file_exists($paths['config_file']),
        'config_file' => $paths['config_file'],
        'log_file' => $paths['log_file'],
        'agent_bin' => $paths['agent_bin'],
        'loop_bin' => $paths['loop_bin'],
        'rc_script' => $paths['rc_script'],
        'service_status' => $service_status,
        'service_detail' => $service_detail,
    );
}
