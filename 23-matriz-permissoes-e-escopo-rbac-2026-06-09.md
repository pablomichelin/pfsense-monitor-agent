# 23. Matriz de permissões e escopo RBAC

Data: `2026-06-09`
Plano mestre: `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
Trilha UX layout (nao altera matriz): `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md`

## Camadas

1. **Role** — atalho de perfil (`superadmin`, `admin`, `operator`, `readonly`, `client`)
2. **Permissão** — catálogo seedado em `permissions` / `role_permissions`
3. **Escopo** — `user_client_scopes` (Fase B); `superadmin` ignora escopo

## Catálogo de permissões

| Permissão | Descrição |
|-----------|-----------|
| `clients.view` | Listar clientes |
| `clients.create` | Criar clientes e sites (API); cadastro top-level em `/admin` exige escopo global — ver `has_global_client_scope` |
| `clients.update` | Atualizar clientes e sites |
| `clients.delete` | Excluir clientes |
| `firewalls.view` | Listar/ver firewalls, dashboard |
| `firewalls.create` | Criar firewalls |
| `firewalls.update` | Editar firewall, maintenance, tokens (leitura) |
| `firewalls.delete` | Excluir firewalls |
| `backups.run` | Solicitar backup `config.xml` |
| `backups.view` | Listar backups |
| `backups.download` | Baixar `config.xml` descriptografado |
| `pfsense.upgrade.run` | Disparar upgrade pfSense OS (por firewall) |
| `package.upgrade.run` | Disparar upgrade remoto do package SystemUp Monitor |
| `users.view` | Listar usuários e escopos |
| `users.create` | Criar usuários |
| `users.update` | Atualizar usuários e escopo |
| `users.delete` | Excluir usuários |
| `roles.manage` | Gerenciar roles/permissões (reservado) |
| `audit.view` | Ver auditoria |
| `settings.manage` | Configurações globais (reservado) |
| `bootstrap.view` | Ver comando bootstrap |
| `bootstrap.execute` | Rekey, criar/revogar tokens de agente |
| `alerts.view` | Listar alertas |
| `alerts.acknowledge` | Reconhecer alertas |
| `alerts.resolve` | Resolver alertas |

`backups.restore` — reservada para fase futura.

## Matriz role × permissão

| Permissão | superadmin | admin | operator | readonly | client |
|-----------|:----------:|:-----:|:--------:|:--------:|:------:|
| clients.* | ✓ | ✓ | — | — | — |
| firewalls.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| firewalls.create/update/delete | ✓ | ✓ | — | — | — |
| backups.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| backups.run | ✓ | ✓ | — | — | — |
| backups.download | ✓ | — | — | — | — |
| pfsense.upgrade.run | ✓ | ✓ | — | — | — |
| pfsense.api.view | ✓ | ✓ | — | — | — |
| pfsense.credentials.manage | ✓ | ✓ | — | — | — |
| pfsense.alias.view | ✓ | ✓ | — | — | — |
| pfsense.alias.manage | ✓ | ✓ | — | — | — |
| pfsense.alias.apply | ✓ | — | — | — | — |
| package.upgrade.run | ✓ | ✓ | — | — | — |
| users.* | ✓ | — | — | — | — |
| audit.view | ✓ | ✓ | — | — | — |
| bootstrap.view/execute | ✓ | ✓ | — | — | — |
| alerts.view | ✓ | ✓ | ✓ | ✓ | — |
| alerts.acknowledge/resolve | ✓ | ✓ | ✓ | — | — |

## Escopo (camada 3)

- `superadmin`: global
- `client`: `users.client_id` (empresa única)
- Demais roles: interseção permissão + `user_client_scopes`
- Node fora do escopo: **403**

## Flags

- `RBAC_SCOPE_ENABLED` (default `true`)
- `RBAC_PERMISSIONS_ENABLED` (default `true`)
