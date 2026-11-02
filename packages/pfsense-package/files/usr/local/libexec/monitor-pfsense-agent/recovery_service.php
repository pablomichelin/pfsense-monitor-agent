#!/usr/local/bin/php
<?php
/** Fixed service adapter. Never accepts shell text, parameters, or supervisor self-restart. */
declare(strict_types=1);
require_once __DIR__.'/recovery_channel.php';
if (PHP_SAPI !== 'cli' || posix_geteuid() !== 0 || !in_array($argv[1] ?? '', RECOVERY_SERVICES, true)) exit(77);
$service = $argv[1];
if ($service === 'monitor_pfsense_agent') {
    require_once __DIR__.'/agent_watchdog.php';
    [$rc, $enabled] = watchdog_cmd(['/usr/sbin/sysrc','-n','monitor_pfsense_agent_enable']);
    if ($rc !== 0 || strtoupper($enabled) !== 'YES') exit(78);
    $rc = watchdog_exec(['/usr/sbin/service', $service, 'restart']);
    if ($rc !== 0) exit(1);
    $rc = watchdog_exec(['/usr/sbin/service', $service, 'onestatus']);
    exit($rc === 0 ? 0 : 1);
}
require_once '/etc/inc/config.inc';
require_once '/etc/inc/functions.inc';
require_once '/etc/inc/service-utils.inc';
$found = false;
foreach (get_services() as $s) if (($s['name'] ?? '') === $service) $found = true;
if (!$found) exit(78); // don't start a service disabled/not installed in pfSense
service_control_restart($service, []);
exit(is_service_running($service) ? 0 : 1);
