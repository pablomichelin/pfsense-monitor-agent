#!/usr/bin/env python3
"""Local regression tests: real shell/PHP parser, fake controller/helpers/downloads.

Run directly; requires only Python 3, /bin/sh and PHP already in PATH.
PFS_AGENT_TEST_REVISION=HEAD runs the agent tests against the Git baseline.
No pfSense includes, network, services, dependencies or release artifacts are used.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import shlex
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path("packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent")
AGENT = RUNTIME / "monitor-pfsense-agent.sh"
WRAPPER = RUNTIME / "run_package_upgrade.sh"


def agent_source():
    revision = os.environ.get("PFS_AGENT_TEST_REVISION")
    if revision:
        return subprocess.check_output(
            ["git", "show", f"{revision}:{AGENT}"], cwd=ROOT, text=True)
    return (ROOT / AGENT).read_text()


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pfs-protocol-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.tmp = self.base / "tmp"
        self.tmp.mkdir()
        self.events = self.base / "events"
        self.env = dict(os.environ, TMPDIR=str(self.tmp), TEST_DIR=str(self.base),
                        EVENTS=str(self.events))
        source = agent_source()
        # Load production function bodies, omitting config migration and CLI dispatch.
        self.functions = source[source.index("require_var() {"):source.index("usage() {")]
        self.prelude = r'''
set -eu
CONTROLLER_URL=https://controller.invalid
NODE_UID=synthetic-node
NODE_SECRET=synthetic-secret
CUSTOMER_CODE=SYNTHETIC
SCRIPT_DIR="$TEST_DIR"
MONITOR_AGENT_CONFIG_BACKUP_STATE_DIR="$TEST_DIR"
backup_ensure_state_dir() { :; }
operational_action_acquire_lock() { echo lock >>"$EVENTS"; return 0; }
operational_action_release_lock() { echo unlock >>"$EVENTS"; }
operational_action_lock_active() { return 1; }
package_upgrade_lock_active() { return 1; }
agent_upgrade_lock_active() { return 1; }
pfsense_upgrade_ha_detected() { return 1; }
detect_disk_percent() { echo 10; }
service() { echo SERVICE >>"$EVENTS"; }
nohup() { echo SPAWN >>"$EVENTS"; return 1; }
agent_post_command_result_failed() { printf 'failed:%s\n' "$1" >>"$EVENTS"; }
agent_post_command_result_succeeded() { printf 'succeeded:%s\n' "$1" >>"$EVENTS"; }
agent_post_command_ack() {
  printf 'ack:%s\n' "$2" >>"$EVENTS"
  [ "${FAIL_ACK:-}" != "$2" ]
}
# This older group isolates parsing/dispatch/cleanup. Durable delivery and the
# real CAS permission gate are exercised by test-agent-journal-recovery.py.
agent_begin_command() {
  agent_post_command_ack "$1" picked_up "$2" && agent_post_command_ack "$1" running "$2"
}
command_journal() {
  case "$1" in
    capture) cat >"$TEST_DIR/captured-heartbeat.json" ;;
    receipt) cat "$TEST_DIR/captured-heartbeat.json"; rm -f "$TEST_DIR/captured-heartbeat.json" ;;
    *) return 0 ;;
  esac
}
process_heartbeat_commands() {
  if [ "$1" = @inbox ]; then
    dispatch_heartbeat_commands "$TEST_DIR/captured-heartbeat.json" "$2"
  else
    dispatch_heartbeat_commands "$@"
  fi
}
'''

    def shell(self, body, *, prelude=None, ok=True):
        result = subprocess.run(
            ["/bin/sh"], input=self.functions + (self.prelude if prelude is None else prelude) + body,
            env=self.env, text=True, capture_output=True, timeout=15, cwd=self.base)
        if ok:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def records(self):
        return self.events.read_text().splitlines() if self.events.exists() else []

    def interrupt(self, command, ready, sig):
        process = subprocess.Popen(command, env=self.env, cwd=self.base,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   start_new_session=True)
        try:
            deadline = time.monotonic() + 5
            while not ready.exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertTrue(ready.exists(), "mock never reached the interruption point")
            os.killpg(process.pid, sig)
            process.communicate(timeout=5)
            self.assertNotEqual(process.returncode, 0)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()

    def response(self, commands):
        (self.base / "response.json").write_text(json.dumps({"commands": commands}))

    def helper(self, code="echo json_encode(['ok' => true]);"):
        (self.base / "manage_local_user.php").write_text("<?php\n" + code)
        (self.base / "manage_pf_tables.php").write_text("<?php\n" + code)


class Protocol(Fixture):
    def test_empty_fields_and_batch_isolation(self):
        self.response([
            {"id": "svc", "type": "service_restart", "payload": {"service": "unbound"}},
            {"id": "boot", "type": "node_reboot", "payload": {"delay_seconds": 123}},
            {"id": "pkg", "type": "package_upgrade", "payload": {
                "artifact_url": "https://controller.invalid/package?a=b&c=d"}},
            {"id": "os", "type": "pfsense_upgrade", "payload": {"target_version": "2.9.0"}},
            {"id": "user", "type": "local_user_create", "payload": {"password": "synthetic"}},
            {"id": "table", "type": "table_search", "payload": {"ip": "192.0.2.1"}},
        ])
        self.shell(r'''
dispatch_service_restart() { printf 'service:%s:%s:%s\n' "$1" "$2" "$3" >>"$EVENTS"; }
dispatch_node_reboot() { printf 'reboot:%s:%s:%s\n' "$1" "$2" "$3" >>"$EVENTS"; }
dispatch_package_upgrade() { printf 'package:%s:%s:%s:%s:%s\n' "$1" "$2" "$3" "$4" "$5" >>"$EVENTS"; }
dispatch_pfsense_upgrade() { printf 'os:%s:%s:%s\n' "$1" "$2" "$3" >>"$EVENTS"; }
capture_payload() {
  [ -f "$2" ] || return 1
  php -r 'exit((fileperms($argv[1]) & 0777) === 0600 ? 0 : 1);' "$2" || exit 1
  printf '%s:%s\n' "$1" "$3" >>"$EVENTS"
}
dispatch_local_user_create() { capture_payload "$@"; }
dispatch_table_search() { capture_payload "$@"; }
response_file="$TEST_DIR/response.json"
payload_file=parent-payload
process_heartbeat_commands "$response_file" fake-curl
[ "$response_file" = "$TEST_DIR/response.json" ]
[ "$payload_file" = parent-payload ]
''')
        self.assertEqual(self.records(), [
            "service:svc:unbound:fake-curl", "reboot:boot:123:fake-curl",
            "package:pkg::https://controller.invalid/package?a=b&c=d::fake-curl",
            "os:os:2.9.0:fake-curl", "user:fake-curl", "table:fake-curl"])
        self.assertEqual(list(self.tmp.iterdir()), [])
        self.assertEqual(list(self.base.glob("cmd-payload-*")), [])

    def test_invalid_framing_and_path_ids_never_dispatch(self):
        commands = [{"id": bad, "type": "local_user_create", "payload": {"password": "synthetic"}}
                    for bad in ["../escape", "x\ny", "x\ty", "x\x1fy", "a/b"]]
        commands += [{"id": "bad", "type": "service_restart", "payload": {"service": value}}
                     for value in ["x\nunbound", "\tunbound", "x\x1fy", ["unbound"]]]
        commands.append({"id": "valid", "type": "service_restart", "payload": {"service": "unbound"}})
        self.response(commands)
        self.shell(r'''
dispatch_local_user_create() { echo BAD >>"$EVENTS"; }
dispatch_service_restart() { echo "$1:$2" >>"$EVENTS"; }
process_heartbeat_commands "$TEST_DIR/response.json" fake-curl
''')
        self.assertEqual(self.records(), ["valid:unbound"])
        self.assertFalse((self.base / "escape.json").exists())
        self.assertEqual(list(self.tmp.iterdir()), [])

    def test_payload_cleanup_on_every_local_failure_and_success(self):
        for mode in ["disabled", "locked", "missing-helper", "missing-php", "picked_up", "running",
                     "invalid-json", "php-error", "ok-nonzero", "success"]:
            with self.subTest(mode=mode):
                payload = self.base / "private.json"
                payload.write_text('{"password":"synthetic"}')
                self.helper()
                setup = ""
                if mode == "disabled":
                    setup = "MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED=0\n"
                elif mode == "locked":
                    setup = "operational_action_acquire_lock() { return 1; }\n"
                elif mode == "missing-helper":
                    (self.base / "manage_local_user.php").unlink()
                elif mode == "missing-php":
                    setup = "command_exists() { return 1; }\n"
                elif mode in ("picked_up", "running"):
                    setup = f"FAIL_ACK={mode}\n"
                elif mode == "invalid-json":
                    self.helper('echo "invalid-json";')
                elif mode == "php-error":
                    self.helper('fwrite(STDERR, "synthetic-password-error"); exit(7);')
                elif mode == "ok-nonzero":
                    self.helper('echo json_encode(["ok" => true]); exit(7);')
                self.events.unlink(missing_ok=True)
                result = self.shell(setup + r'''
dispatch_local_user_create cmd "$TEST_DIR/private.json" fake-curl || :
[ ! -e "$TEST_DIR/private.json" ]
''')
                self.assertNotIn("synthetic-password-error", result.stdout + result.stderr)
                self.assertEqual(list(self.tmp.iterdir()), [])
                self.assertEqual("succeeded:cmd" in self.records(), mode == "success")
                self.assertEqual(self.records().count("lock"), self.records().count("unlock"))

    def test_two_sensitive_commands_do_not_overwrite_cleanup(self):
        self.helper()
        self.response([{"id": f"user{i}", "type": "local_user_set_password",
                        "payload": {"password": f"synthetic{i}"}} for i in range(2)])
        self.shell('process_heartbeat_commands "$TEST_DIR/response.json" fake-curl\n')
        self.assertEqual([e for e in self.records() if e.startswith("succeeded:")],
                         ["succeeded:user0", "succeeded:user1"])
        self.assertEqual(list(self.tmp.iterdir()), [])

    def test_php_consumer_unlinks_payload_even_when_validation_fails(self):
        # Run the production PHP consumer, replacing ONLY its two pfSense imports.
        helper = ROOT / RUNTIME / "manage_local_user.php"
        stub = self.base / "pfsense-stub.php"
        stub.write_text("<?php\n")
        runner = self.base / "consumer.php"
        runner.write_text(helper.read_text().replace(
            "require_once('/etc/inc/config.inc');", f"require_once('{stub}');").replace(
            "require_once('/etc/inc/auth.inc');", f"require_once('{stub}');"))
        for content in ["invalid-json", '{"pfsense_username":"admin","password":"synthetic"}']:
            with self.subTest(content=content):
                payload = self.base / "consumer-payload.json"
                payload.write_text(content)
                result = subprocess.run(["php", str(runner), "create", str(payload)],
                                        env=self.env, capture_output=True, text=True, timeout=5)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(payload.exists())
                self.assertNotIn("synthetic", result.stdout + result.stderr)

    def test_backup_ack_gate_preserves_accepted_requests(self):
        for accepted in [False, True]:
            with self.subTest(accepted=accepted):
                self.events.unlink(missing_ok=True)
                self.shell(r'''
resolve_curl_cmd() { echo fake-curl; }
agent_begin_command() { return ''' + ("0" if accepted else "1") + r'''; }
backup_upload_config() { echo UPLOAD >>"$EVENTS"; }
backup_config_now cmd || :
''')
                self.assertEqual("UPLOAD" in self.records(), accepted)

    def test_parser_failure_removes_payloads_already_staged(self):
        self.response([{"id": "user", "type": "local_user_create", "payload": {"password": "synthetic"}}])
        self.env["REAL_PHP"] = shutil.which("php")
        self.shell(r'''
php() { "$REAL_PHP" "$@"; return 1; }
process_heartbeat_commands "$TEST_DIR/response.json" fake-curl && exit 1
exit 0
''')
        self.assertEqual(self.records(), [])
        self.assertEqual(list(self.tmp.iterdir()), [])

    def test_interruption_cleans_heartbeat_response_batch_and_action(self):
        for sig in [signal.SIGTERM, signal.SIGINT]:
            with self.subTest(sig=sig):
                ready = self.base / "ready"
                ready.unlink(missing_ok=True)
                self.events.unlink(missing_ok=True)
                self.helper('file_put_contents(getenv("TEST_DIR") . "/ready", "ready"); usleep(5000000);')
                self.response([{"id": f"user{i}", "type": "local_user_create",
                                "payload": {"password": "synthetic"}} for i in range(2)])
                body = self.functions + self.prelude + r'''
agent_cleanup_stale_locks() { :; }
finalize_pfsense_upgrade_if_pending() { :; }
heartbeat_backoff_blocks() { return 1; }
heartbeat_backoff_clear() { :; }
light_heartbeat_record_success() { :; }
resolve_curl_cmd() { echo fake-curl; }
build_payload() { echo '{"services":[]}'; }
http_post_signed_json() { cp "$TEST_DIR/response.json" "$3"; echo 201; }
heartbeat
'''
                script = self.base / "signal-test.sh"
                script.write_text(body)
                self.interrupt(["/bin/sh", str(script)], ready, sig)
                self.assertEqual(list(self.tmp.iterdir()), [])
                self.assertEqual(self.records().count("lock"), self.records().count("unlock"))

    def test_rejected_ack_blocks_all_side_effecting_dispatchers(self):
        self.helper('file_put_contents(getenv("EVENTS"), "HELPER\\n", FILE_APPEND); echo "{}";')
        for name, args in [
            ("dispatch_service_restart", "cmd unbound fake-curl"),
            ("dispatch_node_reboot", "cmd 60 fake-curl"),
            ("dispatch_package_upgrade", "cmd '' https://controller.invalid/a abc fake-curl"),
            ("dispatch_pfsense_upgrade", "cmd '' fake-curl"),
            ("dispatch_table_search", 'cmd "$TEST_DIR/private.json" fake-curl'),
            ("dispatch_local_user_create", 'cmd "$TEST_DIR/private.json" fake-curl'),
        ]:
            for rejected in ["picked_up", "running"]:
                with self.subTest(name=name, rejected=rejected):
                    self.events.unlink(missing_ok=True)
                    (self.base / "private.json").write_text("{}")
                    self.shell(f"FAIL_ACK={rejected}\n" + r'''
MONITOR_AGENT_OPERATIONAL_ACTIONS_ENABLED=1
MONITOR_AGENT_SERVICE_RESTART_ENABLED=1
MONITOR_AGENT_NODE_REBOOT_ENABLED=1
''' + f"{name} {args} && exit 1\nexit 0\n")
                    self.assertFalse(set(self.records()) & {"HELPER", "SERVICE", "SPAWN"})
                    self.assertEqual(self.records()[-1], "unlock" if name in [
                        "dispatch_table_search", "dispatch_local_user_create", "dispatch_service_restart"]
                        else f"ack:{rejected}")

    def test_ack_application_body_and_http_validation(self):
        # Use real ACK helper; only the signed HTTP transport is mocked.
        for code, body, accepted in [
            ("201", '{"ok":true,"command_id":"cmd","status":"running"}', True),
            ("200", '{"ok":true,"command_id":"other","status":"running"}', False),
            ("200", '{"ok":true,"command_id":"cmd","status":"succeeded"}', False),
            ("200", '{"ok":false,"command_id":"cmd","status":"running"}', False),
            ("200", "{}", False), ("200", "bad-json", False),
            ("409", '{"ok":true,"command_id":"cmd","status":"running"}', False),
            ("000", "", False), ("invalid", "", False), ("", "", False),
        ]:
            with self.subTest(code=code, body=body):
                self.env.update(ACK_CODE=code, ACK_BODY=body)
                result = self.shell(r'''
set -eu
http_post_signed_json() {
  printf '%s' "$ACK_BODY" >"$3"
  printf '%s' "$ACK_CODE"
}
backup_post_command_ack cmd running fake-curl
''', prelude="", ok=False)
                self.assertEqual(result.returncode == 0, accepted)
                self.assertEqual(list(self.tmp.iterdir()), [])
        self.env.update(ACK_CODE="201", ACK_BODY='{"ok":true,"command_id":"cmd","status":"running"}')
        result = self.shell(r'''
set -eu
http_post_signed_json() {
  printf '%s' "$ACK_BODY" >"$3"
  echo 'transport error' >"$6"
  echo 201
}
backup_post_command_ack cmd running fake-curl
''', prelude="", ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list(self.tmp.iterdir()), [])

    def test_url_allowlist_preserves_controller_origin(self):
        for url, allowed in [
            ("https://controller.invalid/a", True),
            ("https://controller.invalid:443/a", True),
            ("http://controller.invalid/a", False),
            ("ftp://controller.invalid/a", False),
            ("https://controller.invalid:8443/a", False),
            ("https://user@controller.invalid/a", False),
            ("https://controller.invalid.evil/a", False),
            ("https://github.com/pablomichelin/pfsense-monitor-agent/releases/a", True),
            ("http://github.com/pablomichelin/pfsense-monitor-agent/releases/a", False),
            ("https://github.com/other/repo/a", False),
        ]:
            with self.subTest(url=url):
                result = self.shell("package_upgrade_url_allowed " + shlex.quote(url), ok=False)
                self.assertEqual(result.returncode == 0, allowed)
        self.shell('CONTROLLER_URL=http://192.0.2.1:3031\npackage_upgrade_url_allowed http://192.0.2.1:3031/a\n')

    def test_heartbeat_response_and_payload_cleanup(self):
        self.helper()
        self.response([{"id": "user", "type": "local_user_create", "payload": {"password": "synthetic"}}])
        self.shell(r'''
agent_cleanup_stale_locks() { :; }
finalize_pfsense_upgrade_if_pending() { :; }
heartbeat_backoff_blocks() { return 1; }
heartbeat_backoff_clear() { :; }
light_heartbeat_record_success() { :; }
resolve_curl_cmd() { echo fake-curl; }
build_payload() { echo '{"services":[]}'; }
http_post_signed_json() { cp "$TEST_DIR/response.json" "$3"; echo 201; }
maybe_run_deferred_pfsense_update_check() { [ -s "$1" ]; }
heartbeat
''')
        self.assertEqual(list(self.tmp.iterdir()), [])


class Upgrade(Fixture):
    def upgrade(self, *, digest=None, download_fails=False, install_exit=0, missing_installer=False):
        # These tests must never run service commands even on a pfSense host.
        if Path("/usr/local/etc/rc.d/monitor_pfsense_agent").exists():
            self.skipTest("requires a host without the pfSense service")
        archive = self.base / "fixture.tar.gz"
        with tarfile.open(archive, "w:gz") as tf:
            script = (f'#!/bin/sh\nprintf "installed\\n" >>"$EVENTS"\nexit {install_exit}\n').encode()
            info = tarfile.TarInfo("pfsense-package/bootstrap/" + ("absent.sh" if missing_installer else "install.sh"))
            info.size = len(script)
            info.mode = 0o755
            tf.addfile(info, io.BytesIO(script))
        pin = digest if digest is not None else hashlib.sha256(archive.read_bytes()).hexdigest().upper()
        config = self.base / "config"
        config.write_text('CONTROLLER_URL="https://controller.invalid"\nNODE_UID="synthetic"\n'
                          'CUSTOMER_CODE="SYNTHETIC"\nNODE_SECRET="synthetic-secret"\n')
        curl = self.base / "mock-curl"
        curl.write_text('''#!/bin/sh
printf '%s\n' "$*" >>"$EVENTS"
[ "$DOWNLOAD_FAILS" = 0 ] || exit 22
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then cp "$ARCHIVE" "$2"; exit; fi
  shift
done
exit 1
''')
        report = self.base / "mock-agent"
        report.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >>"$EVENTS"\n')
        for file in [curl, report]:
            file.chmod(0o755)
        state = self.base / "state"
        state.write_text("pending")
        self.env.update(MONITOR_AGENT_CONFIG_FILE=str(config), MONITOR_AGENT_BIN=str(report),
                        MONITOR_AGENT_LOG_FILE=str(self.base / "agent.log"),
                        MONITOR_PACKAGE_UPGRADE_LOG=str(self.base / "upgrade.log"),
                        MONITOR_PACKAGE_UPGRADE_LOCK=str(self.base / "lock"),
                        ARCHIVE=str(archive), DOWNLOAD_FAILS=str(int(download_fails)))
        result = subprocess.run(
            ["/bin/sh", str(ROOT / WRAPPER), "cmd", "0.test", "https://controller.invalid/package",
             pin, str(state), str(curl)], env=self.env, capture_output=True, text=True, timeout=15)
        self.assertEqual(list(self.tmp.iterdir()), [])
        self.assertFalse((self.base / "lock").exists())
        self.assertFalse(state.exists())
        return result

    def test_verified_artifact_installer_only(self):
        result = self.upgrade()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("installed", self.records())
        self.assertTrue(any("succeeded" in e for e in self.records()))
        self.assertEqual(sum(e.startswith("-fsSL") for e in self.records()), 1)
        self.assertFalse(any("raw.githubusercontent" in e for e in self.records()))

    def test_bad_digest_and_download_failure_never_execute(self):
        for options in [{"digest": "0" * 64}, {"download_fails": True}, {"digest": "bad"},
                        {"missing_installer": True}]:
            with self.subTest(options=options):
                self.events.unlink(missing_ok=True)
                result = self.upgrade(**options)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("installed", self.records())
                self.assertTrue(any("failed" in e for e in self.records()))

    def test_install_failure_cleans_workdir(self):
        result = self.upgrade(install_exit=7)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("installed", self.records())
        self.assertTrue(any("failed" in e for e in self.records()))

    def test_interrupted_download_cleans_workdir_and_lock(self):
        self.upgrade(download_fails=True)  # initialize mocked paths, no installer execution
        curl = self.base / "mock-curl"
        curl.write_text('#!/bin/sh\necho ready >"$TEST_DIR/ready"\nsleep 5\n')
        self.interrupt(["/bin/sh", str(ROOT / WRAPPER), "cmd", "0.test",
                        "https://controller.invalid/package", "0" * 64,
                        str(self.base / "state"), str(curl)], self.base / "ready", signal.SIGTERM)
        self.assertEqual(list(self.tmp.iterdir()), [])
        self.assertFalse((self.base / "lock").exists())


if __name__ == "__main__":
    if not shutil.which("php"):
        raise SystemExit("PHP must already be installed; no dependencies are installed by this test.")
    unittest.main(verbosity=2)
