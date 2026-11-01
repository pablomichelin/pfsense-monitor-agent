#!/usr/bin/env python3
"""Valida o vínculo do checksum sem iniciar Docker nem restaurar dados."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile

script = Path(__file__).resolve().parent / "verify-backup-restore.sh"
with tempfile.TemporaryDirectory(prefix="monitor-restore-test-") as directory:
    root = Path(directory)
    docker = root / "docker"
    marker = root / "started"
    docker.write_text('#!/bin/sh\nif [ "$1" = run ]; then touch "$START_MARKER"; exit 23; fi\nexit 0\n')
    docker.chmod(0o700)
    backup = root / "selected.dump"
    backup.write_bytes(b"synthetic selected dump")
    other = root / "other.dump"
    other.write_bytes(b"synthetic unrelated dump")
    sidecar = Path(str(backup) + ".sha256")
    env = dict(os.environ, PATH=f"{root}:{os.environ['PATH']}", START_MARKER=str(marker))
    def run():
        marker.unlink(missing_ok=True)
        return subprocess.run(["bash", str(script), str(backup)], env=env, capture_output=True, text=True)
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    sidecar.write_text(f"{digest(other)}  {other.name}\n")
    assert run().returncode == 1 and not marker.exists(), "Outro dump não pode validar o selecionado"
    sidecar.write_text(f"{digest(backup)}  {backup.name}\n")
    assert run().returncode == 23 and marker.exists(), "Checksum válido chega ao início do restore simulado"
    backup.write_bytes(b"altered selected dump")
    assert run().returncode == 1 and not marker.exists(), "Dump alterado deve ser recusado"
    sidecar.write_text(f"{digest(backup)}  {backup.name}\n{digest(other)}  {other.name}\n")
    assert run().returncode == 1 and not marker.exists(), "Sidecar com múltiplos alvos deve ser recusado"
    print("PASS: checksum vinculado ao arquivo selecionado; troca de alvo, alteração e múltiplas linhas recusadas")
