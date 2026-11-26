#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 - "$ROOT_DIR/scripts/verify-config-backup-upload-limit.sh" <<'PY'
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import json
import os
import socket
import subprocess
import sys

script = sys.argv[1]
valid_body = {"statusCode": 400, "message": "X-Node-Uid header is required"}
cases = (
    ("backup handler rejects the unsigned probe", 400, "application/json; charset=utf-8", valid_body, 0),
    ("proxy rejects the body size", 413, "text/html", {}, 1),
    ("wrong origin serves a login page", 200, "text/html", {}, 1),
    ("route is missing", 404, "application/json", {}, 1),
    ("proxy errors", 502, "text/html", {}, 1),
    ("other handler responds with 400", 400, "application/json", {"statusCode": 400, "message": "other"}, 1),
    ("connection closes without a response", None, "", {}, 1),
)

class ProbeHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        size = int(self.headers["Content-Length"])
        body = self.rfile.read(size)
        self.server.observed = (self.path, self.headers["Content-Type"], len(body))
        status, mime, response = self.server.scenario
        if status is None:
            self.connection.shutdown(socket.SHUT_RDWR)
            return
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.end_headers()
        self.wfile.write(json.dumps(response).encode())

errors = []
with ThreadingHTTPServer(("127.0.0.1", 0), ProbeHandler) as server, TemporaryDirectory() as temp:
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        for name, status, mime, body, expected in cases:
            server.scenario = (status, mime, body)
            server.observed = None
            env = dict(os.environ, BASE_URL=f"http://127.0.0.1:{server.server_port}",
                       BACKUP_ROUTE="/api/v1/ingest/config-backup", PAYLOAD_SIZE_BYTES="102400",
                       TMPDIR=temp + "/")
            result = subprocess.run(["bash", script], env=env, capture_output=True, timeout=6)
            expected_request = ("/api/v1/ingest/config-backup", "application/xml", 102400)
            if result.returncode != expected or server.observed != expected_request or list(Path(temp).iterdir()):
                errors.append((name, result.returncode, expected, server.observed))
            else:
                print(f"{name}: exit {expected}, exact size and cleanup PASS")
    finally:
        server.shutdown()

if errors:
    for failure in errors:
        print(f"unexpected result: {failure}", file=sys.stderr)
    sys.exit(1)
PY
