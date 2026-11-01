#!/usr/bin/env python3
"""Only secret-transport regression; no pfSense/network/build/suite16.

The installer fixture uses production parsing and PHP seed invocation, redirecting
only executable/CLI paths to local mocks. Other install operations are omitted.
Temporary archives are synthetic fixtures, not release artifacts.
"""
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "packages/pfsense-package"
CLI = "/usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php"


class SecretTransport(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pfs-secret-transport-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.tmp = self.base / "tmp"
        self.tmp.mkdir()
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.secret = "synthetic-secret-'-$-space-end"
        self.env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ["PATH"],
                        TMPDIR=str(self.tmp), TEST_DIR=str(self.base), EXPECTED_SECRET=self.secret)
        self.env.pop("MONITOR_UPDATE_NODE_SECRET", None)
        dirname = self.bin / "dirname"
        dirname.write_text('#!/bin/sh\n'
                           'if [ "${MONITOR_UPDATE_NODE_SECRET+x}" = x ]; then\n'
                           '  echo inherited >"$TEST_DIR/helper-secret-leak"\nfi\n'
                           'exec ' + shlex.quote(shutil.which("dirname")) + ' "$@"\n')
        dirname.chmod(0o755)
        self.cli = self.base / "cli.php"
        self.cli.write_text('''<?php
$expected = getenv("EXPECTED_SECRET");
$at = array_search("--node-secret", $argv, true);
$osArgs = shell_exec("ps -p " . getmypid() . " -o command=");
$record = [
    "seed" => ($argv[1] ?? null) === "seed",
    "received" => $at !== false && ($argv[$at + 1] ?? null) === $expected,
    "os_argv_clean" => is_string($osArgs) && strpos($osArgs, $expected) === false,
    "environment_clean" => getenv("MONITOR_UPDATE_NODE_SECRET") === false,
    "customer" => $argv[array_search("--customer-code", $argv, true) + 1] ?? null,
];
file_put_contents(getenv("TEST_DIR") . "/result.json", json_encode($record));
''')
        source = (PACKAGE / "bootstrap/install.sh").read_text()
        prefix = source[:source.index("\ninstall_package_files\n")]
        start = source.index("  set -- seed\n")
        end = source.index("\n  # install_package_xml/seed", start)
        seed = source[start:end].replace("/usr/local/bin/php", shlex.quote(shutil.which("php")))
        seed = seed.replace(CLI, str(self.cli))
        probe = '\n[ "${MONITOR_UPDATE_NODE_SECRET+x}" != x ] || exit 91\n'
        probe += "php -r 'exit(getenv(\"MONITOR_UPDATE_NODE_SECRET\") === false ? 0 : 92);'\n"
        stage = self.base / "pfsense-package/bootstrap"
        stage.mkdir(parents=True)
        self.install = stage / "install.sh"
        self.install.write_text(prefix + probe + seed + "\n")
        self.install.chmod(0o755)
        self.archive = self.base / "fixture.tar.gz"
        with tarfile.open(self.archive, "w:gz") as archive:
            archive.add(self.base / "pfsense-package", arcname="pfsense-package")
        self.digest = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.env["ARCHIVE"] = str(self.archive)
        download = '''#!/bin/sh
[ "${MONITOR_UPDATE_NODE_SECRET+x}" != x ] || exit 93
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then cp "$ARCHIVE" "$2"; exit; fi
  shift
done
exit 94
'''
        for name in ["fetch", "curl"]:
            mock = self.bin / name
            mock.write_text(download)
            mock.chmod(0o755)

    def check(self, result):
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn(self.secret, result.stdout + result.stderr)
        self.assertEqual(json.loads((self.base / "result.json").read_text()), {
            "seed": True, "received": True, "os_argv_clean": True,
            "environment_clean": True, "customer": "SYNTHETIC WITH SPACE"})
        self.assertEqual(list(self.tmp.iterdir()), [])
        self.assertFalse((self.base / "helper-secret-leak").exists())

    def run_script(self, script, args, environment):
        return subprocess.run(["/bin/sh", str(script), *args], env=environment,
                              capture_output=True, text=True, timeout=10)

    def test_direct_install_environment_and_legacy(self):
        for legacy in [False, True]:
            with self.subTest(legacy=legacy):
                environment = dict(self.env)
                args = ["--customer-code", "SYNTHETIC WITH SPACE"]
                if legacy:
                    args += ["--node-secret", self.secret]
                else:
                    environment["MONITOR_UPDATE_NODE_SECRET"] = self.secret
                result = self.run_script(self.install, args, environment)
                self.check(result)
                self.assertEqual("deprecated" in result.stderr, legacy)

    def test_release_installer_environment_file_and_legacy(self):
        for mode in ["environment", "file", "legacy"]:
            with self.subTest(mode=mode):
                environment = dict(self.env)
                args = ["--release-url", "https://synthetic.invalid/package", "--sha256", self.digest,
                        "--customer-code", "SYNTHETIC WITH SPACE"]
                if mode == "environment":
                    environment["MONITOR_UPDATE_NODE_SECRET"] = self.secret
                    args += ["--node-secret", "ignored-legacy-value"]
                elif mode == "file":
                    secret_file = self.base / "input-secret"
                    secret_file.write_text(self.secret)
                    args += ["--secret-file", str(secret_file)]
                else:
                    args += ["--node-secret", self.secret]
                self.check(self.run_script(PACKAGE / "bootstrap/install-from-release.sh", args, environment))

    def test_upgrade_to_php_seed_without_secret_in_process_args(self):
        if Path("/usr/local/etc/rc.d/monitor_pfsense_agent").exists():
            self.skipTest("requires a host without the pfSense service")
        secret_file = self.base / "canonical-secret"
        secret_file.write_text(self.secret)
        config = self.base / "config"
        config.write_text('CONTROLLER_URL="https://synthetic.invalid"\n'
                          'NODE_UID="synthetic"\nCUSTOMER_CODE="SYNTHETIC WITH SPACE"\n'
                          f'NODE_SECRET_FILE="{secret_file}"\n')
        reporter = self.base / "reporter"
        reporter.write_text('#!/bin/sh\n[ "${MONITOR_UPDATE_NODE_SECRET+x}" != x ]\n')
        reporter.chmod(0o755)
        environment = dict(self.env, MONITOR_AGENT_CONFIG_FILE=str(config),
                           MONITOR_AGENT_BIN=str(reporter),
                           MONITOR_AGENT_LOG_FILE=str(self.base / "agent.log"),
                           MONITOR_PACKAGE_UPGRADE_LOG=str(self.base / "upgrade.log"),
                           MONITOR_PACKAGE_UPGRADE_LOCK=str(self.base / "lock"))
        wrapper = PACKAGE / "files/usr/local/libexec/monitor-pfsense-agent/run_package_upgrade.sh"
        self.check(self.run_script(wrapper, ["cmd", "0.5.26", "https://synthetic.invalid/package",
                                            self.digest, str(self.base / "state"), str(self.bin / "curl")],
                                   environment))
        self.assertFalse((self.base / "lock").exists())
        self.assertNotIn(self.secret, (self.base / "upgrade.log").read_text())

    def test_verified_old_installer_legacy_compatibility(self):
        # An old, verified artifact ignores the environment and requires argv.
        # The fixture contains no environment-support marker; its bytes stay intact.
        legacy_stage = self.base / "legacy-stage/pfsense-package/bootstrap"
        legacy_stage.mkdir(parents=True)
        legacy = legacy_stage / "install.sh"
        legacy_bytes = (b'#!/bin/sh\nLEGACY_INSTALLER_PATH="$0" php '
                        b'"$TEST_DIR/legacy-recorder.php" "$@"\n')
        legacy.write_bytes(legacy_bytes)
        legacy.chmod(0o755)
        self.assertNotIn(b"MONITOR_UPDATE_NODE_SECRET", legacy_bytes)
        recorder = self.base / "legacy-recorder.php"
        recorder.write_text('''<?php
$secretIndex = array_search("--node-secret", $argv, true);
$customerIndex = array_search("--customer-code", $argv, true);
$uidIndex = array_search("--node-uid", $argv, true);
file_put_contents(getenv("TEST_DIR") . "/legacy-result.json", json_encode([
    "received" => $secretIndex !== false && ($argv[$secretIndex + 1] ?? null) === getenv("EXPECTED_SECRET"),
    "secret_count" => count(array_keys($argv, "--node-secret", true)),
    "environment_clean" => getenv("MONITOR_UPDATE_NODE_SECRET") === false,
    "customer" => $customerIndex === false ? null : ($argv[$customerIndex + 1] ?? null),
    "node_uid" => $uidIndex === false ? null : ($argv[$uidIndex + 1] ?? null),
    "installer_sha256" => hash_file("sha256", getenv("LEGACY_INSTALLER_PATH")),
]));
''')
        archive = self.base / "verified-old.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(self.base / "legacy-stage/pfsense-package", arcname="pfsense-package")
        archive_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        environment = dict(self.env, ARCHIVE=str(archive), MONITOR_UPDATE_NODE_SECRET=self.secret)
        result = self.run_script(PACKAGE / "bootstrap/install-from-release.sh", [
            "--release-url", "https://synthetic.invalid/old-package", "--sha256", archive_digest,
            "--node-secret", "ignored-legacy-argument", "--node-uid", "preserved-identity",
            "--customer-code", "SYNTHETIC WITH SPACE"], environment)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("verified legacy installer", result.stderr)
        self.assertIn("process arguments", result.stderr)
        self.assertNotIn(self.secret, result.stdout + result.stderr)
        self.assertEqual(json.loads((self.base / "legacy-result.json").read_text()), {
            "received": True, "secret_count": 1, "environment_clean": True,
            "customer": "SYNTHETIC WITH SPACE", "node_uid": "preserved-identity",
            "installer_sha256": hashlib.sha256(legacy_bytes).hexdigest()})
        self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), archive_digest)
        self.assertEqual(list(self.tmp.iterdir()), [])


if __name__ == "__main__":
    if not shutil.which("php") or not shutil.which("ps"):
        raise SystemExit("Requires existing PHP and ps; no dependencies are installed.")
    unittest.main(verbosity=2)
