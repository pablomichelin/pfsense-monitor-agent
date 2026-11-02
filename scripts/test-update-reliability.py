#!/usr/bin/env python3
"""New grouped update reliability regressions. No appliance or database changes."""
import json, os, subprocess, tempfile, time, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent'
selected=sys.argv[1:] or ['cache','channels','ipv4','lock','integration','syntax']
def run(args, **kw): return subprocess.run(args, text=True, capture_output=True, **kw)
def ok(r):
    assert r.returncode==0,(r.returncode,r.stdout,r.stderr)
    return r.stdout.strip()
with tempfile.TemporaryDirectory(prefix='monitor-update207-') as tmp:
    tmp=Path(tmp)
    if 'cache' in selected:
        state=tmp/'state.json'
        def write(available='', message='', cls='', status='', code='0'):
            ok(run(['php',str(BASE/'update_cache.php'),'write',str(state),available,'2.9.0',message,'false',cls,status,'current_channel',code,'1','2_8_1','Stable','2_8_1,2_9_0','9','21600']))
            return json.loads(state.read_text())
        for attempt,delay in [(1,60),(2,180),(3,600),(4,21600)]:
            write(status='checking')
            d=write(message='timeout',cls='network')
            assert d['details']['retry_count']==attempt,d
            from datetime import datetime
            seconds=(datetime.fromisoformat(d['details']['next_check_at'].replace('Z','+00:00'))-datetime.fromisoformat(d['checked_at'].replace('Z','+00:00'))).total_seconds()
            assert seconds==delay,(attempt,seconds)
        assert d['details']['retry_exhausted']
        assert run(['php',str(BASE/'update_cache.php'),'due',str(state),'9','21600']).returncode==1
        d=write(cls='branch_available')
        assert d['check_error']=='' and d['details']['status']=='channel_required'
        assert d['details']['retry_count']==0
        d=write(message='response code 400',cls='http')
        assert d['details']['http_status']==400 and not d['details']['retry_exhausted']
        d=write(available='true');assert d['details']['status']=='available'
        d=write(available='false');assert d['details']['status']=='current'
        log=tmp/'log';log.write_text('harmless warning\npkg: Failed to fetch https://user:secret@host/file?token=secret: response code 400\nYour system is up to date')
        summary=ok(run(['php',str(BASE/'update_cache.php'),'summary',str(log),'0']))
        assert '400' in summary and 'secret' not in summary and 'harmless' not in summary,summary
        assert not list(tmp.glob('.update-cache-*'))
        print('PASS cache: bounded retries, due, states, HTTP and sanitized root cause')
    if 'channels' in selected:
        source=(BASE/'set_pfsense_update_branch.php').read_text()
        functions=source[source.index('function repo_is_forbidden'):source.index('function scan_repos_from_disk')]
        functions+=source[source.index('function repo_matches_version'):source.index('function apply_branch')]
        code=functions+'''
foreach (['RC Version','beta','preview','development','snapshot','alpha','Release Candidate'] as $label) {
 if (!repo_is_forbidden(['name'=>'26.07','descr'=>$label])) { exit(1); }
}
if (pick_repo([['name'=>'26.07','descr'=>'unknown']], 'latest', true)!==null) { exit(2); }
$r=pick_repo([['name'=>'26.07','descr'=>'RC Version','default'=>true], ['name'=>'26_03_1','descr'=>'Current Stable Version']], 'latest',true);
if (($r['name']??'')!=='26_03_1') { exit(3); }
'''
        ok(run(['php','-r',code]));print('PASS channels: 7 pre-release labels, missing stable, stable selection')
    if 'ipv4' in selected:
        source=(BASE/'check_pfsense_update_available.sh').read_text()
        f=source[source.index('refresh_pkg_repositories() {'):source.index('\ndetect_ha_detected()')]
        script='''PFSENSE_UPGRADE_IPV4=0
REPO_REFRESH_TIMEOUT_SEC=1
summarize_cmd_failure() { echo timeout; }
looks_like_tls_error() { return 1; }
looks_like_timeout_or_route() { return 0; }
run_pfsense_upgrade_cmd() { [ "$1" = 1 ]; }
'''+f+'''\nif ! refresh_pkg_repositories; then exit 1; fi
[ "$PFSENSE_UPGRADE_IPV4" = 1 ] || exit 2
'''
        ok(run(['sh'],input=script));print('PASS IPv4: fallback survives refresh')
    if 'lock' in selected:
        env={**os.environ,'MONITOR_UPDATE_OPERATION_LOCK':str(tmp/'operation.lock')}
        marker=tmp/'started'
        child=subprocess.Popen(['php',str(BASE/'update_operation.php'),'sh','-c','echo started > "$1"; sleep 1','test',str(marker)],env=env)
        for _ in range(100):
            if marker.exists():break
            time.sleep(.01)
        assert marker.exists()
        assert run(['php',str(BASE/'update_operation.php'),'true'],env=env).returncode==75
        child.kill();child.wait()
        assert run(['php',str(BASE/'update_operation.php'),'true'],env=env).returncode==75,'child must retain FD3'
        time.sleep(1.1)
        ok(run(['php',str(BASE/'update_operation.php'),'true'],env=env))
        assert (tmp/'operation.lock').exists(),'never unlink shared lock'
        print('PASS lock: exclusion, parent crash ownership, release on child exit')
    if 'integration' in selected:
        stage=tmp/'stage';stage.mkdir()
        repo=tmp/'repos';repo.mkdir()
        for i,v in [('0000','2_8_1'),('0001','2_9_0')]:
            for ext,value in [('name',v),('descr','Stable '+v),('conf','# fixture')]:
                (repo/f'pfSense-repo-{i}.{ext}').write_text(value)
        (repo/'pfSense-repo-0000.default').touch()
        for name in ['check_pfsense_update_available.sh','set_pfsense_update_branch.php','update_operation.php','update_cache.php']:
            src=(BASE/name).read_text().replace('/usr/local/etc/pfSense/pkg/repos',str(repo))
            if name.endswith('.php'):src=src.replace('#!/usr/local/bin/php','#!/usr/bin/env php')
            (stage/name).write_text(src);(stage/name).chmod(0o755)
        binary=tmp/'pfSense-upgrade'
        binary.write_text("#!/bin/sh\nfor arg do mode=$arg; done\ncase \"$mode\" in\n-h) echo -- -C;;\n-u) exit 0;;\n-c) if [ \"${CASE:-}\" = error ]; then echo \"Failed to fetch https://secret:password@repo/file?token=bad: response code 400\"; fi; echo \"Your system is up to date\";;\n-C) echo \"2.9.0 version of pfSense is available\"; exit 2;;\nesac\n")
        binary.chmod(0o755)
        state_dir=tmp/'state-dir';state_dir.mkdir()
        config=tmp/'config';config.write_text('MONITOR_AGENT_CONFIG_BACKUP_STATE_DIR='+str(state_dir)+'\n')
        env={**os.environ,'MONITOR_AGENT_CONFIG':str(config),'MONITOR_UPDATE_OPERATION_LOCK':str(tmp/'integration.lock'),'PATH':str(tmp)+os.pathsep+os.environ['PATH']}
        d=json.loads(ok(run(['sh',str(stage/'check_pfsense_update_available.sh'),'force-check'],env=env)))
        assert d['details']['status']=='channel_required' and d['check_error']=='',d
        assert d['available'] is None and d['target_version']=='2.9.0',d
        env['CASE']='error'
        d=json.loads(ok(run(['sh',str(stage/'check_pfsense_update_available.sh'),'force-check'],env=env)))
        assert d['details']['status']=='error' and d['details']['http_status']==400,d
        assert 'password' not in d['check_error'] and 'secret' not in d['check_error'],d
        print('PASS integration: complete checker, kernel lock, stable discovery and HTTP failure')
    if 'syntax' in selected:
        for name in ['check_pfsense_update_available.sh','run_package_upgrade.sh','run_pfsense_upgrade.sh','monitor-pfsense-agent.sh']:
            ok(run(['sh','-n',str(BASE/name)]))
        for name in ['update_operation.php','update_cache.php','set_pfsense_update_branch.php']:
            ok(run(['php','-l',str(BASE/name)]))
        print('PASS syntax: changed shell/PHP sources')
