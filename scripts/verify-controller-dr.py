#!/usr/bin/env python3
"""220 only: restore into disposable PG17; verify every referenced AES-GCM payload in memory."""
import sys
sys.dont_write_bytecode = True

import argparse
import base64
import contextlib
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
import time
import uuid

spec = importlib.util.spec_from_file_location('controller_dr', Path(__file__).with_name('controller-dr-common.py'))
dr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dr)


def decrypt_extract(archive, target, home):
    """Stream decrypted tar, accept regular files only, never extract links or plaintext XML."""
    process = subprocess.Popen(['gpg', '--homedir', str(home), '--batch', '--no-tty',
                                '--pinentry-mode', 'error', '--decrypt', str(archive)],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    names = set()
    total = 0
    try:
        with tarfile.open(fileobj=process.stdout, mode='r|') as source:
            for member in source:
                name = member.name
                dr.require(member.isfile() and name not in names, 'Unsafe DR archive member')
                dr.require(name in {'postgres.dump', 'manifest.json'} or
                           name.startswith('runtime/') or (name.startswith('backups/') and name.endswith('.enc')),
                           'Unexpected DR archive member')
                path = dr.safe_path(target, name)
                total += member.size
                dr.require(0 <= member.size <= 128 * 1024**3 and total <= 512 * 1024**3,
                           'DR extraction size limit')
                path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with source.extractfile(member) as content, path.open('xb') as output:
                    shutil.copyfileobj(content, output, length=1024 * 1024)
                dr.require(path.stat().st_size == member.size, 'Truncated DR archive member')
                names.add(name)
        # Drain: verify GPG integrity/EOF even if tar reaches its own end first.
        for _ in iter(lambda: process.stdout.read(1024 * 1024), b''):
            pass
        dr.require(process.wait() == 0, 'GPG decryption or integrity failed')
    except tarfile.TarError:
        raise dr.DRError('Invalid encrypted archive') from None
    finally:
        process.stdout.close()
        if process.poll() is None:
            process.kill()
            process.wait()
    return names


def validate_manifest(payload, names):
    manifest = json.loads((payload / 'manifest.json').read_text())
    dr.require(set(manifest) == {'format', 'storage_prefix', 'refs', 'files'} and manifest['format'] == 1,
               'Unsupported DR manifest')
    files = manifest['files']
    required = {'postgres.dump', 'runtime/.env.api', 'runtime/.env.web', 'runtime/.env.db',
                'runtime/compose.yaml', 'runtime/config/package-release.env',
                'runtime/infra/nginx/default.conf', 'runtime/release.json'}
    dr.require(required <= files.keys(), 'Missing runtime configuration')
    expected = {'manifest.json'} | set(files)
    for name, checksum in files.items():
        dr.require(name == 'postgres.dump' or name.startswith('runtime/'), 'Invalid runtime member')
        dr.require(dr.digest(dr.safe_path(payload, name)) == checksum, 'Runtime checksum mismatch')
    ids = set()
    for ref in manifest['refs']:
        relative = dr.ref_path(ref, manifest['storage_prefix'])
        dr.require(ref['id'] not in ids and ref['member'] == 'backups/' + relative,
                   'Invalid reference manifest')
        ids.add(ref['id'])
        path = dr.safe_path(payload, ref['member'])
        dr.require(dr.digest(path) == ref['encrypted_sha256'], 'Encrypted backup checksum mismatch')
        dr.require(path.stat().st_size == ref['size'] + 28, 'Encrypted payload size mismatch')
        expected.add(ref['member'])
    dr.require(names == expected, 'DR archive coverage mismatch')
    return manifest


def load_aes_keys(env_file):
    """Only these two literal base64 values are needed; never execute/source a dotenv file."""
    wanted = {'BACKUP_ENCRYPTION_KEY_BASE64', 'NODE_SECRET_ENCRYPTION_KEY_BASE64'}
    values = {}
    for line in env_file.read_text().splitlines():
        match = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*?)\s*$', line)
        if not match or match[1] not in wanted:
            continue
        key, value = match.groups()
        dr.require(key not in values, 'Duplicate AES key setting')
        match_value = re.fullmatch(r'''(?:"([A-Za-z0-9+/=]+)"|'([A-Za-z0-9+/=]+)'|([A-Za-z0-9+/=]+))\s*(?:#.*)?''', value)
        dr.require(match_value is not None, 'Unsupported AES key setting')
        encoded = next(x for x in match_value.groups() if x is not None)
        decoded = base64.b64decode(encoded, validate=True)
        dr.require(len(decoded) == 32, 'Invalid AES key length')
        values[key] = decoded
    dr.require(set(values) == wanted, 'Missing AES keys')
    return values


def validate_xmls(payload, refs, key):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    aes = AESGCM(key)
    for ref in refs:
        encrypted = dr.safe_path(payload, ref['member']).read_bytes()
        dr.require(len(encrypted) == ref['size'] + 28, 'Invalid encrypted XML size')
        try:
            xml = aes.decrypt(encrypted[:12], encrypted[12:], None)
        except Exception:
            raise dr.DRError('XML authentication failed') from None
        dr.require(len(xml) == ref['size'] and hashlib.sha256(xml).hexdigest() == ref['sha256'],
                   'XML hash mismatch')
        # XML exists only in this process's memory, never in a file/stdout.
        del xml


