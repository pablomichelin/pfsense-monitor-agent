# 70. Trilha RBAC — Fase B: escopo por cliente

Data de abertura: `2026-06-09`
Status: `encerrada`
Plano mestre: `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
Pré-requisito: `docs/69-TRILHA-RBAC-FASE-A-CORRECOES-URGENTES-2026-06-09.md`

## Objetivo

Introduzir isolamento multi-tenant por cliente via `user_client_scopes`, com enforcement no backend (`AccessPolicyService`) e UI mínima para atribuir escopo a usuários não-superadmin.

## Escopo entregue

### Banco

- Model `UserClientScope` em `schema.prisma`
- Migration `20260609120000_user_client_scopes`
- Seed de compatibilidade: usuários não-superadmin ativos recebem todos os clientes ativos

### Backend (`apps/api` 0.2.0)

| Componente | Mudança |
|------------|---------|
| `auth/access-policy.service.ts` | `getAllowedClientIds`, `assertClientAccess`, `assertNodeAccess`, merges em queries |
| `auth/access-actor.util.ts` | `getAccessActor(request)` |
| `config/app-config.ts` | `RBAC_SCOPE_ENABLED` (default `true`) |
| `nodes`, `dashboard`, `alerts`, `backups` | Filtros e 403 cross-cliente |
| `admin.service.ts` | CRUD usuários com `client_ids`; escopo em writes admin |
| `admin.controller.ts` | Audit com escopo; endpoints `GET/POST users/:id/client-scopes` |

### Frontend (`apps/web` 0.2.0)

| Arquivo | Mudança |
|---------|---------|
| `app/admin/usuarios/page.tsx` | Carrega clientes para picker de escopo |
| `components/admin-usuarios-tabs.tsx` | Checkboxes de clientes por usuário |
| `lib/api.ts` | `client_ids` em users; `setUserClientScopes` |
| `lib/admin.ts` | `client_ids` em create/update user |

### Scripts

| Script | Ação |
|--------|------|
| `scripts/smoke-rbac-client-scope.sh` | **criado** |
| `scripts/smoke-rbac-roles.sh` | `client_ids` no create user |
| `scripts/run-smoke-suite.sh` | inclui smoke client-scope |

## Critérios de aceite

1. Migration aplicada em produção/homolog via deploy.
2. Admin com escopo só no Cliente A não lista nodes do Cliente B.
3. `GET /nodes/:id` fora do escopo → **403** (não 404).
4. Superadmin mantém visão global.
5. UI `/admin/usuarios` permite editar escopo.
6. Smokes RBAC verdes.

## Smoke obrigatório

```bash
scripts/smoke-rbac-client-scope.sh
scripts/smoke-rbac-roles.sh
scripts/run-smoke-suite.sh
```

## Build e deploy

```bash
cd apps/api && npm run build
cd apps/web && npm run build
docker compose up -d --build
```

## Decisões

- `superadmin` = escopo global (sem linhas em `user_client_scopes`)
- Demais roles = escopo explícito; vazio = nenhum dado visível
- Node fora de escopo → `403 Forbidden`
- Feature flag `RBAC_SCOPE_ENABLED` para rollback emergencial

## Próxima fase

**Fase C** — permissões granulares (`docs/71` a criar). Não iniciar antes de validar checklist `docs/75` Fase B.
