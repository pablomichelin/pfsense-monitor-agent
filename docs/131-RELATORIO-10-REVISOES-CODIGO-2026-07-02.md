# 131 - Relatório das 10 revisões de código

**Data:** 2026-07-02  
**Escopo:** Pós-conclusão plano 117 (Fases 0–12) · `/Dados/Monitor-Pfsense`  
**Metodologia:** 10 rodadas sequenciais com foco distinto; correção integral antes da próxima rodada.

---

## Resumo executivo

- **Total de erros encontrados:** 10
- **Total corrigidos:** 9
- **Pendências:** 1 (TLS self-signed em pfREST — decisão de infra, não bug de código)

Builds finais: API `0.7.0` OK · Web `1.5.1` OK · Testes amostrados API **13/13** OK.

---

## Por rodada (1-10)

### Rodada 1 — API/NestJS (controllers, services, RBAC)

- **Erros:** 3
  1. *(médio)* `compareAliasesWithBackup` chamava `listAliases`, gerando auditoria `pfsense.alias.list` duplicada
  2. *(baixo)* `rotatePfrestCredential` registrava evento `created` + `rotated` redundante
  3. *(baixo)* Auditoria sempre `pfsense.credentials.create` mesmo em rotação
- **Soluções:** Extraído `fetchAliasesFromPfrest()`; parâmetro `eventType` em upsert; auditoria condicional create/rotate

### Rodada 2 — Prisma/migrations

- **Erros:** 0
- **Observação:** Migrations aditivas `20260702200000` e `20260702210000`; `prisma generate` necessário após schema

### Rodada 3 — Frontend Next.js (rotas, server actions, CSRF)

- **Erros:** 1
  1. *(crítico)* `node-capabilities-panel` e `node-pfsense-api-panel` importavam `@/lib/api` (usa `next/headers`) em Client Components → falha de build
- **Soluções:** Criado `lib/pfsense-capabilities-actions.ts` (`use server`) como proxy

### Rodada 4 — UI/UX operacional

- **Erros:** 3
  1. *(médio)* `Alert variant="danger"` inválido (tipo só aceita `error`)
  2. *(baixo)* `Badge variant="default"` inválido
  3. *(médio)* Painéis pfREST visíveis sem permissão `pfsense.api.view` / `pfsense.alias.view`
- **Soluções:** Variants corrigidos; render condicional por RBAC no overview tab

### Rodada 5 — Segurança (segredos, audit, fail-closed)

- **Erros:** 1 corrigido + 1 pendência
  1. *(baixo)* `previewAliasChange` retornava Promise encadeada em método síncrono — risco de erro não aguardado
  2. *(pendência)* Fetch pfREST usa TLS padrão Node; certificados self-signed internos podem falhar em lab
- **Soluções:** Método tornado `async/await`; pendência TLS documentada para decisão infra (CA interna ou flag dedicada futura)

### Rodada 6 — Feature flags e rollback

- **Erros:** 0
- **Verificado:** `NODE_CAPABILITIES_ENABLED`, `PFSENSE_VAULT_ENABLED`, `PFSENSE_API_ENABLED`, `PFSENSE_ALIAS_*` default `false`

### Rodada 7 — Integração ingest/agent/package

- **Erros:** 0
- **Verificado:** Heartbeat `capabilities{}` opcional; agente `build_capabilities_json()`; backward compatible

### Rodada 8 — Testes

- **Erros:** 0 bloqueadores
- **Ação:** Adicionado `node-capabilities-pfsense-api.test.mjs` (5 casos); certificados 8 casos pré-existentes

### Rodada 9 — Docs vs código

- **Erros:** 2
  1. *(baixo)* `audit-labels.ts` sem rótulos `pfsense.credentials.*` / `pfsense.alias.*`
  2. *(baixo)* `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md` desatualizada
- **Soluções:** Labels e matriz RBAC atualizados; docs 128–130 criados; plano 117 marcado 100%

### Rodada 10 — Revisão transversal (builds, lints)

- **Erros:** 0
- **Evidência:** `npm run build` API + web; `node --test` 13/13 nos módulos tocados

---

## Tabela consolidada

| # | Rodada | Severidade | Descrição | Solução | Arquivo |
|---|--------|------------|-----------|---------|---------|
| 1 | 1 | médio | Auditoria duplicada em compare aliases | `fetchAliasesFromPfrest` isolado | `pfsense-api.service.ts` |
| 2 | 1 | baixo | Eventos credential duplicados na rotação | `eventType` parametrizado | `node-capabilities.service.ts` |
| 3 | 1 | baixo | Audit action errada em rotate | Action condicional create/rotate | `node-capabilities.service.ts` |
| 4 | 3 | crítico | Client Component importando `lib/api` | Server actions dedicadas | `pfsense-capabilities-actions.ts`, panels |
| 5 | 4 | médio | Variant Alert inválido | `danger` → `error` | `node-capabilities-panel.tsx` |
| 6 | 4 | baixo | Variant Badge inválido | `default` → `neutral` | `node-pfsense-api-panel.tsx` |
| 7 | 4 | médio | UI pfREST sem gate RBAC | Render condicional | `node-detail-overview-tab.tsx` |
| 8 | 5 | baixo | previewAliasChange sync/async | `async/await` | `pfsense-api.service.ts` |
| 9 | 9 | baixo | Audit labels ausentes | Entradas adicionadas | `audit-labels.ts` |
| 10 | 9 | baixo | Matriz RBAC doc desatualizada | Linhas pfREST | `23-matriz-permissoes-...md` |

**Pendência (não contada como erro corrigível nesta sessão):** TLS self-signed pfREST em rede interna — requer CA ou flag infra explícita.

---

## Próximo passo sugerido

Homologar Fases 10–11 em lab com pfREST instalado, flags habilitadas em staging e `prisma migrate deploy` antes de qualquer uso operacional.
