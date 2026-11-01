# Durable command delivery (candidate protocol 0.5.26)

The persisted node agent version gates this protocol at **>= 0.5.26**. Version
0.5.25, unknown and older versions retain legacy behavior: scrub passwords at
`picked_up`, never redeliver password commands after pickup, and reject terminal
ACKs. The backend does not change any package version or distribution target.

## Delivery and ACK contract

Heartbeat commands on the new protocol include `status` and `delivery_state`:

| Persisted status | delivery_state | Heartbeat delivery |
| --- | --- | --- |
| pending | awaiting_pickup | Yes, when eligible |
| picked_up | ready | Yes, including the original password |
| running | execution_committed | Never |
| succeeded / failed / cancelled / expired | terminal | Never |

New heartbeat commands and ACK/result responses include `delivery_attempt`, the
persisted `NodeCommand.retryCount` (initial **0**, then **1**, **2**, ...). This
adds no schema. New ACK/result requests MUST supply that integer at the top
level; DTOs keep it optional only for legacy compatibility. New ACK responses
also add `terminal`, `delivery_state`, `execute` and `recovery_required`.
Existing `ok`, `command_id` and `status` remain.

The journal identifies an execution by `(command_id, delivery_attempt)`. A higher
attempt may reopen a completed entry ONLY for `config_backup_now` or
`table_search`. The same or an older attempt cannot reopen it, and sensitive
actions cannot replay. Attempt IDs do not authorize expired/cancelled commands.
Missing/invalid new request attempts return 400; a non-current attempt returns
409 before CAS, audit or password removal. CAS predicates also bind retryCount,
and a losing CAS rechecks the current attempt before returning a response.

## Manual backup upload fence

New manual uploads require `X-Command-Delivery-Attempt` with the current integer.
This is distinct from `X-Backup-Id`, the upload UUID, which stays stable across
transport retries of the same upload. Scheduled uploads without a command ID
do not use a command attempt. The persisted agent version gates this behavior;
legacy uploads do not require the new header.

The new upload transaction locks node then command, verifies attempt and state,
then keeps that lock through ciphertext creation, backup metadata, command
success, credential/policy writes and audit. Failed/cancelled/expired commands
are rejected before writing a file. A retry worker cannot advance the attempt
through this transaction. Backup metadata records `delivery_attempt`; automatic
success reconciliation requires metadata from the current attempt too.

New stored file paths and backup IDs have a fresh nonce, so cleanup cannot
overwrite/delete an earlier backup at a colliding second/hash path. A failed
callback removes only its own unreferenced ciphertext after rollback. After a
prepared callback, an uncertain COMMIT retains ciphertext; a persisted record
with the same node/command/attempt/upload UUID/hash proves success and preserves
the response if the COMMIT reply was lost. If the database cannot determine the
outcome, ciphertext is retained for recovery. Upload retries on succeeded with
the same attempt return the same stored backup ID without another encryption.

Retention and drift run after commit. Their failure, or immediate follow-up
dispatch failure, does not change a committed ingest response into an error.

## Execution boundary

- Persist the payload locally before acknowledging `picked_up`.
- `picked_up` returns `execute=false`; execution requires a `running` ACK.
- Only the first conditional transition into `running` returns `execute=true`.
  It removes the backend password in the same transaction.
- Repeated ACKs return persisted status without extra transition or audit.
  Repeating `running`, or picking up an already running command, returns
  `execute=false`, `recovery_required=true`.
- A terminal ACK returns `execute=false`, `terminal=true`. An active row past its
  deadline also returns `execute=false`, `recovery_required=true`; the expiry
  worker owns the actual transition and its side effects.
- A lost running response is ambiguous. Reconcile the durable local journal or
  resend an already persisted result; never execute the sensitive action again.
  An unresolved result uses `result_json.execution_recovery_status=indeterminate`.
- Results, cancellations and expiry scrub retained passwords. Recovery cannot
  change a cancelled or expired winner. Existing explicit late-result/recorded
  backup reconciliation remains as before, separate from delivery recovery.

Automatic retries of writes after `runningAt` are blocked. A configured retry is
marked exhausted with `execution_recovery_status=indeterminate` and
`retry_blocked_reason=execution_intent_committed`, audited once transactionally.
Idempotent backup uploads and table reads remain eligible for configured retry.

## Backup follow-up outbox

A succeeded backup with `payload_json.follow_up_technician_provision` is the
durable pending intent. It is not removed by a post-commit callback claim.

The dispatcher locks the node, re-reads the backup, requires persisted succeeded,
and conditionally consumes that exact payload. It then verifies that the same
node/technician account still belongs to this backup, enqueues through the shared
transaction, links the account, records the child command ID and audits. All these
writes commit or roll back together. No separately committed `dispatching` state
or secret-free claim can lose the original work.

