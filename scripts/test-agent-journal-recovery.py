#!/usr/bin/env python3
"""New fault group only: real journal/shell, local CAS controller, no network/pfSense.

Non-root hosts model the root ownership policy with the fixture owner's UID in a
private copy of the PHP journal. The production root-only constant is untouched.
SIGKILL covers abrupt process loss; cold restart exercises synced disk states,
not a physical power cut or filesystem/hardware durability certification.
"""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent'
SECRET = 'synthetic-private-password-!42'

CONTROLLER = r'''<?php
$base = getenv('TEST_DIR');
$lock = fopen($base . '/controller.lock', 'c+'); flock($lock, LOCK_EX);
$db = json_decode(file_get_contents($base . '/controller.json'), true);
$req = json_decode(file_get_contents($argv[3]), true);
$id = $req['command_id'] ?? 'cmd';
$cmd = &$db['commands'][$id];
$endpoint = $argv[1];
$code = '201'; $reply = [];
if (str_ends_with($endpoint, '/heartbeat')) {
    $commands = [];
    foreach ($db['commands'] as $key => $value) {
        if (in_array($value['status'], ['pending','picked_up'], true)) {
            $commands[] = ['id'=>$key,'type'=>'local_user_set_password', 'delivery_attempt'=>$value['attempt'] ?? 0,
                'status'=>$value['status'], 'delivery_state'=>$value['status']==='pending'?'awaiting_pickup':'ready',
                'payload'=>['pfsense_username'=>'synthetic', 'password'=>'synthetic-private-password-!42']];
        }
    }
    $reply = ['commands'=>$commands];
} elseif (str_ends_with($endpoint, '/command-ack')) {
    $phase = $req['status'];
    $db['acks'][] = $id . ':' . $phase;
    $db['ack_attempts'][] = $req['delivery_attempt'] ?? null;
    if (($req['delivery_attempt'] ?? null) !== ($cmd['attempt'] ?? 0)) {
        file_put_contents($base.'/controller.json', json_encode($db)); echo '409'; exit;
    }
    $execute = false;
    if (!in_array($cmd['status'], ['succeeded','failed','expired','cancelled'], true)) {
        if ($phase === 'picked_up' && $cmd['status'] !== 'running') $cmd['status'] = 'picked_up';
        if ($phase === 'running' && in_array($cmd['status'], ['pending','picked_up'], true)) {
            $cmd['status'] = 'running'; $execute = true;
        }
    }
    $terminal = in_array($cmd['status'], ['succeeded','failed','expired','cancelled'], true);
    $reply = ['ok'=>true,'command_id'=>$id,'delivery_attempt'=>$db['reply_attempt'] ?? $cmd['attempt'] ?? 0,'status'=>$cmd['status'], 'terminal'=>$terminal,
        'execute'=>$execute,'recovery_required'=>$phase==='running'&&!$execute&&!$terminal,
        'delivery_state'=>$terminal?'terminal':($phase==='running'?'execution_committed':'ready')];
    if (($db['bad_ack'] ?? '') === 'missing_execute') unset($reply['execute']);
    if (($db['bad_ack'] ?? '') === 'wrong_id') $reply['command_id'] = 'other';
    if (($db['bad_ack'] ?? '') === 'string_execute') $reply['execute'] = 'true';
    if (($db['drop'] ?? '') === $phase) { $db['drop'] = ''; $reply = []; $code = '000'; }
    if (($db['drop_before'] ?? '') === $phase) {
        $db['drop_before'] = ''; $cmd['status'] = 'picked_up'; $reply = []; $code = '000';
    }
} else {
    if (($req['delivery_attempt'] ?? null) !== ($cmd['attempt'] ?? 0)) { echo '409'; exit; }
    $db['results'][] = $req;
    if (!in_array($cmd['status'], ['succeeded','failed','expired','cancelled'], true)) $cmd['status'] = $req['status'];
    $reply = ['ok'=>true,'command_id'=>$id,'delivery_attempt'=>$db['result_reply_attempt'] ?? $cmd['attempt'] ?? 0,'status'=>$cmd['status']];
    if (($db['drop'] ?? '') === 'result') { $db['drop'] = ''; $reply = []; $code = '000'; }
    if ($db['result_offline'] ?? false) { $reply=[]; $code='000'; }
}
file_put_contents($base . '/controller.json', json_encode($db));
file_put_contents($argv[2], json_encode($reply));
file_put_contents($argv[4], '');
if (($db['pause'] ?? '') !== '' && ($db['pause'] ?? '') === ($req['status'] ?? '')) {
    file_put_contents($base . '/ready', 'ready'); flock($lock, LOCK_UN); usleep(15000000);
}
echo $code;
'''


