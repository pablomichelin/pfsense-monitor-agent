#!/usr/bin/env python3
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
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
        self.package = packages / "pfsense-package"
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

    def test_excludes_mac_metadata_and_stamps_the_archive(self):
        (self.package / "files/.DS_Store").write_text("synthetic Finder metadata")
        (self.package / "files/._metadata").write_text("synthetic resource fork")
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        with tarfile.open(self.dist / self.name) as archive:
            self.assertFalse(any(Path(name).name.startswith(("._", ".DS_Store")) for name in archive.getnames()))
            self.assertEqual(archive.extractfile("pfsense-package/VERSION").read().strip(),
                             f"v{self.version}".encode())

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

    def test_interrupted_publication_finishes_the_same_artifact_on_retry(self):
        # Exit immediately after the archive link, before Python can run any cleanup.
        (self.shims / "sitecustomize.py").write_text("""
import os
from pathlib import Path

original_link = os.link
name = os.environ["QUALITY_TEST_ARTIFACT_NAME"]

def interrupt_after_publish(source, destination, *args, **kwargs):
    result = original_link(source, destination, *args, **kwargs)
    if Path(destination).name == name:
        os._exit(91)
    return result

os.link = interrupt_after_publish
""")
        failed = subprocess.run(
            [str(self.script), self.version],
            env={**self.env, "PYTHONPATH": str(self.shims), "QUALITY_TEST_ARTIFACT_NAME": self.name},
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(failed.returncode, 91, failed.stderr)
        archive = self.dist / self.name
        original = archive.read_bytes()
        self.assertFalse((self.dist / f"{self.name}.sha256").exists())
        retry = self.run_script(self.version)
        self.assertEqual(retry.returncode, 0, retry.stderr)
        self.assertEqual(archive.read_bytes(), original)
        self.assert_valid_artifact()
        self.assertFalse(list(self.dist.glob("*.pending")))

    def test_unknown_incomplete_artifact_is_not_overwritten_or_signed(self):
        self.dist.mkdir(parents=True)
        archive = self.dist / self.name
        archive.write_bytes(b"unknown artifact")
        result = self.run_script(self.version)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no matching staged checksum", result.stderr)
        self.assertEqual(archive.read_bytes(), b"unknown artifact")
        self.assertFalse((self.dist / f"{self.name}.sha256").exists())

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
