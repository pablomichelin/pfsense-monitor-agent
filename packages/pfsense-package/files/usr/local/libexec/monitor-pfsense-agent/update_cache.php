#!/usr/local/bin/php
<?php
declare(strict_types=1);
$mode = $argv[1] ?? '';
if ($mode === 'summary') {
    $raw = (string) @file_get_contents($argv[2]);
    $raw = preg_replace('/\x1b\[[0-9;]*m/', '', $raw);
    $lines = array_values(array_filter(array_map('trim', preg_split('/\R/', $raw))));
    $chosen = '';
    foreach (['/(?:response code|HTTP(?:\/\S+)?)\s*[: ]\s*[45]\d\d/i', '/failed|unable|error:|could not|timed out|certificate/i'] as $pattern) {
        foreach ($lines as $line) { if (preg_match($pattern, $line)) { $chosen = $line; break 2; } }
    }
    $chosen = $chosen ?: (($argv[3] ?? '') === '124' ? 'update query timed out' : ($lines[0] ?? 'update query failed'));
    // Diagnostics never contain URL credentials, signed query strings or secret values.
    $chosen = preg_replace('~https?://\S+~i', '[repository]', $chosen);
    $chosen = preg_replace('/(authorization|password|token|secret|api[_-]?key)\s*[:=]\s*\S+/i', '$1=[redacted]', $chosen);
    echo substr(preg_replace('/[\x00-\x1f\x7f]/', ' ', $chosen), 0, 400);
    exit;
}
$path = $argv[2] ?? '';
$old = json_decode((string) @file_get_contents($path), true) ?: [];
$now = time();
if ($mode === 'due') {
    if ((int) ($old['cache_version'] ?? 0) < (int) $argv[3]) { exit(0); }
    $next = strtotime((string) ($old['details']['next_check_at'] ?? '')) ?: 0;
    if ($next === 0) { $next = (strtotime((string) ($old['checked_at'] ?? '')) ?: 0) + (int) $argv[4]; }
    exit($now >= $next ? 0 : 1);
}
if ($mode !== 'write') { exit(64); }
[, , , $available, $target, $message, $ha, $class, $status, $step, $exit, $ipv4, $branch, $descr, $branches, $version, $interval] = $argv;
$status = $status ?: ($class === 'branch_available' ? 'channel_required' : ($message !== '' ? ($class === 'lock' ? 'waiting' : 'error') : ($available === 'true' ? 'available' : 'current')));
if ($status === 'channel_required') { $message = ''; $class = ''; }
$http = preg_match('/(?:response code|HTTP(?:\/\S+)?)\s*[: ]\s*([45]\d\d)/i', $message, $m) ? (int) $m[1] : null;
$count = (int) ($old['details']['retry_count'] ?? 0);
if ($now - (strtotime((string) ($old['checked_at'] ?? '')) ?: 0) >= (int) $interval) { $count = 0; }
$transient = in_array($class, ['lock', 'dns', 'network', 'timeout'], true) || $http === 429 || ($http !== null && $http >= 500);
$delay = (int) $interval;
if (in_array($status, ['error','waiting'], true)) {
    if ($transient) { $count++; $delay = [1=>60,2=>180,3=>600][$count] ?? (int) $interval; }
} elseif ($status === 'checking') {
    $delay = 900; // recover a killed checker without reporting success
} else { $count = 0; }
$data = [
    'cache_version'=>(int)$version,
    'available'=>$available === 'true' ? true : ($available === 'false' ? false : null),
    'target_version'=>$target, 'checked_at'=>gmdate('Y-m-d\TH:i:s\Z'),
    'check_error'=>$message, 'error_class'=>$class, 'log_snippet'=>$message,
    'firmware_branch'=>$branch, 'firmware_branch_descr'=>$descr, 'firmware_branches'=>$branches,
    'ha_detected'=>$ha === 'true',
    'details'=>['status'=>$status,'step'=>$step,'exit_code'=>$exit === '' ? null : (int)$exit,
        'http_status'=>$http,'ipv4_only'=>$ipv4 === '1','retry_count'=>min($count,4),
        'retry_exhausted'=>$transient && $count > 3,
        'next_check_at'=>gmdate('Y-m-d\TH:i:s\Z', $now + $delay)]
];
$tmp = tempnam(dirname($path), '.update-cache-');
if ($tmp === false) { exit(1); }
chmod($tmp,0600);
if (file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE)."\n") === false || !rename($tmp,$path)) { @unlink($tmp); exit(1); }
