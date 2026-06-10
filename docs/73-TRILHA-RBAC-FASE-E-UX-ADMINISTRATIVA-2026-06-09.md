# 73. Trilha RBAC — Fase E: UX administrativa

Data de abertura: `2026-06-09`
Status: `encerrada`
Plano mestre: `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
Pré-requisito: `docs/72-TRILHA-RBAC-FASE-D-PERFIL-CLIENTE-2026-06-09.md`

## Objetivo

Painel profissional por persona, com navegação clara, proteção centralizada de rotas e confirmações padronizadas em ações críticas.

## Escopo entregue

### Backend (`apps/api` 0.2.3)

- `GET /api/v1/admin/permissions-matrix` — matriz read-only role × permissão (exige `users.view`)

### Frontend (`apps/web` 0.2.3)

- Menu agrupado **Operação** / **Administração** (`lib/route-policy.ts`, `components/app-nav.tsx`)
- `middleware.ts` — autenticação e bloqueio de rotas por permissão
- `/admin/permissoes` — tela read-only da matriz de permissões
- `RoleScopeFields` — cadastro/edição de usuário com perfil e escopo dinâmico
- `ConfirmDialog` — rekey, exclusão de usuário/cliente, download de backup
- `lib/rbac-labels.ts` — rótulos em português para perfis e status na UI

### Scripts

- `scripts/smoke-rbac-admin-ux.sh`

## Critérios de aceite

1. Menu separa Operação e Administração visualmente.
2. Perfil `client` é redirecionado do middleware ao acessar rotas administrativas.
3. Superadmin acessa `/admin/permissoes` e vê matriz seedada.
4. Cadastro de usuário permite escopo por cliente (checkboxes) ou vínculo único (perfil client).
5. Rekey, delete e download de backup exigem confirmação modal.

## Smoke obrigatório

```bash
scripts/smoke-rbac-admin-ux.sh
scripts/run-smoke-suite.sh
```

## Encerramento

- Data: `2026-06-09`
- API/web: `0.2.3`
- Smoke: `scripts/smoke-rbac-admin-ux.sh` verde

## Próxima fase (concluída)

**Fase F** — Auditoria e endurecimento (`docs/74`). Trilha encerrada em `docs/76`.
