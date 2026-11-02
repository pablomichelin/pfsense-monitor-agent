#!/usr/bin/env python3
"""External-to-controller encrypted recovery set. Operational commands: Linux/root only."""
import sys
sys.dont_write_bytecode = True

import argparse
import contextlib
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import uuid

spec = importlib.util.spec_from_file_location('controller_dr', Path(__file__).with_name('controller-dr-common.py'))
dr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dr)


def compose(repo, *args):
    return ['docker', 'compose', '--project-directory', str(repo), *args]


def db_command(repo, executable, *args):
    # Values are expanded only inside db; credentials never traverse argv on the host.
    return compose(repo, 'exec', '-T', 'db', 'sh', '-c',
                   'exec "$@" -U "$POSTGRES_USER" -d "$POSTGRES_DB"', 'dr', executable, *args)


class Snapshot:
    """Keep exporter alive while pg_dump imports the same read-only MVCC snapshot."""
    def __init__(self, repo):
        self.repo = repo
        self.process = None

    def __enter__(self):
        self.process = subprocess.Popen(db_command(self.repo, 'psql', '-X', '-qAt',
                                                  '-v', 'ON_ERROR_STOP=1'),
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL, text=True, bufsize=1)
        return self

    def query(self, sql):
        marker = 'DR_END_' + uuid.uuid4().hex
        self.process.stdin.write(sql + '\n\\echo ' + marker + '\n')
        self.process.stdin.flush()
        lines = []
        for line in self.process.stdout:
            if line.rstrip('\n') == marker:
                return lines
            lines.append(line.rstrip('\n'))
        raise dr.DRError('Snapshot SQL failed')

    def capture(self, target):
        lines = self.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
                           'SET LOCAL lock_timeout = \'3s\';\nSELECT pg_export_snapshot();')
        dr.require(len(lines) == 1 and re.fullmatch('[0-9A-Fa-f-]+', lines[0]), 'Invalid snapshot')
        refs = [json.loads(line) for line in self.query(dr.REF_SQL)]
        with target.open('xb') as dump:
            dr.run(db_command(self.repo, 'pg_dump', '--format=custom', '--compress=6',
                              '--no-owner', '--no-privileges', '--lock-wait-timeout=3s',
                              '--snapshot=' + lines[0]), output=dump)
        dr.require(target.stat().st_size > 0, 'Empty dump')
        self.query('ROLLBACK;')
        with target.open('rb') as dump:
            # pg_restore doesn't take DB credentials when checking the custom archive.
            result = subprocess.run(compose(self.repo, 'exec', '-T', 'db', 'pg_restore', '--list'),
                                    stdin=dump, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        dr.require(result.returncode == 0, 'Invalid PostgreSQL archive')
        return refs

    def __exit__(self, *_):
        if self.process:
            self.process.stdin.close()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
            self.process.stdout.close()


def pin_tree(storage, pins):
    """No chmod on hardlinks: never mutate permissions of production inodes."""
    dr.require(storage.is_dir() and not storage.is_symlink(), 'Storage missing')
    for base, dirs, files in os.walk(storage, followlinks=False):
        dr.require(not any((Path(base) / d).is_symlink() for d in dirs), 'Storage symlink')
        for name in files:
            if not name.endswith('.enc'):
                continue
            source = Path(base) / name
            target = dr.safe_path(pins, source.relative_to(storage).as_posix())
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            try:
                dr.regular(source)
                os.link(source, target, follow_symlinks=False)
                dr.regular(target)
            except FileNotFoundError:
                # Retention won this race; a missing DB reference later rejects the set.
                continue


def materialize_refs(refs, storage, prefix, pins, payload):
    seen = set()
    result = []
    for ref in refs:
        dr.require(ref['id'] not in seen, 'Duplicate reference')
        seen.add(ref['id'])
        relative = dr.ref_path(ref, prefix)
        pin = dr.safe_path(pins, relative)
        if not pin.exists():
            pin.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            source = dr.safe_path(storage, relative)
            dr.regular(source)
            os.link(source, pin, follow_symlinks=False)
        dr.regular(pin)
        target = dr.safe_path(payload / 'backups', relative)
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not target.exists():
            # Copy to private inode: no changes to source, and archive won't follow live writes.
            before = pin.stat()
            shutil.copyfile(pin, target)
            after = pin.stat()
            dr.require((before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                       (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
                       'Backup changed while copying')
        dr.require(target.stat().st_size == ref['size'] + 28, 'Encrypted payload size mismatch')
        result.append(dict(ref, member='backups/' + relative, encrypted_sha256=dr.digest(target)))
    return result


IMAGE_IDENTITY_VERSION = 'docker-inspect-execution-v1'


def image_fingerprint(image):
    """Execution identity only: no store/index ID, tags, descriptors or graph-driver state."""
    if not isinstance(image.get('Config'), dict) or not isinstance(image.get('RootFS'), dict):
        raise ValueError('Invalid image execution configuration')
    layers = image['RootFS'].get('Layers')
    if (not isinstance(layers, list) or not layers or
            not all(isinstance(x, str) and re.fullmatch(r'sha256:[0-9a-f]{64}', x) for x in layers) or
            image.get('Os') != 'linux' or not isinstance(image.get('Architecture'), str) or
            not image['Architecture']):
        raise ValueError('Invalid image execution platform or layers')
    # get() normalizes an absent Variant to null, matching the independently checked recipe.
    canonical = json.dumps({k: image.get(k) for k in ('Config', 'RootFS', 'Os', 'Architecture', 'Variant')},
                           sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


def image_role(image):
    command = image['Config'].get('Cmd') or []
    if not isinstance(command, list) or not all(isinstance(x, str) for x in command):
        raise ValueError('Invalid image command')
    candidates = []
    if re.search(r'\bdist/main\.js\b', ' '.join(command)):
        candidates.append('api')
    if re.search(r'\bserver\.js\b', ' '.join(command)):
        candidates.append('web')
    if command and command[0] == 'postgres' and 'PG_MAJOR=17' in (image['Config'].get('Env') or []):
        candidates.append('db')
    if command and command[0] == 'nginx':
        candidates.append('nginx')
    if len(candidates) != 1:
        raise ValueError('Ambiguous image execution role')
    return candidates[0]


def copy_recovery_assets(repo, payload, commit):
    """Self-contained source and exact published package; all bytes stay under private payload."""
    dr.require(re.fullmatch(r'[0-9a-f]{40}|[0-9a-f]{64}', commit), 'Invalid source commit')
    settings = {}
    for line in (payload / 'runtime/config/package-release.env').read_text().splitlines():
        match = re.fullmatch(r'''\s*(?:export\s+)?(PACKAGE_RELEASE_VERSION|PACKAGE_RELEASE_SHA256)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s#]+))\s*(?:#.*)?''', line)
        if match:
            key = match[1]
            dr.require(key not in settings, 'Duplicate package release setting')
            settings[key] = next(x for x in match.groups()[1:] if x is not None)
    version = settings.get('PACKAGE_RELEASE_VERSION', '')
    expected = settings.get('PACKAGE_RELEASE_SHA256', '').lower()
    dr.require(re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?', version) and
               re.fullmatch('[0-9a-f]{64}', expected), 'Invalid package release identity')
    filename = 'monitor-pfsense-package-v' + version + '.tar.gz'
    relative = 'dist/pfsense-package/' + filename
    artifact = dr.safe_path(repo, relative)
    sidecar = dr.safe_path(repo, relative + '.sha256')
    dr.regular(artifact)
    dr.regular(sidecar)
    asset_root = payload / 'runtime/recovery-assets'
    package_dir = asset_root / 'dist/pfsense-package'
    package_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    artifact_copy, sidecar_copy = package_dir / filename, package_dir / (filename + '.sha256')
    shutil.copyfile(artifact, artifact_copy)
    shutil.copyfile(sidecar, sidecar_copy)
    dr.require(dr.digest(artifact_copy) == expected, 'Published artifact checksum mismatch')
    lines = sidecar_copy.read_text().splitlines()
    dr.require(len(lines) == 1, 'Invalid published artifact sidecar')
    checksum = re.fullmatch(r'([0-9a-fA-F]{64}) [ *]([^\r\n]+)', lines[0])
    dr.require(checksum and checksum[1].lower() == expected and checksum[2] == filename,
               'Published artifact sidecar mismatch')
    bundle = asset_root / 'source.bundle'
    dr.run(['git', '-C', repo, 'bundle', 'create', bundle, '--all', 'HEAD'])
    dr.run(['git', '-C', repo, 'bundle', 'verify', bundle])
    heads = dr.run(['git', '-C', repo, 'bundle', 'list-heads', bundle]).decode().splitlines()
    dr.require(any(line.split()[0] == commit for line in heads if line.split()), 'Source bundle lacks captured HEAD')
    dr.require(dr.run(['git', '-C', repo, 'rev-parse', 'HEAD']).decode().strip() == commit,
               'Source HEAD changed during bundle capture')
    files = {path.relative_to(payload).as_posix(): dr.digest(path)
             for path in (bundle, artifact_copy, sidecar_copy)}
    assets = {'source_bundle': {'member': bundle.relative_to(payload).as_posix(),
                                'sha256': files[bundle.relative_to(payload).as_posix()], 'commit': commit},
              'package': {'member': artifact_copy.relative_to(payload).as_posix(), 'version': version,
                          'sha256': expected, 'sidecar_member': sidecar_copy.relative_to(payload).as_posix()}}
    return assets, files


def copy_runtime(repo, payload, key_files):
    required = ['.env.api', '.env.web', '.env.db', 'compose.yaml', 'config/package-release.env',
                'infra/nginx/default.conf']
    optional = ['.env', 'compose.override.yaml', 'compose.override.yml']
    files = {}
    for name in required + [x for x in optional if (repo / x).exists()]:
        source = dr.safe_path(repo, name)
        dr.regular(source)
        target = dr.safe_path(payload / 'runtime', name)
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        shutil.copyfile(source, target)
        files['runtime/' + name] = dr.digest(target)
    extras = []
    for index, name in enumerate(key_files):
        source = Path(name)
        dr.require(source.is_absolute(), 'Extra keys require absolute paths')
        dr.regular(source)
        member = 'runtime/extra-keys/' + str(index)
        target = dr.safe_path(payload, member)
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        shutil.copyfile(source, target)
        files[member] = dr.digest(target)
        extras.append({'restore_path': str(source), 'member': member})
    # Release context is encrypted, never exposed as plaintext sidecar.
    image_ids = dr.run(compose(repo, 'images', '-q')).decode().splitlines()
    dr.require(len(image_ids) == 4 and len(set(image_ids)) == 4, 'Expected four release images')
    image_specs = []
    for source_id in image_ids:
        dr.require(re.fullmatch(r'(?:sha256:)?[0-9a-f]{64}', source_id), 'Expected full source image ID')
        image = json.loads(dr.run(['docker', 'image', 'inspect', source_id]))[0]
        full_id = source_id if source_id.startswith('sha256:') else 'sha256:' + source_id
        dr.require(image['Id'] == full_id, 'Source image ID mismatch')
        image_specs.append({'source_id': full_id, 'role': image_role(image),
                            'fingerprint': image_fingerprint(image)})
    dr.require({s['role'] for s in image_specs} == {'api', 'web', 'db', 'nginx'}, 'Missing release image role')
    commit = dr.run(['git', '-C', repo, 'rev-parse', 'HEAD']).decode().strip()
    assets, asset_files = copy_recovery_assets(repo, payload, commit)
    files.update(asset_files)
    release = {'git_commit': commit, 'recovery_assets': assets,
               'image_ids': image_ids, 'image_identity': IMAGE_IDENTITY_VERSION, 'image_specs': image_specs,
               'extra_keys': extras}
    dr.write_json(payload / 'runtime/release.json', release)
    files['runtime/release.json'] = dr.digest(payload / 'runtime/release.json')
    return files


def encrypt(payload, output, keys, fingerprint):
    dr.require(re.fullmatch('[A-F0-9]{40}|[A-F0-9]{64}', fingerprint), 'Invalid recipient fingerprint')
    public = keys / 'recipient.asc'
    dr.regular(public)
    with tempfile.TemporaryDirectory(prefix='gpg-public-', dir=output.parent) as temp:
        home = dr.private_dir(temp)
        info = dr.run(['gpg', '--homedir', home, '--batch', '--with-colons',
                       '--import-options', 'show-only', '--import', public]).decode()
        primary = []
        want = False
        for line in info.splitlines():
            parts = line.split(':')
            if parts[0] == 'pub':
                want = True
            elif parts[0] == 'fpr' and want:
                primary.append(parts[9])
                want = False
        dr.require(primary == [fingerprint], 'Recipient public key mismatch')
        dr.run(['gpg', '--homedir', home, '--batch', '--import', public])
        process = subprocess.Popen(['gpg', '--homedir', str(home), '--batch', '--yes',
                                    '--trust-model', 'always', '--compress-algo', 'none',
                                    '--recipient', fingerprint, '--output', str(output), '--encrypt'],
                                   stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL)
        try:
            with tarfile.open(fileobj=process.stdin, mode='w|') as archive:
                for path in sorted(payload.rglob('*')):
                    if path.is_file():
                        dr.regular(path)
                        archive.add(path, arcname=path.relative_to(payload).as_posix(), recursive=False)
            process.stdin.close()
            dr.require(process.wait() == 0, 'GPG encryption failed')
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()


def transmit(archive, identifier):
    header = {'format': 1, 'created_utc': identifier[3:19],
              'bytes': archive.stat().st_size, 'sha256': dr.digest(archive)}
    # Fixed host/path: cannot redirect credentials or ciphertext through CLI configuration.
    process = subprocess.Popen(['ssh', '-oBatchMode=yes', '-oStrictHostKeyChecking=yes',
                                '-oConnectTimeout=15', 'root@192.168.100.220',
                                'python3 /opt/monitor-pfsense-dr/scripts/backup-controller-dr.py receive ' + identifier],
                               stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        process.stdin.write((json.dumps(header) + '\n').encode())
        with archive.open('rb') as source:
            shutil.copyfileobj(source, process.stdin, length=1024 * 1024)
        process.stdin.close()
        dr.require(process.wait() == 0, 'Remote DR publication failed')
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()


def backup(args):
    dr.host_guard()
    repo, storage = Path(args.repo), Path(args.storage)
    dr.require(repo.is_absolute() and storage.is_absolute(), 'Absolute paths required')
    keys = Path(args.keys)
    fingerprint = args.recipient or (keys / 'recipient.fingerprint').read_text().strip().upper()
    identifier = 'dr-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:16]
    work = dr.private_dir(dr.STATE / 'work')
    with dr.locked(dr.STATE / 'backup.lock'), tempfile.TemporaryDirectory(prefix='backup-', dir=work) as temp:
        payload = dr.private_dir(Path(temp) / 'payload')
        # Must share filesystem with storage for hardlink protection against retention.
        with tempfile.TemporaryDirectory(prefix='.controller-dr-pins-', dir=storage.parent) as pin_dir:
            pins = dr.private_dir(pin_dir)
            pin_tree(storage, pins)
            runtime = copy_runtime(repo, payload, args.key_file)
            with Snapshot(repo) as snapshot:
                refs = snapshot.capture(payload / 'postgres.dump')
            refs = materialize_refs(refs, storage, args.db_storage_prefix, pins, payload)
            # Reject concurrent key/env/release rotation; never pair the DB with changed keys.
            for member, checksum in runtime.items():
                if member == 'runtime/release.json' or member.startswith(('runtime/extra-keys/', 'runtime/recovery-assets/')):
                    continue
                dr.require(dr.digest(dr.safe_path(repo, member[len('runtime/'):])) == checksum,
                           'Runtime configuration changed during backup')
            for index, name in enumerate(args.key_file):
                dr.require(dr.digest(Path(name)) == runtime['runtime/extra-keys/' + str(index)],
                           'Additional key changed during backup')
            # Verify coverage again after copying: manifest is exactly the exported DB view.
            dr.require(len(refs) == len({ref['id'] for ref in refs}), 'Reference coverage mismatch')
            dr.write_json(payload / 'manifest.json', {'format': 1, 'storage_prefix': args.db_storage_prefix,
                          'refs': refs, 'files': dict(runtime, **{'postgres.dump': dr.digest(payload / 'postgres.dump')})})
        output = Path(temp) / 'controller.tar.gpg'
        encrypt(payload, output, keys, fingerprint)
        transmit(output, identifier)
    print('DR encrypted set published: ' + identifier)


def prune(destination):
    return dr.prune_verified(destination)


def receive_stream(identifier, stream, destination=dr.DEST):
    dr.validate_id(identifier)
    destination = dr.private_dir(destination)
    with dr.locked(destination / '.lock'):
        dr.require(not (destination / identifier).exists(), 'DR identifier already exists')
        header = stream.readline(4097)
        dr.require(len(header) <= 4096 and header.endswith(b'\n'), 'Invalid DR transport header')
        meta = json.loads(header)
        dr.require(set(meta) == {'format', 'created_utc', 'bytes', 'sha256'}, 'Invalid DR header')
        dr.require(meta['format'] == 1 and type(meta['bytes']) is int and 0 < meta['bytes'] <= 1024**4,
                   'Invalid DR transport size')
        dr.require(meta['created_utc'] == identifier[3:19], 'DR transport timestamp mismatch')
        with tempfile.TemporaryDirectory(prefix='.incoming-', dir=destination) as temp:
            incoming = Path(temp)
            remaining = meta['bytes']
            with (incoming / 'controller.tar.gpg').open('xb') as output:
                while remaining:
                    block = stream.read(min(1024 * 1024, remaining))
                    dr.require(block, 'Truncated DR transport')
                    output.write(block)
                    remaining -= len(block)
            dr.require(not stream.read(1), 'Unexpected trailing transport bytes')
            dr.write_json(incoming / 'metadata.json', meta)
            (incoming / 'controller.tar.gpg.sha256').write_text(meta['sha256'] + '  controller.tar.gpg\n')
            dr.validate_set(incoming)
            dr.sync_tree(incoming)
            os.rename(incoming, destination / identifier)
            dr.sync_dir(destination)
        # Transport integrity alone does not authorize retention. The verifier
        # performs isolated restore and then prunes under this same lock.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    b = sub.add_parser('backup', help='221 only: pin, snapshot, encrypt, send')
    b.add_argument('--repo', default=str(dr.REPO))
    b.add_argument('--storage', default='/Dados/Monitor-Pfsense/data/pfsense-config-backups')
    b.add_argument('--db-storage-prefix', default='/app/data/pfsense-config-backups')
    b.add_argument('--keys', default='/etc/monitor-pfsense-dr')
    b.add_argument('--recipient', help='Expected primary fingerprint; defaults to recipient.fingerprint')
    b.add_argument('--key-file', action='append', default=[], help='Additional absolute key path, repeatable')
    r = sub.add_parser('receive', help='220 only: framed ciphertext on stdin')
    r.add_argument('identifier')
    args = parser.parse_args()
    if args.command == 'backup':
        backup(args)
    else:
        dr.host_guard()
        receive_stream(args.identifier, sys.stdin.buffer)
        verifier_spec = importlib.util.spec_from_file_location(
            'controller_dr_verify', Path(__file__).with_name('verify-controller-dr.py'))
        verifier = importlib.util.module_from_spec(verifier_spec)
        verifier_spec.loader.exec_module(verifier)
        verifier.verify(args.identifier, str(dr.KEYS))
        print('DR encrypted set received and restoration verified')


if __name__ == '__main__':
    sys.exit(dr.cli_error(main))
