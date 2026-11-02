<?php
// Native, synthetic regression: descendants must not retain journal leases.
declare(strict_types=1);
$helper = $argv[1];
$source = file_get_contents($helper);
$boundary = strpos($source, "\ntry {\n    if (PHP_SAPI");
if ($boundary === false) throw new RuntimeException('helper boundary');
eval(substr(substr($source, 0, $boundary), strpos($source, '<?php') + 5));
$base = sys_get_temp_dir().'/journal-inheritance-'.bin2hex(random_bytes(6));
$child = null;
try {
    $journal = new CommandJournal($base, 'synthetic');
    $lock = $journal->openLock('.drain.lock');
    if (!flock($lock, LOCK_EX | LOCK_NB)) throw new RuntimeException('fixture lock');
    $child = proc_open([PHP_BINARY, '-r', 'echo "ready\n"; sleep(30);'],
        [0=>['file','/dev/null','r'],1=>['pipe','w'],2=>STDERR], $pipes);
    if (trim(fgets($pipes[1])) !== 'ready') throw new RuntimeException('child startup');
    fclose($lock); // No LOCK_UN: emulate supervisor death while child lives.
    unset($journal);
    foreach (['.drain.lock', '.state.lock'] as $name) {
        $probe = fopen($base.'/'.$name, 'c+');
        if (!flock($probe, LOCK_EX | LOCK_NB)) throw new RuntimeException('inherited '.$name);
        fclose($probe);
        echo 'PASS child does not retain '.$name.PHP_EOL;
    }
} finally {
    if (is_resource($child)) { proc_terminate($child); proc_close($child); }
    foreach (glob($base.'/.*') ?: [] as $file) if (is_file($file)) unlink($file);
    if (is_dir($base)) rmdir($base);
}
