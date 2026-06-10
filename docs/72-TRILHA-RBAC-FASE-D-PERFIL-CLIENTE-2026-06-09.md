# 72. Trilha RBAC — Fase D: perfil Cliente

Data de abertura: `2026-06-09`
Status: `encerrada`
Plano mestre: `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
Pré-requisito: `docs/71-TRILHA-RBAC-FASE-C-PERMISSOES-GRANULARES-2026-06-09.md`

## Objetivo

Permitir acesso restrito do cliente final à própria empresa, sem rotas administrativas nem alertas internos.

## Escopo entregue

### Banco

- Enum `UserRole.client`
- Coluna `users.client_id` (FK para `clients`)
- Permissões seed: `firewalls.view`, `backups.view`

### Backend (`apps/api` 0.2.2)

- `AccessPolicyService`: escopo via `users.client_id` para role `client`
- `admin.service`: criar/atualizar usuário `client` com `client_id` obrigatório
- Demais enforcement via permissões e escopo existentes

### Frontend (`apps/web` 0.2.2)

- Menu sem Alertas, Admin, Instalação para perfil `client`
- Dashboard simplificado (sem métricas de alertas internos)
- Detalhe do firewall: backups visíveis, sem alertas internos nem auditoria
- UI de usuários: role `client` + seletor de empresa

### Scripts

- `scripts/smoke-rbac-client-profile.sh`

## Critérios de aceite

1. Role `client` criável com `client_id`.
2. Cliente vê apenas firewalls da própria empresa.
3. Cliente não acessa alertas, admin, auditoria, bootstrap.
4. Cliente não solicita nem baixa `config.xml`.

## Smoke obrigatório

```bash
scripts/smoke-rbac-client-profile.sh
scripts/run-smoke-suite.sh
```

## Próxima fase

**Fase E** — UX administrativa (`docs/73`).
