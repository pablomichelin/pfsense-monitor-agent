#!/usr/bin/env python3
"""Behavioral firmware detection regressions; private fixtures, no appliance writes."""
import json
import os
import sys
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent'

def run(*args):
    return subprocess.check_output(args, text=True).strip()

with tempfile.TemporaryDirectory(prefix='monitor-firmware-') as tmp:
    temp = Path(tmp)
    source = (BASE / 'check_pfsense_update_available.sh').read_text()
    library = temp / 'checker.sh'
    library.write_text(source.replace('main "$@"', ''))
    cases = [
        ('Your system is up to date', 0, 'false'),
        ('2.9.0 version of pfSense is available', 2, 'true'),
        ('Your system is on a newer version', 0, 'false'),
        ('Nothing to do', 0, 'unknown'),
        ('Your system is up to date', 1, 'unknown'),
        ('2.9.0 version of pfSense is available', 124, 'unknown'),
        ('failed to fetch the repo data\nYour system is up to date', 0, 'unknown'),
        ('Another instance is already running', 75, 'unknown'),
    ]
    for output, status, expected in (cases if "--remaining" not in sys.argv else []):
        fixture = temp / 'output'
        fixture.write_text(output)
        actual = run('sh', '-c', '. "$1"; parse_update_output "$2" "$3"', 'test', str(library), str(fixture), str(status)).splitlines()[0]
        assert actual == expected, (output, status, actual)
    if '--remaining' not in sys.argv:
        print(f'PASS parser: {len(cases)} cases')
    stub = temp / 'pfSense-upgrade'
    stub.write_text('#!/bin/sh\necho -- -C\n')
    stub.chmod(0o755)

    # Exercise actual run_check orchestration; replace appliance I/O only.
    for alternative, code, expected in [('2.9.0 version of pfSense is available', 2, 'branch'), ('Your system is up to date', 0, 'current'), ('failed to fetch the repo data', 1, 'error')]:
        harness = '''
. "$1"
detect_ha_detected() { return 1; }
clear_stale_pfsense_upgrade_locks() { :; }
pfsense_upgrade_in_progress() { return 1; }
refresh_pkg_repositories() { :; }
run_pfsense_upgrade_cmd() {
  if [ "$2" = '-c' ]; then echo 'Your system is up to date' > "$3"; return 0; fi
  printf '%s' "$ALT" > "$3"; return "$RC"
}
write_state() { printf '%s|%s|%s|%s\\n' "$1" "$2" "$3" "$5"; }
fail_check() { echo "error:$1"; return 1; }
run_check || :
'''
        import os
        result = subprocess.check_output(['sh', '-c', harness, 'test', str(library)], env={**os.environ, 'PATH':str(temp)+os.pathsep+os.environ['PATH'], 'ALT':alternative, 'RC':str(code)}, text=True).strip()
        if expected == 'branch':
            assert result.startswith('|2.9.0|') and result.endswith('|branch'), result
        elif expected == 'current':
            assert result == 'false|||', result
        else:
            assert result.startswith('error:'), result
    print('PASS orchestration: 3 cases (alternative never authorizes execution)')

    helper_source = (BASE / 'set_pfsense_update_branch.php').read_text()
    repo = temp / 'repos'
    repo.mkdir()
    for index, name in [('0000', '2_8_1'), ('0001', '2_9_0')]:
        for suffix, value in [('name', name), ('descr', name), ('conf', '# fixture')]:
            (repo / f'pfSense-repo-{index}.{suffix}').write_text(value)
    (repo / 'pfSense-repo-0001.default').touch()
    active = temp / 'active.conf'
    active.symlink_to(repo / 'pfSense-repo-0000.conf')
    helper = temp / 'helper.php'
    helper.write_text(helper_source.replace('/usr/local/etc/pfSense/pkg/repos', str(repo)).replace('/usr/local/etc/pkg/repos/pfSense.conf', str(active)).replace('/conf/config.xml', str(temp / 'no-config')))
    payload = json.loads(run('php', str(helper), 'list'))
    assert payload['current_name'] == '2_8_1', payload
    assert payload['branches'] == ['2_8_1','2_9_0'], payload
    active.unlink()
    payload = json.loads(run('php', str(helper), 'list'))
    assert payload['current_name'] == '2_9_0', payload
    print('PASS branch discovery: active link, two channels, default fallback')
    run('sh', '-n', str(BASE / 'check_pfsense_update_available.sh'))
    run('php', '-l', str(BASE / 'set_pfsense_update_branch.php'))
    print('PASS shell/PHP syntax')
