# 86 — Entrega front-end Fase 7 (Auditoria filtros amigáveis)

**Data:** 2026-06-09  
**Versão painel:** `0.8.0`  
**API:** `0.2.7` (query params opcionais)  
**Plano:** `30-plano-fase7-auditoria-filtros-amigaveis-2026-06-09.md`  
**Trilha:** `docs/86-TRILHA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md`

---

## 1. Resumo

Página **`/audit`** refatorada com filtros amigáveis em PT-BR (período, ação, ator, recurso, resultado), design system (`PageSection`, `Card`, `Button`, `Badge`, `Alert`) e paginação simples via `offset`. API estendida com parâmetros opcionais retrocompatíveis.

---

## 2. Filtros implementados

| Filtro UI | Query string | API |
|-----------|--------------|-----|
| Período (24h / 7d / 30d / datas) | `period`, `from`, `to` | `from`, `to` |
| Ação (categorias) | `action` | `action` (startsWith) |
| Ator (e-mail) | `actor_email` | `actor_email` |
| Tipo de recurso | `target_type` | `target_type` |
| ID do recurso | `target_id` | `target_id` |
| Resultado | `result` | `result` |
| Quantidade | `limit` | `limit` |
| Paginação | `offset` | `offset` |

---

## 3. Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `30-plano-fase7-auditoria-filtros-amigaveis-2026-06-09.md` | Plano Fase 7 |
| `docs/86-TRILHA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md` | Trilha executável |
| `apps/web/lib/audit-labels.ts` | Labels PT-BR e presets de período |

---

## 4. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `apps/api/src/admin/dto/list-audit-logs-query.dto.ts` | Novos query params |
| `apps/api/src/admin/admin.service.ts` | Filtros `result`, período, ator, offset |
| `apps/web/lib/api.ts` | `getAuditLogs` estendido |
| `apps/web/app/audit/page.tsx` | UI filtros + seções |
| `apps/web/components/audit-event-row.tsx` | Badge + labels PT-BR |
| `apps/web/package.json` | Versão `0.8.0` |
| `apps/api/package.json` | Versão `0.2.7` |

---

## 5. Permissões

| Elemento | Permissão |
|----------|-----------|
| Rota `/audit` | `audit.view` (inalterada) |
| API `GET /api/v1/admin/audit` | `audit.view` + escopo RBAC (inalterado) |

---

## 6. Como validar

1. Login como admin/superadmin com `audit.view`
2. Abrir `/audit` — filtros em PT-BR visíveis
3. Filtrar por período (7 dias) e resultado (Negado)
4. Buscar ator por e-mail parcial
5. Verificar empty state sem resultados
6. Com muitos eventos, usar **Próxima página**
7. Rodapé exibe `v0.8.0`

---

## 7. Build e deploy

```bash
cd apps/api && npm run build
cd apps/web && npm run build
cd /opt/Monitor-Pfsense && docker compose up -d --build
```

---

## 8. Próxima fase

Fase 8 — adoção global do design system / DataTable nas pages restantes (`docs/87` planejado).
