import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class ReleaseArgumentTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="pfs-release-args-")
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.trace = self.root / "trace"
        self.release = self.root / "scripts/release-pfsense-package.sh"
        self.write(
            "scripts/release-pfsense-package.sh",
            Path(__file__).with_name("release-pfsense-package.sh").read_text(),
        )
        self.write("packages/pfsense-package/Makefile", "PORTVERSION=9.9.9\n")
        self.write(
            "packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc",
            'define("SYSTEMUP_MONITOR_AGENT_VERSION", "9.9.9");\n',
        )
        self.write(".env.api", "PACKAGE_RELEASE_REPO_RAW_BASE=https://qa.example.test/source\n")
        self.write(
            "scripts/build-pfsense-package-artifact.sh",
            '''#!/bin/bash
set -eu
printf 'build %s\n' "$1" >> "$PFS_QA_TRACE"
dir="$PFS_QA_ROOT/dist/pfsense-package"
mkdir -p "$dir"
printf 'synthetic\n' > "$dir/monitor-pfsense-package-v$1.tar.gz"
archive="$dir/monitor-pfsense-package-v$1.tar.gz"
python3 -c 'from pathlib import Path; import hashlib, sys; p = Path(sys.argv[1]); print(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}")' "$archive" > "$archive.sha256"
''',
            executable=True,
        )
        self.write(
            "bin/git",
            '''#!/bin/bash
set -eu
printf 'git %s\n' "$3" >> "$PFS_QA_TRACE"
case "$3" in
  add) exit 0 ;;
  commit) [[ "$4" == --only ]] ;;
  diff) [[ "${PFS_QA_ALREADY_COMMITTED:-0}" == 1 ]] ;;
  log) printf 'Release pfsense package 9.9.9\n' ;;
  push) [[ "${PFS_QA_FAIL_PUSH:-0}" == 0 ]] ;;
  *) exit 99 ;;
esac
''',
            executable=True,
        )

    def write(self, path, contents, executable=False):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(contents)
        if executable:
            target.chmod(0o700)

    def run_release(self, *args, extra_env=None):
        result = subprocess.run(
            ["/bin/bash", self.release, *args],
            cwd=self.root,
            env={
                **os.environ,
                "PFS_QA_TRACE": str(self.trace),
                "PFS_QA_ROOT": str(self.root),
                "PATH": f"{self.root}/bin:{os.environ['PATH']}",
                **(extra_env or {}),
            },
            capture_output=True,
            text=True,
            timeout=10,
        )
        events = self.trace.read_text().splitlines() if self.trace.exists() else []
        return result, events

    def test_unknown_argument_stops_before_build_or_git(self):
        result, events = self.run_release("--no-pus")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--no-pus", result.stderr)
        self.assertEqual(events, [])
        self.assertFalse((self.root / "config/package-release.env").exists())

    def test_no_push_builds_without_git(self):
        result, events = self.run_release("--no-push")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(events, ["build 9.9.9"])
        self.assertIn("PACKAGE_RELEASE_VERSION=9.9.9", (self.root / "config/package-release.env").read_text())

    def test_default_flow_remains_available_with_mocked_git(self):
        result, events = self.run_release()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(events, ["build 9.9.9", "git add", "git diff", "git commit", "git push"])

    def test_help_has_no_side_effects(self):
        result, events = self.run_release("--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("--no-push", result.stdout)
        self.assertEqual(events, [])

    def test_prepare_then_publish_preserves_the_artifact(self):
        preparation, events = self.run_release("--no-push")
        self.assertEqual(preparation.returncode, 0, preparation.stderr)
        self.assertEqual(events, ["build 9.9.9"])
        archive = self.root / "dist/pfsense-package/monitor-pfsense-package-v9.9.9.tar.gz"
        original = (archive.read_bytes(), archive.stat().st_ino)
        manifest = self.root / "config/package-release.env"
        prepared_manifest = manifest.read_bytes()
        self.write(".env.api", "PACKAGE_RELEASE_REPO_RAW_BASE=https://changed.example.test/source\n")
        published, events = self.run_release("--publish-prepared")
        self.assertEqual(published.returncode, 0, published.stderr)
        self.assertEqual(events, ["build 9.9.9", "git add", "git diff", "git commit", "git push"])
        self.assertEqual((archive.read_bytes(), archive.stat().st_ino), original)
        self.assertEqual(manifest.read_bytes(), prepared_manifest)

    def test_prepared_release_retries_push_without_another_commit(self):
        preparation, _ = self.run_release("--no-push")
        self.assertEqual(preparation.returncode, 0, preparation.stderr)
        failed, events = self.run_release("--publish-prepared", extra_env={"PFS_QA_FAIL_PUSH": "1"})
        self.assertNotEqual(failed.returncode, 0)
        self.assertEqual(events.count("git commit"), 1)
        retried, events = self.run_release("--publish-prepared", extra_env={"PFS_QA_ALREADY_COMMITTED": "1"})
        self.assertEqual(retried.returncode, 0, retried.stderr)
        self.assertEqual(events.count("git commit"), 1)
        self.assertEqual(events[-4:], ["git add", "git diff", "git log", "git push"])

    def test_prepared_artifact_with_changed_checksum_stops_before_git(self):
        preparation, _ = self.run_release("--no-push")
        self.assertEqual(preparation.returncode, 0, preparation.stderr)
        self.write("dist/pfsense-package/monitor-pfsense-package-v9.9.9.tar.gz", "changed")
        published, events = self.run_release("--publish-prepared")
        self.assertNotEqual(published.returncode, 0)
        self.assertIn("Checksum do artefato preparado não confere", published.stderr)
        self.assertEqual(events, ["build 9.9.9"])

    def test_prepared_manifest_rejects_duplicate_keys_and_requires_a_repository_url(self):
        preparation, _ = self.run_release("--no-push")
        self.assertEqual(preparation.returncode, 0, preparation.stderr)
        manifest = self.root / "config/package-release.env"
        original = manifest.read_text()
        for changed, message in (
            (original + " PACKAGE_RELEASE_VERSION = 1.0.0\n", "Chave repetida"),
            ("\n".join(line for line in original.splitlines()
                        if not line.startswith("PACKAGE_RELEASE_REPO_RAW_BASE=")), "URL do repositório ausente"),
        ):
            with self.subTest(message=message):
                manifest.write_text(changed)
                release, events = self.run_release("--publish-prepared")
                self.assertNotEqual(release.returncode, 0)
                self.assertIn(message, release.stderr)
                self.assertEqual(events, ["build 9.9.9"])

    def test_conflicting_modes_stop_before_build_or_git(self):
        result, events = self.run_release("--no-push", "--publish-prepared")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(events, [])


if __name__ == "__main__":
    unittest.main()
