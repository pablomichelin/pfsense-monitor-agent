<?php
require __DIR__.'/../files/usr/local/libexec/monitor-pfsense-agent/agent_watchdog.php';
$base=sys_get_temp_dir().'/recovery-qa-'.bin2hex(random_bytes(6));mkdir($base,0700);$passed=0;
function expect($v,$label){if(!$v)throw new RuntimeException($label);}
function scenario(string $kind):void {
 global $base,$passed;
 $dir=$base.'/'.$kind;mkdir($dir,0700);$s=[];$exec=0;$results=[];$running=false;$loss=true;
 $identity=['CONTROLLER_URL'=>'https://qa.invalid','NODE_UID'=>'qa','secret'=>'synthetic'];
 $id='11111111-1111-4111-8111-111111111111';
 $cmd=['id'=>$id,'delivery_attempt'=>0,'type'=>'service_restart','status'=>'pending','expires_at'=>gmdate('c',time()+300),'payload'=>['service'=>'monitor_pfsense_agent']];
 if($kind==='expired')$cmd['expires_at']=gmdate('c',time()-1);
 if($kind==='unlisted')$cmd['payload']['service']='monitor_pfsense_watchdog';
 if($kind==='injection')$cmd['payload']['service']='unbound; reboot';
 $http=function($path,$body)use(&$cmd,&$running,&$loss,&$results,$kind){
  if(str_ends_with($path,'recovery-poll'))return ['commands'=>[$cmd]];
  if(str_ends_with($path,'command-result')){
   if($kind==='result_lost'&&$loss){$loss=false;throw new RuntimeException('lost result');}
   $results[]=$body;return ['ok'=>true];
  }
  if($body['status']==='picked_up')return $kind==='terminal'?['terminal'=>true,'status'=>'cancelled']:['terminal'=>false,'status'=>'picked_up'];
  $running=true;
  if($kind==='running_ack_lost'&&$loss){$loss=false;throw new RuntimeException('lost running ACK');}
  return ['terminal'=>false,'status'=>'running','execute'=>$kind!=='duplicate_running'];
 };
 $run=function($service)use(&$exec,$kind){$exec++;return $kind==='status_failure'?1:0;};
 $blocked=$kind==='installer';
 try{recovery_run($dir,$blocked,$s,$http,$identity,$run);}catch(RuntimeException $e){if(!in_array($kind,['running_ack_lost','result_lost'],true))throw $e;}
 if(in_array($kind,['running_ack_lost','result_lost','success'],true))recovery_run($dir,$blocked,$s,$http,$identity,$run);
 if(in_array($kind,['expired','unlisted','injection','terminal','installer'],true))expect($exec===0,$kind.' executed');
 if($kind==='running_ack_lost'||$kind==='duplicate_running'){
  expect($exec===0,$kind.' replayed');expect(($results[0]['result_json']['execution_recovery_status']??'')==='indeterminate',$kind.' missing indeterminate');
 }
 if($kind==='success'||$kind==='result_lost')expect($exec===1&&($results[0]['status']??'')==='succeeded',$kind.' not exactly once');
 if($kind==='status_failure')expect($exec===1&&($results[0]['status']??'')==='failed','false success');
 $passed++;echo "PASS $kind\n";
}
try{foreach(['success','running_ack_lost','result_lost','duplicate_running','expired','unlisted','injection','terminal','installer','status_failure']as $case)scenario($case);echo "$passed protocol cases passed\n";}
finally{$it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);foreach($it as $f){$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($base);}
