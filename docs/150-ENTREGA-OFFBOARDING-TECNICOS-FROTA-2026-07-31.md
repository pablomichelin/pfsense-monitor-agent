# Entrega — Offboarding de técnicos pela frota (2026-07-31)

## Versões finais

| Componente | Versão |
|------------|--------|
| API | `0.8.3` |
| Painel | `1.7.0` |
| Package pfSense | `0.5.1` (sem mudança) |

## Objetivo

Permitir desligamento operacional de ex-funcionário **sem API manual**: cadastro do técnico no painel e revogação em **toda a frota** com um clique.

## O que foi entregue

### API `0.8.3`

- `POST /api/v1/technicians/:id/revoke-fleet` — varre todos os nodes no escopo RBAC do operador, enfileira disable/delete onde o username existe no snapshot; divide em lotes de até `TECHNICIAN_ACCOUNT_BATCH_MAX_SIZE` (default **100**).
- `createTechnician` retorna **409** amigável se `login_username` já cadastrado.
- Refatoração interna: `planBatchRevoke` + `enqueueBatchRevoke` reutilizados por batch e fleet.

### Painel `1.7.0`

- Seção **Desligamento de técnico** em `/nodes` → Ações em lote:
  - Formulário **Cadastrar técnico** (nome + login pfSense).
  - Botão **Revogar em toda a frota** (não depende de seleção na tabela).
  - Polling de múltiplos lotes quando a frota excede o limite de batch.
- Painel visível mesmo sem firewalls no filtro atual (só precisa permissão `technicians.manage`).

### Config

- `.env.api`: `TECHNICIAN_ACCOUNT_BATCH_MAX_SIZE=100`
- Flags piloto já habilitadas neste host: `TECHNICIAN_ACCOUNTS_ENABLED`, `DISABLE`, `DELETE`.

## Fluxo operacional (offboarding)

1. Acesse **Inventário** (`/nodes`).
2. Em **Desligamento de técnico**, cadastre o ex-funcionário com o **mesmo login** do pfSense.
3. Escolha **Desativar** (reversível) ou **Remover** (destrutivo).
4. Clique **Revogar em toda a frota** → digite `CONFIRMAR`.
5. Aguarde conclusão na tabela de resultados (~30–60 s por ciclo de heartbeat).

## Pré-requisitos na frota

- Package agente **0.5.1+** instalado.
- `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED=1` no pfSense.
- Heartbeat recente e snapshot de usuários locais no controlador.

## Fora de escopo (próximas fases)

- Provisionamento remoto (`local_user_create`) — Fase 1b.
- Página dedicada `/admin/tecnicos`.
