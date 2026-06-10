# Entrega — Gestão dinâmica de perfis e permissões

**Data:** 2026-06-09  
**Versões:** API `0.2.5`, painel `0.2.6`

## Escopo

- Editar permissões por perfil na matriz (`/admin/permissoes`)
- Criar perfis customizados (grupos)
- Excluir perfis customizados sem usuários vinculados
- Atribuir perfis customizados a usuários

## API

| Método | Rota | Permissão |
|--------|------|-----------|
| GET | `/api/v1/admin/permissions-matrix` | `users.view` |
| GET | `/api/v1/admin/roles` | `users.view` |
| POST | `/api/v1/admin/roles` | `roles.manage` |
| DELETE | `/api/v1/admin/roles/:code` | `roles.manage` |
| POST | `/api/v1/admin/roles/:code/permissions` | `roles.manage` |

- Superadministrador: permissões imutáveis (sempre todas)
- Perfis de sistema: não podem ser excluídos
- Migração: `20260610120000_dynamic_roles` — tabela `roles`, `users.role` e `role_permissions.role` em TEXT

## Painel

- `PermissionsMatrixEditor` — checkboxes + Salvar por coluna + formulário Criar perfil
- Quem tem só `users.view` vê matriz read-only
- Quem tem `roles.manage` (superadmin por padrão) edita

## Auditoria

- `role.create`, `role.delete`, `role.permissions.update`
