# 68. Diagnóstico: RBAC, usuários, permissões e escopo por cliente

Data: `2026-06-09`
Status: `baseline registrada`
Plano mestre: `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`

## Objetivo

Registrar o estado atual do sistema antes de qualquer alteração de código na trilha RBAC/escopo.

## 1. Estado atual do sistema

### Arquitetura

| Camada | Stack | Versão registrada |
|--------|-------|-------------------|
| API | NestJS + Fastify + Prisma | 0.1.6 |
| Painel | Next.js 15 App Router | 0.1.20 |
| Banco | PostgreSQL 17 | migrations em `apps/api/prisma/migrations/` |
| Deploy | Docker Compose + nginx :8088 | `compose.yaml` |

### Modelo de dados relevante

```
Client → Site → Node (firewall)
User → UserSession
AuditLog (genérico)
NodeConfigBackup, NodeCommand (backup)
```

Roles atuais (`UserRole`): `superadmin`, `admin`, `operator`, `readonly`.

**Ausente:** vínculo `User ↔ Client`, perfil `client`, tabela de permissões.

### Autenticação

- Sessão em banco, cookie + CSRF em mutações.
- Bootstrap via `.env.api` pode re-upsert superadmin.
- Guards: `SessionAuthGuard`, `RolesGuard`.

### Autorização atual (resumo)

| Recurso | Acesso |
|---------|--------|
| Dashboard, nodes, alerts (leitura) | todos autenticados, **sem filtro por cliente** |
| Admin CRUD | `superadmin`, `admin` |
| Gestão usuários | `superadmin` |
| Backup request | `superadmin`, `admin` |
| Backup download | `superadmin` |
| Backup listagem (metadados) | todos autenticados |

## 2. Problemas encontrados

### Críticos

1. **Zero isolamento multi-tenant** — IDOR lógico: qualquer user vê qualquer node por UUID.
2. **Perfil Cliente final inexistente.**
3. **RBAC só por role fixa** — sem `clients.view`, `backups.download`, etc.
4. **Admin sem escopo** — opera todos os clientes.

### Altos

5. **Bug:** `/nodes/[id]` faz `Promise.all` com `getNodeBootstrapCommand` (rota admin) → `operator`/`readonly` recebem 403 e a página falha.
6. **Menu Instalação** visível para todos; bootstrap exige admin.
7. **Site** permanece no schema/API, oculto na UX.

### Médios

8. Auditoria sem `actor_role`, `client_id`, `result` padronizados.
9. Proteção de UI sem equivalente de escopo na API de leitura.
10. `GET /api/v1/agent/package-release` sem autenticação.

## 3. Riscos de segurança

| Risco | Severidade | Mitigação atual |
|-------|------------|-----------------|
| Cross-cliente | Crítica | nenhuma |
| Download config.xml | Alta | só superadmin + audit |
| Backup em repouso | Média-baixa | AES-256-GCM, mode 0600 |
| Path traversal storage | Baixa | path server-side |
| Bootstrap env backdoor | Média | documentar flag na Fase F |

## 4. Problemas de usabilidade

- Roles em inglês na UI (`operator`, `readonly`).
- Sem tela de escopo usuário ↔ cliente.
- Sem matriz de permissões.
- Área admin e operacional misturadas no menu.
- Detalhe do firewall inacessível para perfis operacionais (bug).

## 5. Problemas de arquitetura

- Autorização acoplada a `@Roles` por controller.
- Frontend chama rotas admin para dados operacionais.
- Sem `middleware.ts` global no Next.js.
- Smoke RBAC não cobre detalhe do node nem escopo.

## 6. Modelo recomendado

Ver plano mestre `22`:

- Camada 1: perfis (incluir `client`)
- Camada 2: permissões granulares seedadas
- Camada 3: `user_client_scopes`
- Camada 4: auditoria enriquecida

## 7. Plano de implementação

| Fase | Doc trilha | Foco |
|------|------------|------|
| A | docs/69 | fixes urgentes sem migration |
| B | docs/70 | escopo por cliente |
| C | docs/71 | permissões granulares |
| D | docs/72 | perfil cliente |
| E | docs/73 | UX administrativa |
| F | docs/74 | auditoria e endurecimento |

## 8. Checklist de testes (baseline)

Registrar em `docs/75` antes de cada fase. Mínimo atual:

- [ ] `scripts/smoke-rbac-roles.sh` verde
- [ ] `scripts/run-smoke-suite.sh` verde
- [ ] operator consegue abrir `/nodes/:id` (falha hoje — corrige na Fase A)
- [ ] user sem escopo não vê node de outro cliente (falha hoje — corrige na Fase B)

## Encerramento

Este documento é **baseline de diagnóstico**, não uma trilha de implementação.

Próxima ação: abrir `docs/69` e executar Fase A.
