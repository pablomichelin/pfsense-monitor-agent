#!/usr/bin/env python3
"""Regressões do backup do controlador; Docker e dados são inteiramente sintéticos."""
import fcntl
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

SOURCE = Path(__file__).resolve().parent / "backup-postgres.sh"

with tempfile.TemporaryDirectory(prefix="monitor-backup-test-") as directory:
    root = Path(directory)
    (root / "scripts").mkdir()
    (root / "bin").mkdir()
    shutil.copy2(SOURCE, root / "scripts/backup-postgres.sh")
    docker = root / "bin/docker"
    docker.write_text('''#!/bin/bash
case "$*" in
  *pg_dump*) printf 'synthetic custom dump'; exit "${DUMP_EXIT:-0}" ;;
  *pg_restore*) cat >/dev/null; exit "${RESTORE_EXIT:-0}" ;;
esac
exit 0
''')
    docker.chmod(0o700)
    backup = root / "copies"
    env = dict(os.environ, PATH=f"{root / 'bin'}:{os.environ['PATH']}", POSTGRES_DB="synthetic", POSTGRES_USER="synthetic", TIMESTAMP="20261031-230000Z", KEEP_LATEST="2")

    def run(**overrides):
        return subprocess.run(["bash", str(root / "scripts/backup-postgres.sh"), str(backup)], env=dict(env, **overrides), capture_output=True, text=True)

    result = run()
    assert result.returncode == 0, result.stderr
    dump = backup / "postgres-synthetic-20261031-230000Z.dump"
    assert dump.read_text() == "synthetic custom dump"
    assert backup.stat().st_mode & 0o777 == 0o700
    assert dump.stat().st_mode & 0o777 == 0o600
    assert Path(str(dump) + ".sha256").stat().st_mode & 0o777 == 0o600
    assert run().returncode != 0, "Não sobrescrever backup publicado"
    for failure in ({"DUMP_EXIT": "1"}, {"RESTORE_EXIT": "1"}):
        result = run(TIMESTAMP="20261031-230001Z", **failure)
        assert result.returncode != 0
        assert not list(backup.glob("*.partial"))
        assert not (backup / "postgres-synthetic-20261031-230001Z.dump").exists()
        assert dump.exists(), "Falha não pode aplicar retenção"
    assert run(KEEP_LATEST="0").returncode != 0
    assert run(TIMESTAMP="../invalid").returncode != 0
    with (backup / ".backup.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        assert run(TIMESTAMP="20261031-230002Z").returncode != 0
    print("PASS: backup sintético, permissões, checksum, colisão, falhas, retenção e lock concorrente")
