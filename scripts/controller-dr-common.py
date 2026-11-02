"""Private DR primitives. No subprocess diagnostics or customer data in console output."""
import sys
sys.dont_write_bytecode = True

import contextlib
import fcntl
import hashlib
import json
from datetime import datetime, timezone
import os
from pathlib import Path, PurePosixPath
import re
import signal
import shutil
import stat
import subprocess
import uuid

DEST = Path('/var/backups/monitor-pfsense-dr')
STATE = Path('/var/lib/monitor-pfsense-dr')
KEYS = STATE / 'keys'
REPO = Path('/Dados/Monitor-Pfsense')
ID_PATTERN = re.compile(r'dr-\d{8}T\d{6}Z-[0-9a-f]{16}')
FILES = {'controller.tar.gpg', 'controller.tar.gpg.sha256', 'metadata.json'}
VERIFIED_FILE = '.last-verified-recovery.json'
REF_SQL = """SELECT json_build_object('id',id,'storage_path',storage_path,
 'sha256',config_sha256,'size',size_bytes,'version',encryption_version)::text
 FROM public.node_config_backups
 WHERE storage_path IS NOT NULL OR status::text='stored' ORDER BY id;"""
SECRET_SQL = """SELECT json_build_object('encrypted',secret_encrypted,
 'hash',secret_hash)::text FROM public.node_credentials ORDER BY id;"""


class DRError(Exception):
    pass


def require(condition, message='DR validation failed'):
    if not condition:
        raise DRError(message)


def host_guard():
    require(sys.platform.startswith('linux') and os.geteuid() == 0,
            'DR operational commands require Linux root')
    os.umask(0o077)
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(DRError('DR interrupted')))


def private_dir(path):
    path = Path(path)
    # Reject symlinked ancestors too; never redirect DR writes to another service.
    for parent in reversed((path, *path.parents)):
        if parent.exists() or parent.is_symlink():
            require(not parent.is_symlink() and parent.is_dir(), 'Unsafe DR directory')
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(path.stat().st_uid == os.geteuid(), 'DR directory has wrong owner')
    path.chmod(0o700)
    return path


def regular(path):
    mode = Path(path).lstat().st_mode
    require(stat.S_ISREG(mode), 'Expected regular file')


def safe_path(root, relative):
    require(isinstance(relative, str), 'Invalid archive path')
    p = PurePosixPath(relative)
    require(not p.is_absolute() and p.parts and all(x not in ('.', '..') for x in p.parts),
            'Invalid archive path')
    require(str(p) == relative and '\\' not in relative, 'Invalid archive path')
    root = Path(root)
    result = root.joinpath(*p.parts)
    for item in (result, *result.parents):
        if item == root:
            break
        require(not item.is_symlink(), 'Symlink in DR path')
    return result


def digest(path):
    regular(path)
    h = hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write_json(path, data):
    with Path(path).open('x', encoding='utf-8') as target:
        json.dump(data, target, sort_keys=True, separators=(',', ':'))
        target.write('\n')


def run(args, *, data=None, output=None, cwd=None):
    try:
        result = subprocess.run([str(a) for a in args], input=data,
                                stdout=output if output is not None else subprocess.PIPE,
                                stderr=subprocess.DEVNULL, cwd=cwd, check=True)
        return result.stdout
    except (OSError, subprocess.CalledProcessError):
        raise DRError('DR subprocess failed (diagnostics suppressed)') from None


@contextlib.contextmanager
def locked(path):
    private_dir(Path(path).parent)
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise DRError('DR operation already running') from None
        yield


def sync_tree(root):
    for path in Path(root).rglob('*'):
        if path.is_file():
            with path.open('rb') as file:
                os.fsync(file.fileno())
    sync_dir(root)


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def validate_id(value):
    require(isinstance(value, str) and ID_PATTERN.fullmatch(value), 'Invalid DR identifier')
    return value


