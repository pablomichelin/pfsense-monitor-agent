#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
php "$ROOT/scripts/test-usermanager-guard-getusergroups-ref.php"
