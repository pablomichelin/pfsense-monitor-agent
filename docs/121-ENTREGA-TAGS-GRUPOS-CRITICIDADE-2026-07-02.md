# 121 — Entrega: Tags, grupos e criticidade

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 3 — Tags, grupos e criticidade  
**Componentes alterados:** API, web, banco (Prisma migration), docs (sem package pfSense, sem ingestão/agente)  
**Versões antes:** API `0.6.4` · web `1.4.5` · package `0.4.7`  
**Versões depois:** API `0.6.4` · web `1.4.5` · package `0.4.7` (sem bump semver nesta entrega)

**Referências:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md`, `docs/118-BASELINE-MELHORIAS-SEGURAS-2026-07-02.md`

---

## Escopo entregue

### Banco (migration aditiva)

Migration `20260702130000_fleet_tags_groups_criticality`:

| Artefato | Descrição |
|----------|-----------|
| `node_criticality` | Enum `critical`, `standard`, `lab` |
| `nodes.criticality` | Default `standard` |
| `tags` | Tags livres por cliente (`client_id` + `name` único) |
| `node_tags` | Associação N:N node ↔ tag |
| `node_groups` | Grupos ad-hoc por cliente |
| `node_group_members` | Membros do grupo |
| Permissões RBAC | `tags.view`, `tags.manage`, `groups.view`, `groups.manage` |

### API

Módulo `apps/api/src/fleet-org/`:

| Endpoint | Permissão | Descrição |
|----------|-----------|-----------|
| `GET/POST/PATCH/DELETE /api/v1/tags` | `tags.view` / `tags.manage` | CRUD de tags (escopo por cliente) |
| `GET/POST/PATCH/DELETE /api/v1/groups` | `groups.view` / `groups.manage` | CRUD de grupos |
| `GET /api/v1/groups/:id` | `groups.view` | Detalhe + membros |
| `PUT /api/v1/groups/:id/members` | `groups.manage` | Substituir membros (validação de escopo cliente) |
| `PATCH /api/v1/nodes/:id/fleet-metadata` | `firewalls.update` | Criticidade + `tag_ids` |
| `GET /api/v1/nodes/filters` | `firewalls.view` | + tags, grupos, opções de criticidade |
| `GET /api/v1/nodes` | `firewalls.view` | Filtros `tag_id`, `group_id`, `criticality`; resposta inclui tags/criticidade |

**Regra de segurança:** tags e grupos **nunca** substituem RBAC por cliente — apenas organização operacional.

**Auditoria:** ações `fleet.tag.*`, `fleet.group.*`, `fleet.node_metadata.update`.

### Painel web

| Superfície | Entrega |
|------------|---------|
| `/nodes` | Filtros tag, grupo, criticidade; colunas Criticidade e Tags |
| `/nodes/[id]` → Configuração | Resumo + formulário criticidade/tags |
| `/admin/grupos` | Admin tags + grupos + editor de membros |
| Nav admin | Link "Grupos e tags" (`tags.view` ou `groups.view`) |
| RBAC labels / auditoria | Permissões e ações fleet.* |

---

## O que não foi entregue

| Item | Motivo |
|------|--------|
| Operações em lote usando grupos | Preparação de dados; Fase 7+ |
| Bump semver API/web | Entrega aditiva |
| Filtros tag/grupo no `/dashboard` | API reutilizável; UI permanece em `/nodes` |
| Alteração ingestão/heartbeat | Fora do escopo |

---

## Impacto

| Área | Impacto |
|------|---------|
| API | Novo módulo fleet-org; nodes list/filters/detail estendidos |
| Banco | Migration aditiva; default `standard` em nodes existentes |
| UI | Inventário, detalhe, admin grupos |
| Package/agente | Nenhum |
| Operação | Redeploy API/web + `prisma migrate deploy` |

---

## RBAC e auditoria

| Permissão | Roles default |
|-----------|---------------|
| `tags.view`, `groups.view` | superadmin, admin, operator |
| `tags.manage`, `groups.manage` | superadmin, admin |
| `firewalls.update` | (existente) metadata por node |
| `firewalls.view` | (existente) listagem/filtros |

Auditoria em mutações administrativas de tags/grupos e metadata de node.

---

## Rollback

1. Ocultar filtros/colunas no frontend (reverter páginas web).
2. Endpoints fleet-org podem permanecer inertes.
3. Migration é aditiva — rollback de schema só se necessário (tabelas novas + coluna `criticality` com default).

---

## Testes executados

| Teste | Resultado |
|-------|-----------|
| `npm run build` (API) | OK |
| `npm run build` (web) | OK |
| `node --test apps/api/test/fleet-org-tag-name.test.mjs` | OK (3/3) |
| `node --test apps/api/test/fleet-org-filters.test.mjs` | OK (3/3) |
| `docker compose build api web && up -d` | OK — healthy |
| `prisma migrate deploy` (container) | OK — schema up to date |
| Verificação DB `\d tags` + permissões | OK |

---

## Próximo passo

**Fase 4 — Política MFA e endurecimento administrativo** (`docs/117`, seção 11).

Operacional paralelo: rollout package `0.4.7`; validar notificações com `NOTIFICATIONS_ENABLED=true` em homolog.
