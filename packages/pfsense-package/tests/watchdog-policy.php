<?php
require __DIR__.'/../files/usr/local/libexec/monitor-pfsense-agent/agent_watchdog.php';
$n=0;
function check($v,$label) {global $n; if(!$v) throw new RuntimeException($label);$n++;echo "PASS $label\n";}
$healthy=['enabled'=>true,'identity_ok'=>true,'busy'=>false,'alive'=>true,'cycle_stale'=>false,'journal_busy'=>false];
[$s,$r,$act]=watchdog_decide([],$healthy,10000);check(!$act&&$r==='healthy','healthy local cycle independent of network');
foreach(['enabled'=>'disabled','identity_ok'=>'identity_mismatch','busy'=>'operation_active'] as $k=>$reason){$o=$healthy;$o[$k]=$k==='busy';[$s,$r,$act]=watchdog_decide(['fault'=>'daemon_missing','since'=>0],$o,10000);check(!$act&&$r===$reason,$reason);}
$o=$healthy;$o['alive']=false;[$s]=watchdog_decide([],$o,10000);[$s,$r,$act]=watchdog_decide($s,$o,10119);check(!$act,'dead daemon debounce');[$s,$r,$act]=watchdog_decide($s,$o,10120);check($act&&$s['attempts']===[10120],'dead daemon recovery reservation');
foreach(['cycle_stale','journal_busy'] as $k){$o=$healthy;$o[$k]=true;[$s]=watchdog_decide([],$o,10000);[$s,$r,$act]=watchdog_decide($s,$o,10899);check(!$act,"$k debounce");[$s,$r,$act]=watchdog_decide($s,$o,10900);check($act,"$k persistent recovery");}
$o=$healthy;$o['alive']=false;
[$s,$r,$act]=watchdog_decide(['fault'=>'daemon_missing','since'=>0,'attempts'=>[9900]],$o,10000);check(!$act&&$r==='cooldown','cooldown after failure or lost reply');
[$s,$r,$act]=watchdog_decide(['fault'=>'daemon_missing','since'=>0,'attempts'=>[7000,8000,9000]],$o,10000);check(!$act&&$r==='hourly_limit','hourly budget');
[$s,$r,$act]=watchdog_decide(['fault'=>'daemon_missing','since'=>11000],$o,10000);check(!$act,'clock rollback no immediate restart');
check(!in_array('monitor_pfsense_watchdog',RECOVERY_SERVICES,true),'supervisor cannot restart itself');
check(!in_array('unbound; reboot',RECOVERY_SERVICES,true),'shell injection rejected');
check(recovery_result(['id'=>'x','attempt'=>2,'service'=>'monitor_pfsense_agent'],false,'ambiguous',true)['result_json']['execution_recovery_status']==='indeterminate','ambiguous restart classified');
echo "$n cases passed\n";
