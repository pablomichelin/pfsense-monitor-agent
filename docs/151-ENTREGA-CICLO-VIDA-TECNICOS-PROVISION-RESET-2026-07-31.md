# 151 — Entrega ciclo de vida completo técnicos pfSense (provision + reset + revoke)

Data: `2026-07-31`

Status: **entregue** — API `0.8.4`, painel `1.8.0`, package `0.5.2`

## Versões

| Componente | Versão |
|------------|--------|
| API | `0.8.4` |
| Painel web | `1.8.0` |
| Package pfSense | `0.5.2` |

## O que foi implementado

### API

| Método | Rota | Permissão |
|--------|------|-----------|
| `POST` | `/api/v1/technician-accounts/batch-provision` | `technicians.manage` |
| `POST` | `/api/v1/technician-accounts/batch-password-reset` | `technicians.password_reset.run` |
| `POST` | `/api/v1/nodes/:id/technician-accounts` | `technicians.manage` |
| `POST` | `/api/v1/nodes/:id/technician-accounts/:accountId/password-reset` | `technicians.password_reset.run` |
| `POST` | `/api/v1/technician-accounts/batch-revoke` | `technicians.manage` (já existia) |
| `POST` | `/api/v1/technicians/:id/revoke-fleet` | `technicians.manage` (já existia) |

- Senha **nunca** persiste em `audit_logs`; removida de `payload_json` após `picked_up` do agente.
- Resposta batch inclui `password_display_once` (uma exibição para o operador).
- `TechnicianNodeAccount` atualizado para `active`/`failed` ao concluir comando create/reset.

### Agente (package 0.5.2)

- `manage_local_user.php`: ações `create` e `set_password` (admin `page-all` via `privilege_profile: admin_full`).
- `monitor-pfsense-agent.sh`: dispatchers `local_user_create` e `local_user_set_password`.

### Painel web

- Seção **Gestão de técnicos pfSense** em `/nodes` → **Ações em lote** (`FleetTechnicianManagementPanel`).
- Cadastro + busca de técnicos; abas **Provisionar**, **Resetar senha**, **Revogar**.
- Seleção de firewalls na tabela do inventário; confirmação `CONFIRMAR` para revogação.

### Flags habilitadas neste host (`.env.api`)

```
TECHNICIAN_ACCOUNTS_ENABLED=true
TECHNICIAN_ACCOUNT_CREATE_ENABLED=true
TECHNICIAN_ACCOUNT_PASSWORD_RESET_ENABLED=true
TECHNICIAN_ACCOUNT_DISABLE_ENABLED=true
TECHNICIAN_ACCOUNT_DELETE_ENABLED=true
```

No pfSense: `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED=1`

## Guia operacional (3 fluxos)

### 1. Provisionar técnico novo

1. Acesse `/nodes` como `superadmin`.
2. Na seção **Gestão de técnicos**, cadastre o técnico (nome + login pfSense).
3. Marque os firewalls alvo na tabela (ou use o filtro atual).
4. Aba **Provisionar** → informe senha (ou deixe vazio para gerar automaticamente).
5. Clique **Provisionar em N firewall(s)**.
6. **Copie a senha exibida uma vez** — não será mostrada novamente.
7. Aguarde polling do lote até `succeeded` por firewall.

### 2. Reset de senha

1. `/nodes` → selecione firewalls onde o técnico já tem conta.
2. Aba **Resetar senha** → escolha o técnico → senha nova (ou auto-gerada).
3. Execute o lote e copie a senha exibida uma vez.

### 3. Revogar / offboarding

1. `/nodes` → selecione firewalls (ou **Revogar em toda a frota**).
2. Aba **Revogar** → técnico → desativar ou remover.
3. Digite `CONFIRMAR` e confirme.

## Pré-requisitos por firewall

- Agente **≥ 0.5.1** (recomendado **0.5.2** para create/reset).
- `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED=1`.
- Heartbeat recente e snapshot de usuários locais no heartbeat.

## Fora de escopo desta entrega

- Rota dedicada `/admin/tecnicos` (Fase 3 plano 144).
- Smoke dedicado `scripts/smoke-technician-accounts.sh`.
- Rollout package 0.5.2 em toda a frota (upgrade remoto pendente operacionalmente).

## Arquivos principais

- `apps/api/src/technicians/technicians.service.ts`
- `apps/api/src/technicians/technician-accounts-batch.controller.ts`
- `apps/api/src/node-commands/node-commands.service.ts` (scrub senha + reconcile conta)
- `apps/web/components/nodes/fleet-technician-management-panel.tsx`
- `packages/pfsense-package/files/.../manage_local_user.php`
