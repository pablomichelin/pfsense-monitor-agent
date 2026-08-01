#!/usr/bin/env bash
# Read-only inspection on pfSense via SSH menu option 8 (Shell).
# Run from a host with TCP 22 access and authorized key (e.g. operator workstation).
set -euo pipefail
HOST="${PFSENSE_LAB_HOST:-192.168.100.254}"
USER="${PFSENSE_LAB_SSH_USER:-root}"

if ! command -v expect >/dev/null 2>&1; then
  echo "expect required" >&2
  exit 1
fi

expect <<EOF
set timeout 120
spawn ssh -t -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15 ${USER}@${HOST}
expect {
  -re "Enter an option:" { send "8\r" }
  timeout { puts "TIMEOUT waiting for pfSense menu"; exit 1 }
}
expect -re {[#\$] }
send "cat /etc/version\r"
expect -re {[#\$] }
send "uname -a\r"
expect -re {[#\$] }
send "grep -n \"function local_user\" /etc/inc/auth.inc\r"
expect -re {[#\$] }
send "grep -n \"function local_user_set\\|local_user_del\\|local_user_set_password\\|is_account_disabled\" /etc/inc/auth.inc\r"
expect -re {[#\$] }
send "grep -n \"page-all\\|WebCfg\" /etc/inc/priv*.inc 2>/dev/null | head -30\r"
expect -re {[#\$] }
send "ls -la /usr/local/libexec/monitor-pfsense-agent/ 2>/dev/null\r"
expect -re {[#\$] }
send "grep -n \"disabled\" /etc/inc/auth.inc | head -20\r"
expect -re {[#\$] }
send "exit\r"
expect eof
EOF
