#!/bin/sh
# Sourced by rc.d. Never trust a PID alone or unlink a live daemon's pidfile.
monitor_agent_migrate_pid() {
    migration_file=/var/run/monitor_pfsense_agent.pid
    migration_loop=/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh
    [ -f "$migration_file" ] || return 0
    migration_pid=$(cat "$migration_file")
    case "$migration_pid" in ''|*[!0-9]*) echo 'Invalid agent pidfile; refusing migration' >&2; return 1;; esac
    [ "$migration_pid" -gt 1 ] || return 1
    migration_owners=$(/usr/bin/fstat "$migration_file" 2>/dev/null | awk 'NR>1 {print $3}' | sort -u)
    if [ -z "$migration_owners" ]; then
        # A stale pidfile is handled by daemon itself, unless its PID was reused.
        kill -0 "$migration_pid" 2>/dev/null && return 1
        return 0
    fi
    case "$migration_owners" in *[!0-9]*) echo 'Ambiguous agent pidfile ownership' >&2; return 1;; esac
    migration_owner=$migration_owners
    migration_args=$(/bin/ps -p "$migration_owner" -o args=)
    case "$migration_args" in
        "daemon: ${migration_loop}["*'] (daemon)') ;;
        *) echo 'Agent pidfile owner identity mismatch' >&2; return 1;;
    esac
    [ "$migration_pid" != "$migration_owner" ] || return 0
    [ "$migration_args" = "daemon: ${migration_loop}[${migration_pid}] (daemon)" ] || return 1
    if kill -0 "$migration_pid" 2>/dev/null; then
        migration_parent=$(/bin/ps -p "$migration_pid" -o ppid= | tr -d ' ')
        migration_child=$(/bin/ps -p "$migration_pid" -o args=)
        [ "$migration_parent" = "$migration_owner" ] || return 1
        [ "$migration_child" = "/bin/sh $migration_loop" ] || return 1
    fi
    echo 'Migrating legacy agent supervisor PID'
    kill -TERM "$migration_owner" || return 1
    migration_wait=0
    while kill -0 "$migration_owner" 2>/dev/null && [ "$migration_wait" -lt 10 ]; do
        sleep 1
        migration_wait=$((migration_wait + 1))
    done
    if kill -0 "$migration_owner" 2>/dev/null; then
        # Old daemon can wait forever for inherited output pipes. Escalate only
        # after its child has exited, and ownership + identity still match.
        kill -0 "$migration_pid" 2>/dev/null && return 1
        [ "$(/bin/ps -p "$migration_owner" -o args=)" = "$migration_args" ] || return 1
        /usr/bin/fstat "$migration_file" 2>/dev/null | awk -v pid="$migration_owner" 'NR>1 && $3==pid {found=1} END {exit !found}' || return 1
        kill -KILL "$migration_owner" || return 1
        sleep 1
    fi
    kill -0 "$migration_owner" 2>/dev/null && return 1
    kill -0 "$migration_pid" 2>/dev/null && return 1
    # Preserve inode; daemon will safely acquire/rewrite the unlocked pidfile.
    return 0
}
