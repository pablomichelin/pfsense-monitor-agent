#!/usr/bin/env python3
"""Synthetic process identity tests; never signal a real process."""
import pathlib, subprocess, tempfile, unittest
SOURCE = pathlib.Path(__file__).resolve().parents[1] / 'packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/service_pid_migration.sh'
class Migration(unittest.TestCase):
 def run_case(self, mode, expected, signals):
  with tempfile.TemporaryDirectory() as tmp:
   pid=pathlib.Path(tmp)/'pid';pid.write_text('20' if mode=='modern' else '30')
   src=SOURCE.read_text().replace('/var/run/monitor_pfsense_agent.pid',str(pid)).replace('/usr/bin/fstat','fake_fstat').replace('/bin/ps','fake_ps')
   mock='''
mode=MODE
owner_alive=1
child_alive=1
fake_fstat() {
 echo 'USER CMD PID FD'
 [ "$mode" = stale ] || [ "$mode" = reused ] || [ "$owner_alive" = 0 ] || echo 'root daemon 20 4'
}
fake_ps() {
 case "$*" in
  *ppid*) [ "$mode" = wrong_parent ] && echo 99 || echo 20;;
  *'20 -o args='*)
    [ "$mode" = unrelated ] && echo 'daemon: other[30] (daemon)' || echo 'daemon: /usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh[30] (daemon)';;
  *) echo '/bin/sh /usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh';;
 esac
}
kill() {
 if [ "$1" = -0 ]; then
  [ "$mode" = stale ] && return 1
  if [ "$2" = 20 ]; then [ "$owner_alive" = 1 ]; else [ "$child_alive" = 1 ]; fi
  return
 fi
 echo "$1 $2" >> SIGNALS
 case "$1" in
 -TERM) [ "$mode" = child_stuck ] || child_alive=0; [ "$mode" = legacy ] && owner_alive=0;;
 -KILL) owner_alive=0;;
 esac
 return 0
}
sleep() { :; }
'''.replace('MODE',mode).replace('SIGNALS',tmp+'/signals')
   result=subprocess.run(['sh'],input=src+'\n'+mock+'\nmonitor_agent_migrate_pid\n',text=True,capture_output=True)
   self.assertEqual(result.returncode,expected,result.stdout+result.stderr)
   log=pathlib.Path(tmp)/'signals';self.assertEqual(log.read_text() if log.exists() else '',signals)
 def test_modern(self): self.run_case('modern',0,'')
 def test_legacy(self): self.run_case('legacy',0,'-TERM 20\n')
 def test_pipe_drain(self): self.run_case('pipe',0,'-TERM 20\n-KILL 20\n')
 def test_other_owner(self): self.run_case('unrelated',1,'')
 def test_other_parent(self): self.run_case('wrong_parent',1,'')
 def test_stale(self): self.run_case('stale',0,'')
 def test_reused(self): self.run_case('reused',1,'')
 def test_child_stuck(self): self.run_case('child_stuck',1,'-TERM 20\n')
if __name__=='__main__': unittest.main()
