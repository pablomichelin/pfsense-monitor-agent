# 71. Trilha RBAC — Fase C: permissões granulares

Data de abertura: `2026-06-09`
Status: `encerrada`
Plano mestre: `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
Matriz: `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md`
Pré-requisito: `docs/70-TRILHA-RBAC-FASE-B-ESCOPO-POR-CLIENTE-2026-06-09.md`

## Objetivo

Sair da dependência exclusiva de nomes de role, com catálogo seedado de permissões validado no backend e refletido no frontend.

## Escopo entregue

### Banco

- Tabelas `permissions`, `role_permissions`
- Migration `20260609140000_permissions` com seed do catálogo e matriz por role

### Backend (`apps/api` 0.2.1)

| Componente | Mudança |
|------------|---------|
| `auth/permissions.service.ts` | Resolução e cache por role |
| `auth/permissions.guard.ts` | `@RequirePermissions()` |
| `auth/permission-keys.ts` | Catálogo tipado |
| `config/app-config.ts` | `RBAC_PERMISSIONS_ENABLED` |
| Controllers | backups, alerts, admin, nodes, dashboard |
| `GET /api/v1/auth/me` | Campo `permissions[]` |

### Frontend (`apps/web` 0.2.1)

| Arquivo | Mudança |
|---------|---------|
| `lib/authz.ts` | `hasPermission`, `hasAnyPermission` |
| `lib/api.ts` | `SessionResponse.permissions` |
| Menu e páginas | Botões/rotas condicionados por permissão |

### Scripts

- `scripts/smoke-rbac-permissions.sh` (novo)
- `scripts/run-smoke-suite.sh` atualizado

## Critérios de aceite

1. `GET /auth/me` retorna permissões efetivas.
2. Download backup exige `backups.download` (só superadmin).
3. Request backup exige `backups.run` (admin/superadmin).
4. Delete client/node exige permissões correspondentes.
5. Gestão de usuários exige `users.*` (superadmin).
6. Frontend oculta ações sem permissão; API mantém validação.

## Smoke obrigatório

```bash
scripts/smoke-rbac-permissions.sh
scripts/run-smoke-suite.sh
```

## Próxima fase

**Fase D** — perfil `client` (`docs/72`).
