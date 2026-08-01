# 148 — Entrega MVP: revogação de técnicos em lote (plano 144, Fases 1–2)

Data: `2026-07-31`

Status: **MVP entregue em código** — revogação/desativação em lote via inventário; flags **off** por default até piloto no lab.

Plano mestre: `docs/144-PLANO-GESTAO-CENTRALIZADA-USUARIOS-LOCAIS-PFSENSE-2026-07-31.md`  
Refinamento UX: `docs/146-REQUISITOS-REFINADOS-TECNICOS-REVOCACAO-LOTE-2026-07-31.md`  
Lab read-only: `docs/147-LAB-READONLY-PFSENSE-254-AUTH-LOCAL-USERS-2026-07-31.md`

## Versões

| Componente | Versão |
|------------|--------|
| API | `0.8.0` |
| Painel web | `1.6.0` |
| Package pfSense | `0.5.0` (`config/package-release.env`) |

## O que foi entregue

### Agente / package 0.5.0

- `collect_local_users.php` — inventário read-only (name, uid, disabled, is_admin via `page-all`/grupo `admins`)
- `manage_local_user.php` — ações **disable** e **delete** via `auth.inc` + `write_config`
- `monitor-pfsense-agent.sh` — dispatchers `local_user_disable`/`local_user_delete`, payload JSON **0600**, flag `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED` (default `0`)
- Heartbeat inclui campo `local_users` (modo normal)
- Empacotamento: `Makefile`, `pkg-plist`, `bootstrap/install.sh`

### API (Fase 1 + 2)

- Migration `20260731180000_technician_revoke_mvp`: coluna `nodes.local_users_snapshot_json`
- Módulo `technicians/`: CRUD mínimo, disable/delete por node, **`POST /api/v1/technician-accounts/batch-revoke`**
- Ingest: persiste snapshot `local_users` do heartbeat
- Guardrail última conta admin (`page-all` ativa) via snapshot
- Flags `TECHNICIAN_ACCOUNTS_*` default **false**; `minAgentVersion` = `0.5.0`

### Painel web

- `lib/technicians.ts` + `fleet-batch-technician-revoke-panel.tsx` embutido em `/nodes` (Ações em lote)
- Seleção múltipla habilitada quando há permissão de técnicos (não só upgrade de package)
- Poll de `JobBatch` (12s), tabela de outcome por firewall

## Comportamento em produção (default)

- **Nenhuma ação executada** até habilitar flags na API **e** no agente do pfSense piloto
- Frota em `0.4.x` continua operando; upgrade remoto para `0.5.0` necessário antes do piloto
- Snapshot de usuários só aparece após agente `0.5.0` com heartbeat normal

## Próximo passo operacional

1. Upgrade package **0.5.0** no lab `192.168.100.254` (node `systemupfw.system.up`)
2. Habilitar no piloto: `TECHNICIAN_ACCOUNTS_ENABLED=true`, `TECHNICIAN_ACCOUNT_DISABLE_ENABLED=true` (API) + `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED=1` (agente)
3. Cadastrar técnico de teste via `POST /api/v1/technicians`; validar disable/delete em 1 usuário não-admin
4. Validar revogação em lote no inventário com 1–2 firewalls
5. Homologação adicional em VM **CE 2.8.1** antes de rollout amplo (Plus 26.03.1 validado read-only no doc 147)

## Fora desta entrega (Fases 1b/3/4)

- `local_user_create` / `local_user_set_password` (provisionamento individual)
- `POST /technician-accounts/batch-provision`, rota `/admin/tecnicos`
- `POST /technicians/:id/revoke` global
- Smoke dedicado `scripts/smoke-technician-accounts.sh`
- Dry-run CLI `manage_local_user.php` no 254 (item §6.3 parcial do plano 144)

## Arquivos principais

- `apps/api/src/technicians/*`
- `apps/api/prisma/migrations/20260731180000_technician_revoke_mvp/`
- `apps/web/components/nodes/fleet-batch-technician-revoke-panel.tsx`
- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/{collect_local_users,manage_local_user}.php`

## Risco residual

- Escrita no pfSense **não homologada end-to-end** nesta sessão — depende de piloto no 254/CE 2.8.1
- Contas sem `TechnicianNodeAccount` usam `login_username` do técnico como `pfsense_username` no batch (compatível com senha compartilhada legada)
- Delete individual por node exige `confirm_hostname`; batch usa apenas `CONFIRMAR`
