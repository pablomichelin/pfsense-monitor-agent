#!/usr/local/bin/php
<?php
/** Kernel lock shared by checks, repairs, branch changes and installers. Never unlink it. */
declare(strict_types=1);
$wait = 0;
$args = array_slice($argv, 1);
if (($args[0] ?? '') === '--wait') {
    $wait = min(300, max(0, (int) ($args[1] ?? 0)));
    $args = array_slice($args, 2);
}
if ($args === []) { exit(64); }
$path = getenv('MONITOR_UPDATE_OPERATION_LOCK') ?: '/var/run/monitor-pfsense-update-operation.lock';
umask(0077);
$lock = fopen($path, 'c');
if ($lock === false) { exit(73); }
$deadline = microtime(true) + $wait;
while (!flock($lock, LOCK_EX | LOCK_NB)) {
    if (microtime(true) >= $deadline) { fclose($lock); exit(75); }
    usleep(200000);
}
$env = getenv();
$env['MONITOR_UPDATE_LOCK_HELD'] = '1';
// FD3 keeps ownership in the child even if this supervisor is killed.
$process = proc_open($args, [0=>STDIN, 1=>STDOUT, 2=>STDERR, 3=>$lock], $pipes, null, $env);
if (!is_resource($process)) { fclose($lock); exit(70); }
$rc = proc_close($process);
fclose($lock);
exit($rc < 0 ? 70 : $rc);
