#!/usr/bin/env python3
"""Directed synthetic DR regressions. No real Docker, GPG, SSH, environment or customer files."""
import sys
sys.dont_write_bytecode = True

import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


b = load('backup', 'backup-controller-dr.py')
v = load('verify', 'verify-controller-dr.py')
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PREFIX = '/app/data/pfsense-config-backups'
XML_KEY, SECRET_KEY = bytes(range(32)), bytes(reversed(range(32)))
XML = b'<pfsense><synthetic>DR-TEST-ONLY</synthetic></pfsense>'
SECRET = b'synthetic-secret-never-print'


def identifier(index):
    return 'dr-20261101T000000Z-' + f'{index:016x}'


def encrypted_xml(xml=XML):
    nonce = b'0123456789ab'
    return nonce + AESGCM(XML_KEY).encrypt(nonce, xml, None)


def ref(index=1):
    return {'id': str(index), 'storage_path': PREFIX + f'/synthetic/2026/11/{index}.enc',
            'sha256': hashlib.sha256(XML).hexdigest(), 'size': len(XML), 'version': 'aes-256-gcm:v1'}


def secret_record():
    nonce = b'abcdefghijkl'
    ct = AESGCM(SECRET_KEY).encrypt(nonce, SECRET, None)
    return {'encrypted': '.'.join(base64.b64encode(x).decode() for x in (nonce, ct[-16:], ct[:-16])),
            'hash': hashlib.sha256(SECRET).hexdigest()}


def frame(data=b'synthetic-GPG-ciphertext', **changes):
    header = {'format': 1, 'created_utc': '20261101T000000Z', 'bytes': len(data),
              'sha256': hashlib.sha256(data).hexdigest()}
    header.update(changes)
    return io.BytesIO(json.dumps(header).encode() + b'\n' + data)


def tar_bytes(files):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w') as tar:
        for name, data in files:
            member = tarfile.TarInfo(name)
            member.size = len(data)
            tar.addfile(member, io.BytesIO(data))
    return stream.getvalue()


class FakeDecrypt:
    def __init__(self, data, status=0):
        self.stdout = io.BytesIO(data)
        self.status = status

    def wait(self, **_):
        return self.status

    def poll(self):
        return self.status


class DRTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='controller-dr-synthetic-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()  # macOS /tmp is a symlink; production rejects symlink ancestors.
        self.old_umask = os.umask(0o077)
        self.addCleanup(os.umask, self.old_umask)

    def fixture(self):
        payload = self.root / 'payload'
        payload.mkdir()
        files = {}
        runtime = ['.env.api', '.env.db', '.env.web', 'compose.yaml', 'config/package-release.env',
                   'infra/nginx/default.conf', 'release.json']
        for name in runtime:
            path = payload / 'runtime' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            data = b'synthetic-only'
            if name == '.env.api':
                data = ('BACKUP_ENCRYPTION_KEY_BASE64="' + base64.b64encode(XML_KEY).decode() + '"\n' +
                        'NODE_SECRET_ENCRYPTION_KEY_BASE64=' + base64.b64encode(SECRET_KEY).decode() + '\n').encode()
            path.write_bytes(data)
            files['runtime/' + name] = v.dr.digest(path)
        (payload / 'postgres.dump').write_bytes(b'synthetic-PG17-dump')
        files['postgres.dump'] = v.dr.digest(payload / 'postgres.dump')
        r = dict(ref(), member='backups/synthetic/2026/11/1.enc')
        path = payload / r['member']
        path.parent.mkdir(parents=True)
        path.write_bytes(encrypted_xml())
        r['encrypted_sha256'] = v.dr.digest(path)
        manifest = {'format': 1, 'storage_prefix': PREFIX, 'refs': [r], 'files': files}
        v.dr.write_json(payload / 'manifest.json', manifest)
        names = {p.relative_to(payload).as_posix() for p in payload.rglob('*') if p.is_file()}
        return payload, manifest, names

    def test_receive_atomic_retention_permissions_and_failure_preserves_sets(self):
        dest = self.root / 'destination'
        for i in range(9):
            b.receive_stream(identifier(i), frame(), dest)
        sets = sorted(p.name for p in dest.iterdir() if p.is_dir())
        # Transport checksum alone never evicts even an older unverified set.
        self.assertEqual(sets, [identifier(i) for i in range(9)])
        self.assertEqual(dest.stat().st_mode & 0o777, 0o700)
        for directory in [dest / s for s in sets]:
            self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
            for file in directory.iterdir():
                self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            b.dr.validate_set(directory)
        failures = [frame(sha256='0' * 64), frame(bytes=999), frame(bytes=1),
                    io.BytesIO(b'{}\n'), io.BytesIO(b'x' * 4097)]
        for stream in failures:
            with self.assertRaises((b.dr.DRError, ValueError, KeyError, TypeError)):
                b.receive_stream(identifier(10), stream, dest)
            self.assertEqual(sorted(p.name for p in dest.iterdir() if p.is_dir()), sets)
            self.assertFalse(list(dest.glob('.incoming-*')))
        with self.assertRaises(b.dr.DRError):
            b.receive_stream(identifier(8), frame(), dest)
        with self.assertRaises(b.dr.DRError):
            b.receive_stream('../escape', frame(), dest)
        with b.dr.locked(dest / '.lock'):
            with self.assertRaises(b.dr.DRError):
                b.receive_stream(identifier(11), frame(), dest)

    def test_verified_retention_preserves_anchor_until_new_restore_passes(self):
        dest = self.root / 'destination'
        for i in range(9):
            b.receive_stream(identifier(i), frame(), dest)
        self.assertIsNone(b.dr.verified_recovery(dest))
        self.assertEqual(b.prune(dest), 0)
        self.assertEqual(len([p for p in dest.iterdir() if p.is_dir()]), 9)

        # Equivalent to a successful restore, with only synthetic data.
        b.dr.mark_verified(dest, identifier(0))
        self.assertEqual(b.prune(dest), 1)
        self.assertTrue((dest / identifier(0)).is_dir())
        self.assertFalse((dest / identifier(1)).exists())
        self.assertEqual(b.dr.verified_recovery(dest)['id'], identifier(0))

        # New transfer with a valid transport hash but no recovery proof.
        b.receive_stream(identifier(9), frame(), dest)
        self.assertEqual(b.prune(dest), 1)
        self.assertTrue((dest / identifier(0)).is_dir())

        # Even a stale marker with altered bytes must fail closed.
        marker = dest / b.dr.VERIFIED_FILE
        correct_marker = marker.read_bytes()
        marker.write_text('{"format":1,"id":"missing"}')
        with self.assertRaises(b.dr.DRError):
            b.prune(dest)
        marker.write_bytes(correct_marker)
        self.assertTrue((dest / identifier(0)).is_dir())

        # A genuinely restored successor replaces the protected anchor.
        b.dr.mark_verified(dest, identifier(9))
        self.assertEqual(b.prune(dest), 1)
        self.assertFalse((dest / identifier(0)).exists())
        self.assertEqual(b.dr.verified_recovery(dest)['id'], identifier(9))

    def test_no_publication_on_atomic_rename_failure(self):
        dest = self.root / 'destination'
        with patch.object(b.os, 'rename', side_effect=OSError('synthetic')), patch.object(b, 'prune') as prune:
            with self.assertRaises(OSError):
                b.receive_stream(identifier(1), frame(), dest)
            prune.assert_not_called()
        self.assertFalse(list(dest.glob('.incoming-*')))
        self.assertFalse((dest / identifier(1)).exists())

    def test_pins_survive_retention_and_capture_post_pin_reference(self):
        storage, pins, payload = [self.root / n for n in ('storage', 'pins', 'payload')]
        for d in (storage, pins, payload):
            d.mkdir()
        r1, r2 = ref(1), ref(2)
        source = storage / 'synthetic/2026/11/1.enc'
        source.parent.mkdir(parents=True)
        source.write_bytes(encrypted_xml())
        old_mode = source.stat().st_mode
        b.pin_tree(storage, pins)
        self.assertEqual(source.stat().st_ino, (pins / source.relative_to(storage)).stat().st_ino)
        self.assertEqual(source.stat().st_mode, old_mode)
        source.unlink()  # retention after initial pin; original name no longer exists
        (source.parent / '2.enc').write_bytes(encrypted_xml())  # ingest after initial pin
        copied = b.materialize_refs([r1, r2], storage, PREFIX, pins, payload)
        self.assertEqual(len(copied), 2)
        for item in copied:
            self.assertEqual(v.dr.digest(payload / item['member']), item['encrypted_sha256'])
        with self.assertRaises(FileNotFoundError):
            b.materialize_refs([ref(3)], storage, PREFIX, pins, payload)
        with self.assertRaises(b.dr.DRError):
            b.materialize_refs([r1, r1], storage, PREFIX, pins, payload)

    def test_paths_symlinks_and_unknown_encryption_rejected(self):
        for value in (PREFIX + '/../escape.enc', '/other/1.enc', PREFIX + '/a//1.enc', None):
            with self.assertRaises(b.dr.DRError):
                b.dr.ref_path(dict(ref(), storage_path=value), PREFIX)
        with self.assertRaises(b.dr.DRError):
            b.dr.ref_path(dict(ref(), version='unknown'), PREFIX)
        storage, pins = self.root / 'storage', self.root / 'pins'
        storage.mkdir()
        pins.mkdir()
        (storage / 'link.enc').symlink_to(self.root / 'absent')
        with self.assertRaises(b.dr.DRError):
            b.pin_tree(storage, pins)

    def test_snapshot_is_shared_and_dump_errors_abort(self):
        dump = self.root / 'postgres.dump'
        snap = b.Snapshot(self.root)
        queries = []
        def query(sql):
            queries.append(sql)
            if 'pg_export_snapshot' in sql:
                return ['00000001-00000001-1']
            if sql == b.dr.REF_SQL:
                return [json.dumps(ref())]
            return []
        snap.query = query
        commands = []
        def run(args, **kw):
            commands.append(args)
            kw['output'].write(b'PG17-synthetic')
        with patch.object(b.dr, 'run', side_effect=run), patch.object(b.subprocess, 'run', return_value=Mock(returncode=0)):
            self.assertEqual(snap.capture(dump), [ref()])
        command = commands[0]
        self.assertIn('--snapshot=00000001-00000001-1', command)
        self.assertIn('--lock-wait-timeout=3s', command)
        self.assertIn('REPEATABLE READ READ ONLY', queries[0])
        self.assertEqual(queries[1], b.dr.REF_SQL)
        self.assertEqual(queries[-1], 'ROLLBACK;')
        dump.unlink()
        with patch.object(b.dr, 'run', side_effect=b.dr.DRError('synthetic')):
            with self.assertRaises(b.dr.DRError):
                snap.capture(dump)

    def test_every_xml_gcm_hash_and_size_validated_without_plaintext_file(self):
        payload, manifest, names = self.fixture()
        v.validate_manifest(payload, names)
        keys = v.load_aes_keys(payload / 'runtime/.env.api')
        self.assertEqual(keys['BACKUP_ENCRYPTION_KEY_BASE64'], XML_KEY)
        refs = manifest['refs']
        v.validate_xmls(payload, refs, XML_KEY)
        with self.assertRaises(v.dr.DRError):
            v.validate_xmls(payload, refs, b'x' * 32)
        with self.assertRaises(v.dr.DRError):
            v.validate_xmls(payload, [dict(refs[0], sha256='0' * 64)], XML_KEY)
        path = payload / refs[0]['member']
        corrupt = bytearray(path.read_bytes())
        corrupt[-1] ^= 1
        path.write_bytes(corrupt)
        with self.assertRaises(v.dr.DRError):
            v.validate_xmls(payload, refs, XML_KEY)
        with self.assertRaises(v.dr.DRError):
            v.validate_manifest(payload, names)
        self.assertFalse(any(p.suffix == '.xml' for p in payload.rglob('*')))
        self.assertFalse(any(XML in p.read_bytes() for p in payload.rglob('*') if p.is_file()))

    def test_all_node_secrets_and_hashes_validated_no_output(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            self.assertEqual(v.validate_secrets([secret_record(), secret_record()], SECRET_KEY), 2)
            for record in [dict(secret_record(), hash='0' * 64),
                           dict(secret_record(), encrypted='corrupt'),
                           dict(secret_record(), encrypted=secret_record()['encrypted'][:-2] + 'AA')]:
                with self.assertRaises(v.dr.DRError):
                    v.validate_secrets([secret_record(), record], SECRET_KEY)
            with self.assertRaises(v.dr.DRError):
                v.validate_secrets([secret_record()], XML_KEY)
        self.assertEqual(out.getvalue(), '')

    def test_manifest_must_cover_restored_dump_exactly(self):
        payload, manifest, names = self.fixture()
        v.compare_refs(manifest['refs'], [ref()])
        for restored in ([], [ref(), ref(2)], [dict(ref(), sha256='0' * 64)]):
            with self.assertRaises(v.dr.DRError):
                v.compare_refs(manifest['refs'], restored)
        with self.assertRaises(v.dr.DRError):
            v.validate_manifest(payload, names | {'runtime/undeclared'})
        (payload / 'runtime/.env.db').write_bytes(b'corruption')
        with self.assertRaises(v.dr.DRError):
            v.validate_manifest(payload, names)

    def test_extract_rejects_links_traversal_duplicates_xml_and_failed_gpg(self):
        for files in ([('../escape', b'x')], [('runtime/a', b'x'), ('runtime/a', b'y')],
                      [('config.xml', XML)]):
            target = self.root / ('extract-' + str(len(list(self.root.iterdir()))))
            target.mkdir()
            with patch.object(v.subprocess, 'Popen', return_value=FakeDecrypt(tar_bytes(files))):
                with self.assertRaises(v.dr.DRError):
                    v.decrypt_extract(self.root / 'not-read.gpg', target, self.root)
        target = self.root / 'failed-gpg'
        target.mkdir()
        with patch.object(v.subprocess, 'Popen', return_value=FakeDecrypt(tar_bytes([('postgres.dump', b'x')]), 2)):
            with self.assertRaises(v.dr.DRError):
                v.decrypt_extract(self.root / 'not-read.gpg', target, self.root)
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w') as tar:
            link = tarfile.TarInfo('runtime/link')
            link.type = tarfile.SYMTYPE
            link.linkname = '/etc/passwd'
            tar.addfile(link)
        with patch.object(v.subprocess, 'Popen', return_value=FakeDecrypt(stream.getvalue())):
            with self.assertRaises(v.dr.DRError):
                v.decrypt_extract(self.root / 'not-read.gpg', target, self.root)

    def test_disposable_restore_limits_exit_on_error_and_cleanup(self):
        calls = []
        def run(args, **_):
            calls.append(args)
            return b''
        dump = self.root / 'dump'
        dump.write_bytes(b'synthetic')
        with patch.object(v.dr, 'run', side_effect=run), patch.object(v.subprocess, 'run', return_value=Mock(returncode=0)) as proc:
            with v.Restore() as database:
                database.restore(dump)
                name = database.name
            start = calls[0]
            for option, value in (('--network', 'none'), ('--cpus', '1'), ('--memory', '1g'),
                                  ('--memory-swap', '1g'), ('--log-driver', 'none')):
                self.assertEqual(start[start.index(option) + 1], value)
            self.assertIn('--pull=never', start)
            self.assertEqual(start[-1], 'postgres:17')
            self.assertFalse(any(x in start for x in ('-p', '--publish', '--mount', '-v')))
            self.assertIn('--exit-on-error', proc.call_args.args[0])
            self.assertEqual(calls[-1], ['docker', 'rm', '-f', '-v', name])
        calls.clear()
        with patch.object(v.dr, 'run', side_effect=run), patch.object(v.subprocess, 'run', return_value=Mock(returncode=1)), patch.object(v.time, 'sleep'):
            with self.assertRaises(v.dr.DRError):
                with v.Restore():
                    self.fail('DB was not ready')
            self.assertEqual(calls[-1][:5], ['docker', 'rm', '-f', '-v', calls[0][calls[0].index('--name') + 1]])

    def test_verifier_finally_cleans_private_temp_on_success_and_failure(self):
        payload, manifest, names = self.fixture()
        archive = tar_bytes([(n, (payload / n).read_bytes()) for n in sorted(names)])
        dest = self.root / 'destination'
        b.receive_stream(identifier(1), frame(), dest)
        state = self.root / 'state'
        keys = self.root / 'keys'
        keys.mkdir()
        events = []
        fail_restore = [False]
        class FakeRestore:
            def __enter__(self):
                return self
            def __exit__(self, *_):
                events.append('cleanup-volume-container')
            def restore(self, _):
                if fail_restore[0]:
                    raise v.dr.DRError('synthetic-restore-failure')
            def query(self, sql):
                if sql == v.dr.REF_SQL:
                    return [json.dumps(ref())]
                if sql == v.dr.SECRET_SQL:
                    return [json.dumps(secret_record())]
                return ['t']
        with patch.object(v.dr, 'host_guard'), patch.object(v.dr, 'DEST', dest), patch.object(v.dr, 'STATE', state), \
             patch.object(v.dr, 'KEYS', keys), patch.object(v.dr, 'run', return_value=b''), \
             patch.object(v.subprocess, 'Popen', side_effect=lambda *_a, **_k: FakeDecrypt(archive)), \
             patch.object(v, 'Restore', FakeRestore), contextlib.redirect_stdout(io.StringIO()):
            v.verify('latest', keys)
            self.assertEqual(list((state / 'verify-work').iterdir()), [])
            verified_before_failure = v.dr.verified_recovery(dest)
            self.assertEqual(verified_before_failure['id'], identifier(1))
            fail_restore[0] = True
            with self.assertRaises(v.dr.DRError):
                v.verify('latest', keys)
            self.assertEqual(list((state / 'verify-work').iterdir()), [])
            self.assertEqual(v.dr.verified_recovery(dest), verified_before_failure)
        self.assertEqual(len(events), 2)

    def test_transmit_only_ciphertext_to_fixed_install_path(self):
        archive = self.root / 'controller.tar.gpg'
        archive.write_bytes(b'encrypted-synthetic-only')
        class Sink(io.BytesIO):
            def close(self):
                self.saved = self.getvalue()
                super().close()
        sink = Sink()
        process = Mock(stdin=sink)
        process.wait.return_value = 0
        process.poll.return_value = 0
        with patch.object(b.subprocess, 'Popen', return_value=process) as popen:
            b.transmit(archive, identifier(1))
            args = popen.call_args.args[0]
            self.assertIn('root@192.168.100.220', args)
            self.assertEqual(args[-1], 'python3 /opt/monitor-pfsense-dr/scripts/backup-controller-dr.py receive ' + identifier(1))
        header, cipher = sink.saved.split(b'\n', 1)
        self.assertEqual(cipher, archive.read_bytes())
        self.assertEqual(set(json.loads(header)), {'format', 'created_utc', 'bytes', 'sha256'})

    def test_backup_missing_reference_dump_or_encrypt_failure_never_transmits(self):
        storage = self.root / 'data/storage'
        storage.mkdir(parents=True)
        source = storage / 'synthetic/2026/11/1.enc'
        source.parent.mkdir(parents=True)
        state = self.root / 'state'
        fail_dump = [False]
        class FakeSnapshot:
            def __init__(self, _):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *_):
                pass
            def capture(self, target):
                if fail_dump[0]:
                    raise b.dr.DRError('synthetic dump failure')
                target.write_bytes(b'synthetic-dump')
                return [ref()]
        args = SimpleNamespace(repo=str(self.root), storage=str(storage), keys=str(self.root / 'keys'),
                               recipient='A' * 40, db_storage_prefix=PREFIX, key_file=[])
        with patch.object(b.dr, 'host_guard'), patch.object(b.dr, 'STATE', state), \
             patch.object(b, 'copy_runtime', return_value={}), patch.object(b, 'Snapshot', FakeSnapshot), \
             patch.object(b, 'encrypt', side_effect=b.dr.DRError('synthetic encrypt failure')) as encrypt, \
             patch.object(b, 'transmit') as transmit:
            with self.assertRaises(FileNotFoundError):
                b.backup(args)
            encrypt.assert_not_called()
            source.write_bytes(encrypted_xml())
            with self.assertRaises(b.dr.DRError):
                b.backup(args)
            self.assertEqual(encrypt.call_count, 1)
            fail_dump[0] = True
            with self.assertRaises(b.dr.DRError):
                b.backup(args)
            transmit.assert_not_called()
        self.assertEqual(list((state / 'work').iterdir()), [])
        self.assertFalse(list(storage.parent.glob('.controller-dr-pins-*')))

    def test_gpg_public_fingerprint_gate_and_failed_encryption(self):
        payload = self.root / 'payload'
        payload.mkdir()
        (payload / 'manifest.json').write_bytes(b'synthetic-sensitive-runtime')
        keys = self.root / 'keys'
        keys.mkdir()
        (keys / 'recipient.asc').write_bytes(b'synthetic-public-only')
        output = self.root / 'controller.tar.gpg'
        info = ('pub:::::::::\nfpr:::::::::' + 'A' * 40 + ':\n').encode()
        with patch.object(b.dr, 'run', return_value=info), patch.object(b.subprocess, 'Popen') as popen:
            with self.assertRaises(b.dr.DRError):
                b.encrypt(payload, output, keys, 'B' * 40)
            popen.assert_not_called()
        process = Mock(stdin=io.BytesIO())
        process.wait.return_value = 2
        process.poll.return_value = 2
        with patch.object(b.dr, 'run', return_value=info), patch.object(b.subprocess, 'Popen', return_value=process):
            with self.assertRaises(b.dr.DRError):
                b.encrypt(payload, output, keys, 'A' * 40)

    def test_errors_do_not_echo_sensitive_diagnostics(self):
        output = io.StringIO()
        with contextlib.redirect_stderr(output):
            self.assertEqual(v.dr.cli_error(lambda: (_ for _ in ()).throw(ValueError(SECRET.decode()))), 1)
        self.assertNotIn(SECRET.decode(), output.getvalue())
        with patch.object(v.dr.sys, 'platform', 'darwin'):
            with self.assertRaises(v.dr.DRError):
                v.dr.host_guard()


if __name__ == '__main__':
    unittest.main(verbosity=2)
