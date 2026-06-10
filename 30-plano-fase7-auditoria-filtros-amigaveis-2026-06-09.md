# 30. Plano de execução — Fase 7: Auditoria com filtros amigáveis

Data: `2026-06-09`  
Status: `encerrado` — ver `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`  
Próximo passo operacional: `docs/86-TRILHA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md`

## Documentos relacionados

| Documento | Papel |
|-----------|--------|
| `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md` | Roadmap UX — Fase 7 |
| `docs/85-ENTREGA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md` | Entrega anterior |
| `docs/SISTEMA-VISUAL-PAINEL.md` | Design system |
| `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md` | Permissão `audit.view` |
| `apps/web/app/audit/page.tsx` | Estado atual (filtros técnicos) |
| `apps/api/src/admin/dto/list-audit-logs-query.dto.ts` | Query params existentes |

## Objetivo

Refatorar `/audit` com filtros amigáveis em PT-BR (período, ação, ator, tipo de recurso, resultado), design system (`PageSection`, `Card`, `Button`, `Badge`, `Alert`) e melhor legibilidade da lista de eventos — **sem** quebrar permissões ou escopo RBAC.

## Versões alvo

| Componente | Versão atual | Versão alvo | Tipo |
|------------|--------------|-------------|------|
| API | `0.2.6` | `0.2.7` | **patch** — query params opcionais (`result`, `from`, `to`, `actor_email`, `offset`) |
| Painel web | `0.7.0` | `0.8.0` | **minor** — filtros/UX nova na auditoria |

## Decisão de API

| Parâmetro existente | Comportamento |
|---------------------|---------------|
| `action` | `startsWith` (mantido) |
| `target_type` | igualdade exata (mantido) |
| `target_id` | igualdade exata (mantido) |
| `limit` | 1–100 (mantido) |

| Parâmetro novo | Comportamento |
|----------------|---------------|
| `result` | `success` \| `denied` \| `failure` |
| `from` | ISO 8601 — `created_at >= from` |
| `to` | ISO 8601 — `created_at <= to` (fim do dia se só data) |
| `actor_email` | busca parcial case-insensitive em `users.email` → filtra `actor_id` |
| `offset` | paginação simples (`skip`) |

Escopo por cliente permanece em `filterAuditItemsForScope` — inalterado.

## Escopo autorizado

### Filtros UI (PT-BR)

- Período: últimas 24h, 7 dias, 30 dias, personalizado (de/até)
- Ação: select com categorias (`auth.`, `admin.`, `backup.`, etc.) + campo livre opcional
- Ator: e-mail (parcial)
- Tipo de recurso: select PT-BR (`node` → Firewall, etc.)
- ID do recurso: texto
- Resultado: sucesso / negado / falha
- Quantidade: 25 / 50 / 100 eventos

### Lista de eventos

- `AuditEventRow` com `Badge` e labels PT-BR
- Empty state via `Alert`
- Aviso quando `items.length === limit` (possível truncamento)
- Detalhes (payload) sob demanda — preservado

### Design system

- `PageHero` + `PageSection` + `Card` + `Button` + `Alert`
- Inputs/selects com classes do padrão backups/dashboard

## Arquivos novos

- `30-plano-fase7-auditoria-filtros-amigaveis-2026-06-09.md`
- `docs/86-TRILHA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md`
- `docs/86-ENTREGA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md`
- `apps/web/lib/audit-labels.ts`

## Arquivos alterados

- `apps/api/src/admin/dto/list-audit-logs-query.dto.ts`
- `apps/api/src/admin/admin.service.ts` (`listAuditLogs`)
- `apps/web/lib/api.ts` (`getAuditLogs`, tipo `AuditLogsResponse`)
- `apps/web/app/audit/page.tsx`
- `apps/web/components/audit-event-row.tsx`
- `apps/web/package.json` → `0.8.0`
- `apps/api/package.json` → `0.2.7`
- Índices + histórico

## Fora de escopo

- Fase 8 (DataTable global)
- Refatoração admin completa
- Novo endpoint dedicado de auditoria
- Export CSV / retenção

## Critérios de aceite

- [ ] `/audit` exibe filtros PT-BR e aplica via query string
- [ ] Filtros `result`, período e `actor_email` funcionam via API
- [ ] `audit.view` e escopo RBAC preservados
- [ ] Lista legível com empty state e aviso de limite
- [ ] Build API + web OK; deploy OK; rodapé `v0.8.0`
