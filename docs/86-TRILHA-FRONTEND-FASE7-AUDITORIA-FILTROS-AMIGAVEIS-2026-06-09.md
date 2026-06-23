# Trilha executável — Front-end Fase 7 (Auditoria filtros amigáveis)

**Data:** 2026-06-09  
**Status:** concluída  
**Plano mestre:** `30-plano-fase7-auditoria-filtros-amigaveis-2026-06-09.md`  
**Entrega anterior:** `docs/85-ENTREGA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md`

## Objetivo

Checklist para refatorar `/audit` com filtros amigáveis PT-BR e extensão mínima da API de leitura.

## Versão alvo

- Painel web: `0.7.0` → `0.8.0` (minor)
- API: `0.2.6` → `0.2.7` (patch — query params opcionais)

---

## Pré-voo

- [x] Ler `30-plano-fase7-auditoria-filtros-amigaveis-2026-06-09.md`
- [x] Ler `apps/web/app/audit/page.tsx` e `list-audit-logs-query.dto.ts`
- [x] Confirmar permissão `audit.view` inalterada

---

## Bloco A — API (query params)

- [x] Estender `ListAuditLogsQueryDto` (`result`, `from`, `to`, `actor_email`, `offset`)
- [x] Ajustar `listAuditLogs` em `admin.service.ts`
- [x] Bump `apps/api/package.json` → `0.2.7`

---

## Bloco B — Front-end

- [x] `lib/audit-labels.ts` — labels PT-BR ação/recurso/resultado
- [x] `lib/api.ts` — `getAuditLogs` com novos params
- [x] `app/audit/page.tsx` — filtros + PageSection/Card/Button
- [x] `audit-event-row.tsx` — Badge + labels PT-BR

---

## Bloco C — Documentação e versão

- [x] Bump `apps/web/package.json` → `0.8.0`
- [x] Índices + histórico
- [x] `docs/86-ENTREGA-...`
- [x] Build API + web + deploy

```bash
cd apps/api && npm run build
cd apps/web && npm run build
cd /Dados/Monitor-Pfsense && docker compose up -d --build
```