Committed ledger fields are `follow_up_state=enqueued`, `follow_up_command_id`
and `follow_up_enqueued_at`. An account superseded by a newer operation yields
`follow_up_state=superseded`, with the old intent scrubbed and no new command.
The parent row and payload CAS provide the unique dispatch key; terminal child
commands do not cause redispatch. No new schema or migration is needed.

The initial backup enqueue in `TechniciansService.createBatchProvision` also
shares a transaction with `technician_node_accounts.last_command_id`. The
heartbeat cannot see the backup before ownership is linked; rejection of either
write rolls back both. This closes the earliest-success upload race as well as
the post-success dispatcher crash window.

Startup and a 60-second interval reconcile only succeeded rows containing pending
intents, in pages of 200. The cursor advances past failures; completed historical
backups do not hide pending work. A failure retains the original intent for retry.
Immediate dispatch failure does not invalidate a committed backup upload.

## Verification

`apps/api/test/command-durable-recovery.test.mjs` compiles only this dependency
graph in memory and uses synthetic transactions/interleavings, without database
or firewall access. The initial 37 checks passed once. A subsequent expiry-only
check covers both create and password-reset commands. Four further directed
checks cover initial ownership visibility, ordinary enqueue rejection, account
write rollback and targeted technician source typing: **42 passed in separate
groups (37 + 1 + 4)**, with no repeat of the approved group. No previously approved
suite or global build was rerun. Real PostgreSQL/process-kill and pfSense
integration remain separate validation for the coordinator; these synthetic
checks do not establish appliance homologation.

The added attempt-fencing group has **16 passed**: 14 on its first run, then only
the two failing cases repeated after extending the synthetic JSON-path matcher
to support equality. Runtime source did not change for those fixture failures.
It includes targeted typing, legacy/new requests, stale CAS generations, upload
rollback/file ownership, lost COMMIT response and post-commit failures. The
previous 42 cases were not rerun. Source is frozen for the coordinator's build.

Two additional review regressions passed separately, without rerunning 16/42:
new filenames keep the terminal `.enc` extension (nonce goes BEFORE `.enc`), and
failure of the final command query inside the transaction is a known rollback,
even if the work routine already prepared a response. `callbackReturned` is set
only after that final query succeeds; only a returned callback permits treating
a subsequent failure as uncertain COMMIT. Synthetic count: **60 = 42 + 16 + 2**.

## Separate PG17 coordinator harness (not run locally)

File: `apps/api/test/command-durable-postgres.integration.mjs`. Mount this single
file under `/qa` in the final API image; it loads `/app/dist` and dependencies via
`createRequire('/app/package.json')`. It never starts Nest or lifecycle timers,
and does not compile, migrate, start containers or connect to firewalls.

The coordinator supplies the existing isolated QA network/database. The harness
requires explicit `COMMAND_RECOVERY_PG_URL`, host `db`, database `monitor_qa`, user
`qa`, PostgreSQL 17, server IPv4 `10.77.18.*`, and row `id=1` of
`public.command_recovery_qa_sentinel` whose `purpose` is exactly
`pfs-command-recovery-qa-only-20261101`. All guard queries are read-only and precede
fixture writes. It never falls back to `DATABASE_URL` or `.env`.

Inside the already isolated final-image runner:

```sh
COMMAND_RECOVERY_PG_URL=postgresql://qa@db:5432/monitor_qa node --test /qa/command-durable-postgres.integration.mjs
```

Eight critical real-database cases: concurrent running ACK CAS; stale ACK CAS;
stale result CAS; follow-up rollback; PostgreSQL worker-connection termination
and restart; concurrent follow-up/single terminal child; initial enqueue/account
visibility and rejection rollback; stale upload rejection before mutations.
Synthetic DB fixtures and the private temporary directory are cleaned in
`t.after`. Syntax was checked locally; actual PG results belong to the
coordinator's execution. HA/CARP is explicitly excluded from this delivery.

Coordinator's first PG17 run: **7 of 8 critical cases passed**. The disconnect
case observed server termination and rollback, then its final assertion reused
a dead pooled connection. Only the harness was corrected to disconnect/reconnect
that pool before fresh-service reconciliation. Select only that case with:

```sh
COMMAND_RECOVERY_PG_CASE=disconnect COMMAND_RECOVERY_PG_URL=postgresql://qa@db:5432/monitor_qa node --test /qa/command-durable-postgres.integration.mjs
```

The seven approved PG cases and 60 synthetic cases remain closed. No production
source changed for this harness correction; the coordinator owns the rerun.
