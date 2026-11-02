<?php
require __DIR__.'/../files/usr/local/libexec/monitor-pfsense-agent/agent_watchdog.php';
$pidfile=sys_get_temp_dir().'/recovery-fd-qa-'.bin2hex(random_bytes(6)).'.pid';
try {
 $start=microtime(true);
 $rc=watchdog_exec(['/usr/sbin/daemon','-f','-P',$pidfile,'/bin/sleep','20']);
 if($rc!==0||microtime(true)-$start>3)throw new RuntimeException('detached process retained completion pipe');
 echo "PASS detached daemon does not retain service completion transport\n";
}finally{
 if(is_file($pidfile)){$pid=(int)trim(file_get_contents($pidfile));if($pid>1)posix_kill($pid,SIGTERM);@unlink($pidfile);}
}
