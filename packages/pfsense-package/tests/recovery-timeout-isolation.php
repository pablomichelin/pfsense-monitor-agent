<?php
require __DIR__.'/../files/usr/local/libexec/monitor-pfsense-agent/agent_watchdog.php';
$pidfile=sys_get_temp_dir().'/recovery-timeout-qa-'.bin2hex(random_bytes(6)).'.pid';
try {
 $rc=watchdog_exec(['/usr/bin/timeout','--foreground','1','/bin/sh','-c','/usr/sbin/daemon -f -P "$1" /bin/sleep 20; /bin/sleep 3','qa',$pidfile]);
 $pid=is_file($pidfile)?(int)trim(file_get_contents($pidfile)):0;
 if($rc!==124||$pid<2||!posix_kill($pid,0))throw new RuntimeException('timeout affected detached service');
 echo "PASS timeout is confined to worker; detached service survives\n";
}finally{if(is_file($pidfile)){$pid=(int)trim(file_get_contents($pidfile));if($pid>1)posix_kill($pid,SIGTERM);@unlink($pidfile);}}
