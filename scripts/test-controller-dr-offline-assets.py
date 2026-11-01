#!/usr/bin/env python3
"""Three directed offline-source/artifact cases. Synthetic Git only; no Docker, PG or AES."""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


b = load('dr_offline_capture', 'backup-controller-dr.py')
v = load('dr_offline_validation', 'verify-controller-dr.py')
VERSION = '0.0.1'
NAME = 'monitor-pfsense-package-v' + VERSION + '.tar.gz'
ARTIFACT = b'synthetic offline package bytes, no customer content'
SHA = hashlib.sha256(ARTIFACT).hexdigest()


class OfflineAssets(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='controller-dr-offline-assets-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.git('init', '--quiet')
        for name in ('.env.api', '.env.web', '.env.db', 'compose.yaml', 'infra/nginx/default.conf'):
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('SYNTHETIC_ONLY=fixture\n')
        self.config = 'PACKAGE_RELEASE_VERSION=' + VERSION + '\nPACKAGE_RELEASE_SHA256=' + SHA + '\n'
        (self.repo / 'config').mkdir()
        (self.repo / 'config/package-release.env').write_text(self.config)
        self.artifact = self.repo / 'dist/pfsense-package' / NAME
        self.artifact.parent.mkdir(parents=True)
        self.artifact.write_bytes(ARTIFACT)
        self.sidecar = self.artifact.with_name(NAME + '.sha256')
        self.sidecar.write_text(SHA + '  ' + NAME + '\n')
        self.git('add', '.')
        self.git('-c', 'user.name=DR Fixture', '-c', 'user.email=dr-fixture@example.invalid',
                 '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Synthetic source')
        self.commit = self.git('rev-parse', 'HEAD').decode().strip()

    def git(self, *args):
        return subprocess.run(['git', '-C', str(self.repo), '-c', 'core.hooksPath=/dev/null', *args],
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True).stdout

    def payload(self, name):
        payload = self.root / name
        (payload / 'runtime/config').mkdir(parents=True)
        (payload / 'runtime/config/package-release.env').write_text(self.config)
        return payload

    def test_source_bundle_is_self_contained_and_contains_head(self):
        payload = self.payload('source-case')
        assets, files = b.copy_recovery_assets(self.repo, payload, self.commit)
        bundle = payload / assets['source_bundle']['member']
        self.assertEqual(assets['source_bundle']['commit'], self.commit)
        self.assertEqual(files[assets['source_bundle']['member']], b.dr.digest(bundle))
        restored = self.root / 'fresh-bare'
        subprocess.run(['git', 'clone', '--bare', '--quiet', str(bundle), str(restored)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        subprocess.run(['git', '-C', str(restored), 'cat-file', '-e', self.commit + '^{commit}'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    def test_artifact_hash_absence_and_sidecar_fail_closed(self):
        for index, failure in enumerate(('hash', 'absent', 'sidecar-absent', 'sidecar-name', 'sidecar-hash')):
            self.artifact.write_bytes(ARTIFACT)
            self.sidecar.write_text(SHA + '  ' + NAME + '\n')
            if failure == 'hash':
                self.artifact.write_bytes(b'different synthetic artifact')
            elif failure == 'absent':
                self.artifact.unlink()
            elif failure == 'sidecar-absent':
                self.sidecar.unlink()
            elif failure == 'sidecar-name':
                self.sidecar.write_text(SHA + '  wrong-version.tar.gz\n')
            else:
                self.sidecar.write_text('0' * 64 + '  ' + NAME + '\n')
            with self.subTest(failure=failure), self.assertRaises((b.dr.DRError, FileNotFoundError)):
                b.copy_recovery_assets(self.repo, self.payload('failure-' + str(index)), self.commit)

    def test_runtime_manifest_covers_bundle_exact_artifact_and_sidecar(self):
        payload = self.root / 'manifest-case'
        payload.mkdir()
        real_run = b.dr.run
        role_cmd = [['node', 'dist/main.js'], ['node', 'server.js'], ['postgres'], ['nginx']]
        images = {}
        for index, command in enumerate(role_cmd, 1):
            identifier = 'sha256:' + str(index) * 64
            images[identifier] = {'Id': identifier, 'Config': {'Cmd': command, 'Env': ['PG_MAJOR=17']},
                                  'RootFS': {'Type': 'layers', 'Layers': ['sha256:' + 'a' * 64]},
                                  'Os': 'linux', 'Architecture': 'amd64'}
        def run(args, **kwargs):
            args = [str(a) for a in args]
            if args[:3] == ['docker', 'image', 'inspect']:
                return json.dumps([images[args[3]]]).encode()
            if args[0] == 'docker':
                return ('\n'.join(images) + '\n').encode()
            return real_run(args, **kwargs)
        with patch.object(b.dr, 'run', side_effect=run):
            files = b.copy_runtime(self.repo, payload, [])
        (payload / 'postgres.dump').write_bytes(b'synthetic custom dump, not executed')
        files['postgres.dump'] = b.dr.digest(payload / 'postgres.dump')
        manifest = {'format': 1, 'storage_prefix': '/app/data/pfsense-config-backups', 'refs': [], 'files': files}
        b.dr.write_json(payload / 'manifest.json', manifest)
        names = {p.relative_to(payload).as_posix() for p in payload.rglob('*') if p.is_file()}
        v.validate_manifest(payload, names)
        release = json.loads((payload / 'runtime/release.json').read_text())
        assets = release['recovery_assets']
        self.assertEqual(assets['source_bundle']['commit'], release['git_commit'])
        expected = {'runtime/recovery-assets/source.bundle',
                    'runtime/recovery-assets/dist/pfsense-package/' + NAME,
                    'runtime/recovery-assets/dist/pfsense-package/' + NAME + '.sha256'}
        self.assertTrue(expected <= files.keys())
        self.assertTrue(expected <= names)
        self.assertEqual(assets['package']['sha256'], SHA)
        # Generated paths must not be mistaken for live repo files in the later recheck loop.
        for member in files:
            if member == 'runtime/release.json' or member.startswith(('runtime/extra-keys/', 'runtime/recovery-assets/')):
                continue
            if member.startswith('runtime/'):
                self.assertEqual(files[member], b.dr.digest(self.repo / member[len('runtime/'):]))
        (payload / assets['package']['member']).write_bytes(b'corrupt synthetic copy')
        with self.assertRaises(v.dr.DRError):
            v.validate_manifest(payload, names)


if __name__ == '__main__':
    unittest.main(verbosity=2)