def validate_secrets(records, key):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    aes = AESGCM(key)
    count = 0
    for record in records:
        try:
            parts = record['encrypted'].split('.')
            dr.require(len(parts) == 3, 'Invalid nodeSecret envelope')
            iv, tag, ciphertext = [base64.b64decode(x, validate=True) for x in parts]
            dr.require(len(iv) == 12 and len(tag) == 16, 'Invalid nodeSecret envelope')
            secret = aes.decrypt(iv, ciphertext + tag, None)
            dr.require(secret and hashlib.sha256(secret).hexdigest() == record['hash'],
                       'nodeSecret hash mismatch')
            secret.decode('utf-8', errors='strict')
            del secret
        except Exception:
            raise dr.DRError('nodeSecret validation failed') from None
        count += 1
    return count


class Restore:
    def __init__(self):
        self.name = 'monitor-pfsense-dr-' + uuid.uuid4().hex

    def __enter__(self):
        try:
            dr.run(['docker', 'run', '--pull=never', '-d', '--name', self.name,
                    '--network', 'none', '--cpus', '1', '--memory', '1g', '--memory-swap', '1g',
                    '--pids-limit', '128', '--log-driver', 'none', '--security-opt', 'no-new-privileges',
                    '-e', 'POSTGRES_DB=dr_verify', '-e', 'POSTGRES_USER=dr_verify',
                    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17'])
            for _ in range(60):
                result = subprocess.run(['docker', 'exec', self.name, 'pg_isready', '-U', 'dr_verify', '-d', 'dr_verify'],
                                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if result.returncode == 0:
                    return self
                time.sleep(1)
            raise dr.DRError('Disposable PostgreSQL not ready')
        except BaseException:
            self.cleanup()
            raise

    def cleanup(self):
        # -v deletes the anonymous PGDATA volume; no production name/path is accepted.
        dr.run(['docker', 'rm', '-f', '-v', self.name])

    def __exit__(self, *_):
        self.cleanup()

    def restore(self, dump):
        with dump.open('rb') as source:
            result = subprocess.run(['docker', 'exec', '-i', self.name, 'pg_restore', '--exit-on-error',
                                     '--no-owner', '--no-privileges', '-U', 'dr_verify', '-d', 'dr_verify'],
                                    stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        dr.require(result.returncode == 0, 'Disposable restore failed')

    def query(self, sql):
        data = dr.run(['docker', 'exec', '-i', self.name, 'psql', '-X', '-qAt',
                       '-v', 'ON_ERROR_STOP=1', '-U', 'dr_verify', '-d', 'dr_verify'], data=sql.encode())
        return data.decode().splitlines()


def compare_refs(manifest_refs, restored_refs):
    def normalized(refs):
        return sorted([{k: r[k] for k in ('id', 'storage_path', 'sha256', 'size', 'version')} for r in refs],
                      key=lambda r: r['id'])
    dr.require(normalized(manifest_refs) == normalized(restored_refs), 'Dump/manifest references mismatch')


def verify(identifier, home):
    dr.host_guard()
    # Fail before decryption if the chosen host lacks the crypto dependency or cached PG17.
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # noqa: F401
    dr.run(['docker', 'image', 'inspect', 'postgres:17'])
    home = Path(home)
    dr.require(home == dr.KEYS and home.is_dir() and not home.is_symlink(), 'Invalid private GPG home')
    work = dr.private_dir(dr.STATE / 'verify-work')
    with dr.locked(dr.DEST / '.lock'):
        if identifier == 'latest':
            choices = sorted(p.name for p in dr.DEST.iterdir() if dr.ID_PATTERN.fullmatch(p.name))
            dr.require(choices, 'No published DR set')
            identifier = choices[-1]
        directory = dr.DEST / dr.validate_id(identifier)
        dr.validate_set(directory)
        with tempfile.TemporaryDirectory(prefix='verify-', dir=work) as temp:
            payload = dr.private_dir(temp)
            names = decrypt_extract(directory / 'controller.tar.gpg', payload, home)
            manifest = validate_manifest(payload, names)
            keys = load_aes_keys(payload / 'runtime/.env.api')
            with Restore() as database:
                database.restore(payload / 'postgres.dump')
                # Restored database, not pre-dump guesses, is the coverage authority.
                refs = [json.loads(x) for x in database.query(dr.REF_SQL)]
                compare_refs(manifest['refs'], refs)
                validate_xmls(payload, manifest['refs'], keys['BACKUP_ENCRYPTION_KEY_BASE64'])
                secrets = (json.loads(x) for x in database.query(dr.SECRET_SQL))
                validate_secrets(secrets, keys['NODE_SECRET_ENCRYPTION_KEY_BASE64'])
                # Structural floor; restore itself checks every table/constraint in the dump.
                for table in ('clients', 'sites', 'nodes', 'node_credentials', 'node_config_backups',
                              'users', 'audit_logs', '_prisma_migrations'):
                    dr.require(database.query("SELECT to_regclass('public." + table + "') IS NOT NULL;") == ['t'],
                               'Required restored table missing')
    print('DR restore verification OK (all referenced backups and nodeSecrets)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('identifier', nargs='?', default='latest', help='Published DR id or latest')
    parser.add_argument('--gnupg-home', default=os.environ.get('GNUPGHOME', str(dr.KEYS)))
    args = parser.parse_args()
    verify(args.identifier, args.gnupg_home)


if __name__ == '__main__':
    sys.exit(dr.cli_error(main))
