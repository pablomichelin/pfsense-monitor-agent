# 145 — Entrega Fase 0: fundação gestão centralizada de usuários locais pfSense

Data: `2026-07-31`

Status: **Fase 0 concluída** — fundação de dados, RBAC e registry de comandos. Sem UI, sem handler no agente, sem endpoints HTTP ainda.

Plano mestre: `docs/144-PLANO-GESTAO-CENTRALIZADA-USUARIOS-LOCAIS-PFSENSE-2026-07-31.md`

## Versões

| Componente | Versão |
|------------|--------|
| API | `0.7.2` |
| Painel web | `1.5.3` (sem alteração) |
| Package pfSense | `0.4.18` (sem alteração) |

## O que foi entregue

### Banco de dados (Prisma + migration)

- Enums `TechnicianStatus`, `TechnicianNodeAccountStatus`
- Models `Technician`, `TechnicianNodeAccount` (relação inversa em `Node`)
- 4 novos valores em `NodeCommandType`: `local_user_create`, `local_user_set_password`, `local_user_disable`, `local_user_delete`
- Migration: `20260731120000_technician_accounts_foundation`

### RBAC

- Permissões `technicians.view`, `technicians.manage`, `technicians.password_reset.run` — **somente superadmin** (decisão fechada no plano 144)

### Configuração

- Bloco `technicianAccounts` em `app-config.ts` — todas as flags default `false`, `minAgentVersion` = `0.5.0` (acima do package publicado `0.4.18`, impedindo dispatch prematuro)

### Registry de comandos

- 4 entradas em `command-registry.ts` com `validatePayload` mínimo em `technician-accounts.util.ts`
- `toAgentCommandPayload` estendido em `node-commands.service.ts`; prefixos de auditoria via `getCommandDefinition().auditPrefix` (sem mapa duplicado)
- Prefixos de auditoria: `technician.create`, `technician.password_reset`, `technician.disable`, `technician.delete`

### Revisão pós-implantação (API 0.7.2)

- `command-orchestrator.service.ts`: persistir payload **normalizado** após `validatePayload` (usernames lowercase, UUID trim)
- `node-commands.service.ts`: remover `AUDIT_PREFIX_BY_TYPE` duplicado — DRY via registry
- `.env.api.example`: bloco `TECHNICIAN_ACCOUNTS_*` (doc 144 §5.3)

## Comportamento em produção

- **Nenhuma mudança visível** — flags off, `minAgentVersion` acima da frota, sem controllers/endpoints, sem código no agente
- Smoke suite existente deve permanecer verde

## Próximo passo (Fase 1)

1. Validar em laboratório pfSense CE 2.8.1 os 4 pontos da seção 6 do doc 144 (`auth.inc`, privilégios mínimos, `manage_local_user.php` isolado, guardrail última conta admin)
2. Implementar `technicians.service.ts` + controllers + handler no agente (`manage_local_user.php`, dispatchers)
3. Piloto em 1–2 firewalls não críticos

## Arquivos alterados/criados

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260731120000_technician_accounts_foundation/migration.sql`
- `apps/api/src/auth/permission-keys.ts`
- `apps/api/src/config/app-config.ts`
- `apps/api/src/commands/command-registry.ts`
- `apps/api/src/commands/command-registry.util.ts`
- `apps/api/src/node-commands/node-commands.service.ts`
- `apps/api/src/technicians/technician-accounts.util.ts` (novo)
- `apps/api/src/commands/command-orchestrator.service.ts`
- `apps/api/package.json` → `0.7.2`

## Risco residual

- Fase 1 depende de validação em laboratório antes de codificar `manage_local_user.php` em definitivo
- Guardrail "última conta admin" exige coleta de snapshot de usuários locais pelo agente (pré-requisito Fase 1)