def validate_set(path, hash_content=True):
    path = Path(path)
    require(path.is_dir() and not path.is_symlink(), 'Invalid DR set')
    require({p.name for p in path.iterdir()} == FILES, 'Incomplete DR set')
    for name in FILES:
        regular(path / name)
    meta = json.loads((path / 'metadata.json').read_text())
    require(set(meta) == {'format', 'created_utc', 'bytes', 'sha256'}, 'Invalid DR metadata')
    require(meta['format'] == 1 and type(meta['bytes']) is int and meta['bytes'] > 0,
            'Invalid DR metadata')
    require(re.fullmatch(r'\d{8}T\d{6}Z', meta['created_utc']), 'Invalid DR timestamp')
    require(re.fullmatch('[0-9a-f]{64}', meta['sha256']), 'Invalid DR checksum')
    require((path / 'controller.tar.gpg').stat().st_size == meta['bytes'], 'DR size mismatch')
    require((path / 'controller.tar.gpg.sha256').read_text() ==
            meta['sha256'] + '  controller.tar.gpg\n', 'Invalid DR sidecar')
    if hash_content:
        require(digest(path / 'controller.tar.gpg') == meta['sha256'], 'DR checksum mismatch')
    return meta


def verified_recovery(destination):
    """Read the durable recovery proof, which lives outside the immutable set."""
    marker = Path(destination) / VERIFIED_FILE
    if not marker.exists() and not marker.is_symlink():
        return None
    regular(marker)
    record = json.loads(marker.read_text(encoding='utf-8'))
    require(isinstance(record, dict) and set(record) == {'format', 'id', 'sha256', 'verified_at'},
            'Invalid DR verification record')
    require(record['format'] == 1 and isinstance(record['id'], str), 'Invalid DR verification record')
    validate_id(record['id'])
    require(isinstance(record['sha256'], str) and re.fullmatch('[0-9a-f]{64}', record['sha256']),
            'Invalid DR verification record checksum')
    require(isinstance(record['verified_at'], str) and
            re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', record['verified_at']),
            'Invalid DR verification timestamp')
    return record


def mark_verified(destination, identifier):
    """Only call after GPG, isolated PostgreSQL restore and every AES-GCM check pass.

    Caller holds the destination lock through verification and this durable update.
    """
    destination = Path(destination)
    meta = validate_set(destination / validate_id(identifier))
    record = {'format': 1, 'id': identifier, 'sha256': meta['sha256'],
              'verified_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    marker = destination / VERIFIED_FILE
    temporary = destination / ('.verified-' + uuid.uuid4().hex + '.tmp')
    try:
        write_json(temporary, record)
        with temporary.open('rb') as source:
            os.fsync(source.fileno())
        os.replace(temporary, marker)
        sync_dir(destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def prune_verified(destination, keep_latest=7):
    """Fail closed: retain the last genuinely restored set even after many failures."""
    destination = Path(destination)
    verified = verified_recovery(destination)
    if verified is None:
        return 0
    anchor = destination / verified['id']
    require(anchor.is_dir() and not anchor.is_symlink(), 'Last verified DR set missing')
    require(validate_set(anchor)['sha256'] == verified['sha256'],
            'Last verified DR set changed')
    candidates = []
    for path in destination.iterdir():
        if ID_PATTERN.fullmatch(path.name) and path.is_dir() and not path.is_symlink():
            validate_set(path, hash_content=False)
            candidates.append(path)
    keep = {p.name for p in sorted(candidates)[-keep_latest:]}
    keep.add(verified['id'])
    to_remove = [p for p in candidates if p.name not in keep]
    for path in to_remove:
        shutil.rmtree(path)
    if to_remove:
        sync_dir(destination)
    return len(to_remove)


def ref_path(ref, storage_prefix):
    value = ref.get('storage_path')
    require(isinstance(value, str) and value.startswith(storage_prefix.rstrip('/') + '/'),
            'Snapshot reference outside configured storage')
    relative = value[len(storage_prefix.rstrip('/')) + 1:]
    safe_path(Path('/unused'), relative)
    require(relative.endswith('.enc'), 'Invalid snapshot reference')
    require(ref.get('version') == 'aes-256-gcm:v1', 'Unsupported backup encryption version')
    require(re.fullmatch('[0-9a-f]{64}', ref.get('sha256', '')), 'Invalid XML hash')
    require(type(ref.get('size')) is int and ref['size'] >= 0, 'Invalid XML size')
    return relative


def cli_error(main):
    try:
        main()
    except (DRError, OSError, ValueError, KeyError, TypeError):
        # Never stringify exceptions: GPG/SQL/path/environment errors may identify customers.
        print('DR FAILED; no sensitive diagnostics emitted', file=sys.stderr)
        return 1
    return 0
