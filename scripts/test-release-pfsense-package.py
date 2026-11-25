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
printf 'test-checksum synthetic\n' > "$dir/monitor-pfsense-package-v$1.tar.gz.sha256"
''',
            executable=True,
        )
        self.write(
            "bin/git",
            '''#!/bin/bash
set -eu
printf 'git %s\n' "$3" >> "$PFS_QA_TRACE"
case "$3" in
  add|commit|push) exit 0 ;;
  diff) exit 1 ;;
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

    def run_release(self, *args):
        result = subprocess.run(
            ["/bin/bash", self.release, *args],
            cwd=self.root,
            env={
                **os.environ,
                "PFS_QA_TRACE": str(self.trace),
                "PFS_QA_ROOT": str(self.root),
                "PATH": f"{self.root}/bin:{os.environ['PATH']}",
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


if __name__ == "__main__":
    unittest.main()
