#!/usr/bin/env python3
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class PackageBuildTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="pfs-package-build-")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        scripts = root / "scripts"
        scripts.mkdir()
        packages = root / "packages"
        shutil.copytree(ROOT / "packages/pfsense-package", packages / "pfsense-package")
        self.script = scripts / "build-pfsense-package-artifact.sh"
        shutil.copy2(ROOT / "scripts" / self.script.name, self.script)
        makefile = (packages / "pfsense-package/Makefile").read_text()
        self.version = re.search(r"^PORTVERSION=\s*(\S+)", makefile, re.M).group(1)
        self.dist = root / "dist/pfsense-package"
        self.name = f"monitor-pfsense-package-v{self.version}.tar.gz"
        self.shims = root / "shims"
        self.shims.mkdir()
        self.env = {
            **os.environ,
            "PATH": f"{self.shims}{os.pathsep}{os.environ['PATH']}",
            "QUALITY_TEST_REAL_TAR": shutil.which("tar"),
            "QUALITY_TEST_BARRIER": str(root),
        }
        (root / ".env.api").write_text("SYSTEM_VERSION=9.9.9\n")

    def tar_shim(self, script):
        executable = self.shims / "tar"
        executable.write_text("#!/usr/bin/env bash\nset -euo pipefail\n" + script)
        executable.chmod(0o755)

    def run_script(self, *args):
        return subprocess.run(
            [str(self.script), *args], env=self.env, capture_output=True, text=True, timeout=20,
        )

    def assert_valid_artifact(self):
        artifact = self.dist / self.name
        sidecar = self.dist / f"{self.name}.sha256"
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
        self.assertEqual(sidecar.read_text(), f"{digest}  {self.name}\n")

    def test_uses_package_version_when_omitted(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_valid_artifact()

    def test_archive_failure_leaves_no_final_file_and_can_retry(self):
        self.tar_shim("""
while [[ $# -gt 1 ]]; do
  if [[ "$1" = -czf ]]; then
    printf 'partial archive' > "$2"
    exit 7
  fi
  shift
done
exit 8
""")
        result = self.run_script(self.version)
        self.assertEqual(result.returncode, 7, result.stderr)
        self.assertFalse((self.dist / self.name).exists())
        self.assertFalse((self.dist / f"{self.name}.sha256").exists())
        (self.shims / "tar").unlink()
        retry = self.run_script(self.version)
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assert_valid_artifact()

    def test_simultaneous_builds_cannot_overwrite_the_same_version(self):
        self.tar_shim("""
touch "$QUALITY_TEST_BARRIER/$QUALITY_TEST_SLOT"
for attempt in {1..100}; do
  if [[ -f "$QUALITY_TEST_BARRIER/one" && -f "$QUALITY_TEST_BARRIER/two" ]]; then
    exec "$QUALITY_TEST_REAL_TAR" "$@"
  fi
  sleep 0.05
done
exit 9
""")
        processes = []
        try:
            for slot in ("one", "two"):
                processes.append(subprocess.Popen(
                    [str(self.script), self.version],
                    env={**self.env, "QUALITY_TEST_SLOT": slot},
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                ))
            outcomes = [process.communicate(timeout=20) for process in processes]
            self.assertEqual(sorted(process.returncode for process in processes), [0, 1], outcomes)
            self.assert_valid_artifact()
        finally:
            for process in processes:
                if process.poll() is None:
                    process.kill()
                    process.communicate()


if __name__ == "__main__":
    unittest.main()