class Recovery(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pfs-journal-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.runtime = self.base / 'runtime'
        self.runtime.mkdir()
        self.tmp = self.base / 'tmp'
        self.tmp.mkdir()
        self.journal = self.base / 'journal'
        helper = (RUNTIME / 'command_journal.php').read_text()
        helper = helper.replace('const JOURNAL_OWNER = 0;', f'const JOURNAL_OWNER = {os.getuid()};')
        (self.runtime / 'command_journal.php').write_text(helper)
        (self.base / 'controller.php').write_text(CONTROLLER)
        source = (RUNTIME / 'monitor-pfsense-agent.sh').read_text()
        functions = source[source.index('require_var() {'):source.index('usage() {')]
        prelude = r'''
set -eu
SCRIPT_DIR="$TEST_DIR/runtime"
CONTROLLER_URL=https://controller.invalid
NODE_UID=synthetic-node
NODE_SECRET=synthetic-secret
CUSTOMER_CODE=SYNTHETIC
MONITOR_AGENT_COMMAND_JOURNAL_DIR="$TEST_DIR/journal"
MONITOR_AGENT_CONFIG_BACKUP_STATE_DIR="$TEST_DIR"
export MONITOR_AGENT_COMMAND_JOURNAL_DIR
operational_action_acquire_lock() { :; }
operational_action_release_lock() { :; }
operational_action_lock_active() { return 1; }
http_post_signed_json() { php "$TEST_DIR/controller.php" "$1" "$3" "$5" "$6"; }
agent_cleanup_stale_locks() { :; }
finalize_pfsense_upgrade_if_pending() { :; }
heartbeat_backoff_blocks() { return 1; }
heartbeat_backoff_clear() { :; }
heartbeat_error_record() { :; }
light_heartbeat_record_success() { :; }
light_heartbeat_mark_recovery() { :; }
resolve_curl_cmd() { echo fake-curl; }
build_payload() { echo '{"services":[]}'; }
maybe_run_deferred_pfsense_update_check() { :; }
'''
        cli = r'''
case "${1:-}" in
 drain) process_heartbeat_commands "${2:-}" fake-curl; exit ;;
 phase|intent|capture|receipt|payload|delegate|result|ack|delivered|outbox)
   command_journal "$@"; exit ;;
esac
''' + source[source.index('command_name="${1:-}"'):]
        self.agent = self.runtime / 'monitor-pfsense-agent.sh'
        self.agent.write_text('#!/bin/sh\n' + functions + prelude + cli)
        self.agent.chmod(0o755)
        self.env = dict(os.environ, TEST_DIR=str(self.base), TMPDIR=str(self.tmp))
        self.helper()
        self.db(commands={'cmd': {'status': 'pending'}}, acks=[], results=[])
        self.response()

    def db(self, **changes):
        path = self.base / 'controller.json'
        data = json.loads(path.read_text()) if path.exists() else {}
        data.update(changes)
        path.write_text(json.dumps(data))
        return data

    def helper(self, pause=False):
        (self.runtime / 'manage_local_user.php').write_text('''<?php
$payload = json_decode(file_get_contents($argv[2]), true);
if (($payload['password'] ?? '') !== 'synthetic-private-password-!42') exit(9);
file_put_contents(getenv('TEST_DIR').'/effects', "effect\\n", FILE_APPEND);
''' + ('''file_put_contents(getenv('TEST_DIR').'/ready', 'ready'); usleep(15000000);
''' if pause else '') + '''echo json_encode(['ok'=>true,'message'=>'updated']);
''')

    def response(self, commands=None):
        if commands is None:
            commands = [{'id': 'cmd', 'delivery_attempt': 0, 'type': 'local_user_set_password', 'status': 'pending',
                         'delivery_state': 'awaiting_pickup',
                         'payload': {'pfsense_username': 'synthetic', 'password': SECRET}}]
        path = self.base / 'response.json'
        path.write_text(json.dumps({'commands': commands}))
        return path

    def run_agent(self, *args, ok=True):
        result = subprocess.run([str(self.agent), *map(str, args)], env=self.env,
                                capture_output=True, text=True, timeout=15)
        if ok:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn(SECRET, result.stdout + result.stderr)
        return result

    def drain(self):
        return self.run_agent('drain', self.base / 'response.json')

    def effects(self):
        path = self.base / 'effects'
        return len(path.read_text().splitlines()) if path.exists() else 0

    def phase(self):
        return self.run_agent('phase', 'cmd').stdout

    def assert_private(self):
        for directory in [self.journal, self.tmp]:
            for path in directory.rglob('*'):
                if path.is_file():
                    self.assertNotIn(SECRET.encode(), path.read_bytes(), str(path))
        self.assertEqual(self.journal.stat().st_mode & 0o777, 0o700)
        for path in self.journal.iterdir():
            if path.is_file():
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def kill_at_ready(self, *args):
        process = subprocess.Popen([str(self.agent), *map(str, args)], env=self.env,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        try:
            deadline = time.monotonic() + 8
            while not (self.base / 'ready').exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue((self.base / 'ready').exists(), 'fault injection not reached')
            self.assert_private()
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate(timeout=5)
            self.assertNotEqual(process.returncode, 0)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
            process.communicate()

    def test_lost_pickup_recovers_original_payload_with_same_id(self):
        self.db(drop='picked_up')
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (0, 'staged'))
        # A scrubbed duplicate must never replace the original encrypted payload.
        commands = json.loads((self.base / 'response.json').read_text())['commands']
        commands[0]['payload'] = {}
        self.response(commands)
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (1, 'done'))
        self.assertEqual(self.db()['acks'], ['cmd:picked_up','cmd:picked_up','cmd:running'])
        self.assert_private()

    def test_lost_running_permission_becomes_indeterminate_without_action(self):
        self.db(drop='running')
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (0, 'running_intent'))
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (0, 'done'))
        result = self.db()['results'][-1]
        self.assertEqual(result['result_json']['execution_recovery_status'], 'indeterminate')
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(self.db()['acks'], ['cmd:picked_up','cmd:running','cmd:running'])

    def test_duplicate_delivery_and_terminal_status_never_repeat_action(self):
        commands = json.loads((self.base / 'response.json').read_text())['commands']
        self.response(commands * 3)
        self.drain()
        self.drain()
        self.assertEqual(self.effects(), 1)
        self.assertEqual(self.phase(), 'done')
        self.assert_private()

    def test_terminal_ack_never_executes_or_revives_expired_cancelled(self):
        for status in ['succeeded','failed','expired','cancelled']:
            with self.subTest(status=status):
                self.db(commands={'cmd': {'status': status}}, acks=[], results=[])
                # Isolate each tombstone without destroying another test's journal.
                journal = self.base / ('journal-' + status)
                old = self.journal
                self.journal = journal
                self.env['MONITOR_TEST_JOURNAL'] = str(journal)
                # New fixture worker source uses this root only for this test.
                original = self.agent.read_text()
                self.agent.write_text(original.replace('MONITOR_AGENT_COMMAND_JOURNAL_DIR="$TEST_DIR/journal"',
                                                       'MONITOR_AGENT_COMMAND_JOURNAL_DIR="$MONITOR_TEST_JOURNAL"'))
                try:
                    self.drain()
                    self.assertEqual(self.phase(), 'done')
                    self.assertEqual(self.effects(), 0)
                    self.assertEqual(self.db()['results'], [])
                finally:
                    self.agent.write_text(original)
                    self.journal = old

    def test_result_outbox_survives_network_loss_and_crash(self):
        self.db(result_offline=True)
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (1, 'result'))
        # A fresh process after the outage replays only the stored result.
        self.db(result_offline=False)
        self.response([])
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (1, 'done'))
        self.assertTrue(all(r['status'] == 'succeeded' for r in self.db()['results']))
        self.assert_private()

    def test_sigkill_during_action_reports_indeterminate_without_replay(self):
        self.helper(pause=True)
        self.kill_at_ready('drain', self.base / 'response.json')
        self.assertEqual((self.effects(), self.phase()), (1, 'executing'))
        self.response([])
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (1, 'done'))
        self.assertEqual(self.db()['results'][-1]['result_json']['execution_recovery_status'], 'indeterminate')

    def test_sigkill_after_running_cas_before_response_never_acts(self):
        self.db(pause='running')
        self.kill_at_ready('drain', self.base / 'response.json')
        self.assertEqual((self.effects(), self.phase()), (0, 'running_intent'))
        self.db(pause='')
        self.response([])
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (0, 'done'))
        self.assertEqual(self.db()['results'][-1]['result_json']['execution_recovery_status'], 'indeterminate')

    def test_sigkill_during_result_reply_keeps_outbox(self):
        self.db(pause='succeeded')
        self.kill_at_ready('drain', self.base / 'response.json')
        self.assertEqual((self.effects(), self.phase()), (1, 'result'))
        self.db(pause='')
        self.response([])
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (1, 'done'))

    def test_malformed_or_legacy_ack_never_grants_permission(self):
        for invalid in ['missing_execute','wrong_id','string_execute']:
            with self.subTest(invalid=invalid):
                self.db(bad_ack=invalid)
                self.drain()
                self.assertEqual(self.effects(), 0)
                self.assertEqual(self.phase(), 'staged')
        self.assert_private()

    def test_heartbeat_stream_has_no_plaintext_password_files(self):
        self.run_agent('heartbeat')
        self.assertEqual((self.effects(), self.phase()), (1, 'done'))
        self.assert_private()
        self.assertEqual(list(self.tmp.iterdir()), [])

    def test_unsafe_permissions_and_corrupt_ciphertext_fail_closed(self):
        self.db(drop='picked_up')
        self.drain()
        record = self.journal / 'cmd.json'
        record.chmod(0o644)
        self.assertNotEqual(self.run_agent('drain', '', ok=False).returncode, 0)
        record.chmod(0o600)
        value = json.loads(record.read_text())
        value['data'] = 'invalid'
        record.write_text(json.dumps(value))
        self.assertNotEqual(self.run_agent('drain', '', ok=False).returncode, 0)
        self.assertEqual(self.effects(), 0)

    def test_recovery_precedes_changed_local_preconditions(self):
        self.db(drop='running')
        self.drain()
        self.env['MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED'] = '0'
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (0, 'done'))
        self.assertEqual(self.db()['results'][-1]['result_json']['execution_recovery_status'], 'indeterminate')

    def test_cold_restart_before_running_request_can_win_first_cas(self):
        self.db(drop_before='running')
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (0, 'running_intent'))
        # Orphaned encrypted temp writes from a simulated interrupted rename
        # never replace the last fully synced record on cold startup.
        (self.journal / '.write-interrupted').write_bytes(b'incomplete-ciphertext')
        (self.journal / '.write-interrupted').chmod(0o600)
        self.response([])
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (1, 'done'))
        self.assert_private()

    def test_two_concurrent_drains_do_not_duplicate_a_live_action(self):
        self.helper(pause=True)
        process = subprocess.Popen([str(self.agent), 'drain', str(self.base / 'response.json')],
                                   env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   start_new_session=True)
        try:
            deadline = time.monotonic() + 6
            while not (self.base / 'ready').exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue((self.base / 'ready').exists())
            self.drain()
            self.assertEqual((self.effects(), self.phase()), (1, 'executing'))
            self.assertEqual(self.db()['results'], [])
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
            process.communicate()

    def test_wrong_or_nonterminal_result_receipt_keeps_outbox(self):
        self.db(result_offline=True)
        self.drain()
        for reply in [{'ok': True, 'command_id': 'other', 'delivery_attempt': 0, 'status': 'succeeded'},
                      {'ok': True, 'command_id': 'cmd', 'delivery_attempt': 0, 'status': 'running'},
                      {'ok': False, 'command_id': 'cmd', 'delivery_attempt': 0, 'status': 'succeeded'}]:
            with self.subTest(reply=reply):
                path = self.base / 'receipt.json'
                path.write_text(json.dumps(reply))
                self.assertNotEqual(self.run_agent('delivered', 'cmd', path, ok=False).returncode, 0)
                self.assertEqual(self.phase(), 'result')
        self.assertEqual(self.effects(), 1)

    def test_running_heartbeat_and_inconsistent_delivery_are_ignored(self):
        commands = json.loads((self.base / 'response.json').read_text())['commands']
        commands[0].update(status='running', delivery_state='execution_committed')
        commands.append(dict(commands[0], id='other', status='pending', delivery_state='ready'))
        self.response(commands)
        self.drain()
        self.assertEqual(self.effects(), 0)
        self.assertEqual(self.phase(), '')
        self.assertEqual(self.db()['acks'], [])

    def test_sigkill_heartbeat_stream_leaves_only_ciphertext(self):
        self.helper(pause=True)
        self.kill_at_ready('heartbeat')
        self.assertEqual((self.effects(), self.phase()), (1, 'executing'))
        self.assert_private()

    def test_os_manual_finalizer_is_preserved_without_restarting_wrapper(self):
        source = self.agent.read_text()
        override = r'''
dispatch_pfsense_upgrade() {
  agent_begin_command "$1" "$3" || return 1
  command_journal delegate "$1" 99999999 "$TEST_DIR/pending-os.json"
}
'''
        self.agent.write_text(source.replace('command_name="${1:-}"', override + '\ncommand_name="${1:-}"'))
        command = {'id': 'cmd', 'delivery_attempt': 0, 'type': 'pfsense_upgrade', 'status': 'pending',
                   'delivery_state': 'awaiting_pickup', 'payload': {'target_version': 'synthetic'}}
        self.response([command])
        pending = self.base / 'pending-os.json'
        pending.write_text(json.dumps({'command_id': 'cmd', 'status': 'prepared_manual_confirm'}))
        self.drain()
        self.assertEqual(self.phase(), 'delegated')
        self.response([])
        self.drain()
        self.assertEqual(self.phase(), 'delegated')
        self.assertEqual(self.db()['results'], [])
        self.assertEqual(self.db()['acks'], ['cmd:picked_up', 'cmd:running'])

    def test_existing_late_result_transport_preserved_but_cancellation_stays_closed(self):
        self.db(result_offline=True)
        self.drain()
        receipt = self.base / 'terminal.json'
        receipt.write_text(json.dumps({'ok': True, 'command_id': 'cmd', 'delivery_attempt': 0, 'status': 'expired'}))
        self.run_agent('delivered', 'cmd', receipt)
        self.db(commands={'cmd': {'status': 'expired'}}, result_offline=False, results=[])
        self.run_agent('post-command-result', 'cmd', 'succeeded', '{"ok":true}')
        self.assertEqual(len(self.db()['results']), 1)
        self.assertEqual(self.effects(), 1)
        # An independently cancelled command receives no late-result resend.
        self.db(commands={'second': {'status': 'cancelled'}}, results=[])
        command = json.loads((self.base / 'response.json').read_text())['commands'][0]
        command['id'] = 'second'
        self.response([command])
        self.drain()
        self.run_agent('post-command-result', 'second', 'succeeded', '{"ok":true}')
        self.assertEqual(self.db()['results'], [])
        self.assertEqual(self.effects(), 1)

    def test_production_user_consumer_reads_stdin_without_unlinking_it(self):
        stub = self.base / 'pfsense-stub.php'
        stub.write_text('<?php\n')
        consumer = self.base / 'consumer.php'
        source = (RUNTIME / 'manage_local_user.php').read_text()
        source = source.replace("require_once('/etc/inc/config.inc');", f"require_once('{stub}');")
        source = source.replace("require_once('/etc/inc/auth.inc');", f"require_once('{stub}');")
        consumer.write_text(source)
        result = subprocess.run(['php', str(consumer), 'set_password', '/dev/stdin'],
                                input=json.dumps({'pfsense_username': 'admin', 'password': SECRET}),
                                text=True, capture_output=True, env=self.env, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(Path('/dev/stdin').exists())
        self.assertNotIn(SECRET, result.stdout + result.stderr)

    def override(self, code):
        source = self.agent.read_text()
        self.agent.write_text(source.replace('command_name="${1:-}"', code + '\ncommand_name="${1:-}"'))

    def test_backup_without_payload_is_staged_and_requires_both_acks(self):
        self.override(r'''
backup_is_enabled() { return 0; }
backup_accepts_remote_requests() { return 0; }
backup_upload_config() {
  echo effect >>"$TEST_DIR/effects"
  agent_post_command_result_succeeded "$1" '{"backup_id":"synthetic"}' "$2"
}
''')
        self.response([{'id': 'cmd', 'type': 'config_backup_now', 'status': 'pending',
                        'delivery_state': 'awaiting_pickup', 'delivery_attempt': 0}])
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (1, 'done'))
        self.assertEqual(self.db()['acks'], ['cmd:picked_up', 'cmd:running'])
        self.assertEqual(self.db()['ack_attempts'], [0, 0])
        self.assertEqual(self.db()['results'][0]['delivery_attempt'], 0)

    def test_idempotent_read_accepts_only_strictly_new_failed_retry_attempt(self):
        helper = self.runtime / 'manage_pf_tables.php'
        helper.write_text('''<?php
file_put_contents(getenv('TEST_DIR').'/effects', "effect\\n", FILE_APPEND);
$ok = file_exists(getenv('TEST_DIR').'/table-success');
echo json_encode(['ok'=>$ok,'message'=>$ok?'read':'read failed']);
''')
        command = {'id': 'cmd', 'type': 'table_search', 'status': 'pending',
                   'delivery_state': 'awaiting_pickup', 'delivery_attempt': 0, 'payload': {'ip': '192.0.2.1'}}
        self.response([command])
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (1, 'done'))
        self.assertEqual(self.db()['results'][0]['status'], 'failed')
        self.drain()  # Same attempt is a duplicate even though its payload is delivered again.
        self.assertEqual(self.effects(), 1)
        self.db(commands={'cmd': {'status': 'pending', 'attempt': 1}})
        (self.base / 'table-success').touch()
        command['delivery_attempt'] = 1
        self.response([command])
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (2, 'done'))
        self.assertEqual(self.db()['ack_attempts'], [0, 0, 1, 1])
        self.assertEqual(self.db()['results'][-1]['delivery_attempt'], 1)
        # Old replies, old delivery, and an old wrapper cannot alter attempt 1.
        command['delivery_attempt'] = 0
        self.response([command])
        self.drain()
        self.assertEqual(self.effects(), 2)
        self.env['MONITOR_JOURNAL_DELIVERY_ATTEMPT'] = '0'
        count = len(self.db()['results'])
        self.assertNotEqual(self.run_agent('post-command-result', 'cmd', 'failed', 'stale', ok=False).returncode, 0)
        self.assertEqual(len(self.db()['results']), count)

    def test_sensitive_retry_attempt_never_reopens_a_tombstone(self):
        self.env['MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED'] = '0'
        self.drain()
        self.assertEqual(self.phase(), 'done')
        self.assertEqual(self.db()['results'][0]['status'], 'failed')
        self.env['MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED'] = '1'
        self.db(commands={'cmd': {'status': 'pending', 'attempt': 1}})
        commands = json.loads((self.base / 'response.json').read_text())['commands']
        commands[0]['delivery_attempt'] = 1
        self.response(commands)
        self.drain()
        self.assertEqual(self.effects(), 0)
        self.assertEqual(self.db()['acks'], [])

    def test_attempt_mismatch_in_ack_or_result_never_grants_or_finishes(self):
        self.db(reply_attempt=1)
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (0, 'staged'))
        self.db(reply_attempt=0, result_reply_attempt=1)
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (1, 'result'))
        self.assertEqual(self.db()['results'][-1]['delivery_attempt'], 0)

    def test_missing_invalid_attempt_or_null_payload_is_rejected(self):
        commands = json.loads((self.base / 'response.json').read_text())['commands']
        original = commands[0]
        invalid = [dict(original, delivery_attempt=v) for v in [-1, 0.5, '0', True, None]]
        missing = dict(original)
        missing.pop('delivery_attempt')
        invalid += [missing, dict(original, payload=None)]
        self.response(invalid)
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (0, ''))
        self.assertEqual(self.db()['acks'], [])

    def test_lost_running_then_terminal_still_reports_indeterminate(self):
        self.db(drop='running')
        self.drain()
        self.db(commands={'cmd': {'status': 'expired'}})
        self.response([])
        self.drain()
        self.assertEqual((self.effects(), self.phase()), (0, 'done'))
        result = self.db()['results'][-1]
        self.assertEqual(result['delivery_attempt'], 0)
        self.assertEqual(result['result_json']['execution_recovery_status'], 'indeterminate')
        self.assertEqual(self.db()['commands']['cmd']['status'], 'expired')

    def test_backup_retry_header_is_fenced_and_scheduled_upload_has_no_attempt(self):
        config = self.base / 'config.xml'
        config.write_text('<synthetic/>')
        curl = self.base / 'mock-curl'
        curl.write_text('''#!/usr/bin/env php
<?php
$headers=[]; $output='';
for($i=1;$i<count($argv);$i++) {
    if($argv[$i]==='-H') { $parts=explode(': ', $argv[++$i], 2); $headers[$parts[0]]=$parts[1] ?? ''; }
    elseif($argv[$i]==='-o') $output=$argv[++$i];
}
file_put_contents(getenv('TEST_DIR').'/upload-headers', json_encode(array_intersect_key($headers,
    array_flip(['X-Command-Id','X-Command-Delivery-Attempt'])))."\\n", FILE_APPEND);
if(getenv('MOCK_UPLOAD_FAIL')==='1') exit(22);
file_put_contents($output, json_encode(['ok'=>true,'backup_id'=>'synthetic','sha256'=>$headers['X-Config-Sha256']]));
echo '201';
''')
        curl.chmod(0o755)
        self.override(r'''
resolve_curl_cmd() { echo "$TEST_DIR/mock-curl"; }
backup_config_xml_path() { echo "$TEST_DIR/config.xml"; }
backup_acquire_lock() { return 0; }
backup_release_lock() { :; }
backup_is_enabled() { return 0; }
backup_accepts_remote_requests() { return 0; }
backup_should_compress() { return 1; }
backup_content_changed() { return 0; }
backup_write_state() { :; }
backup_backoff_clear() { :; }
backup_backoff_record_failure() { :; }
detect_pfsense_version() { echo synthetic; }
''')
        command = {'id': 'cmd', 'type': 'config_backup_now', 'status': 'pending',
                   'delivery_state': 'awaiting_pickup', 'delivery_attempt': 0}
        self.response([command])
        self.env['MOCK_UPLOAD_FAIL'] = '1'
        self.drain()
        self.assertEqual(self.phase(), 'done')
        self.assertEqual(self.db()['results'][-1]['status'], 'failed')
        self.env['MOCK_UPLOAD_FAIL'] = '0'
        self.db(commands={'cmd': {'status': 'pending', 'attempt': 1}})
        command['delivery_attempt'] = 1
        self.response([command])
        self.drain()
        self.assertEqual(self.phase(), 'done')
        self.assertEqual(self.db()['results'][-1]['delivery_attempt'], 1)
        self.run_agent('backup-config')
        headers = [json.loads(line) for line in (self.base / 'upload-headers').read_text().splitlines()]
        self.assertEqual(headers, [{'X-Command-Id': 'cmd', 'X-Command-Delivery-Attempt': '0'},
                                   {'X-Command-Id': 'cmd', 'X-Command-Delivery-Attempt': '1'}, []])
        self.assertEqual(list(self.tmp.iterdir()), [])


if __name__ == '__main__':
    if not shutil.which('php'):
        raise SystemExit('PHP must already be installed; no installation is attempted.')
    unittest.main(verbosity=2)
