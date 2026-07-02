# 124 — Entrega: Observabilidade histórica e rollups

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 6 — Observabilidade histórica e rollups  
**Componentes alterados:** API, web, docs (sem package pfSense, sem alteração de ingest/heartbeat)  
**Versões antes:** API `0.6.5` · web `1.4.6` · package `0.4.7`  
**Versões depois:** API `0.6.6` · web `1.4.7` · package `0.4.7` (sem bump)

**Referências:** `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md`, `docs/61-REFATORACAO-SNAPSHOT-OPERACIONAL-2026-03-19.md`

---

## Escopo entregue

### Modelo de dados (migration aditiva)

Tabelas novas (`20260702160000_metric_rollups`):

| Tabela | Papel |
|--------|-------|
| `node_metric_samples` | Amostras periódicas do snapshot em `nodes` (CPU, memória, disco, latência, status, disponibilidade) |
| `node_metric_rollups_hourly` | Agregados horários idempotentes por `(node_id, bucket_start)` |
| `node_metric_rollups_daily` | Agregados diários idempotentes por `(node_id, bucket_start)` |
| `system_job_locks` | Lock simples no banco para jobs de amostragem/rollup |

**Importante:** o controlador **não** passa a reter heartbeat bruto. Amostragem lê apenas o snapshot atual de `nodes`.

### Feature flag e env

| Variável | Default | Descrição |
|----------|---------|-----------|
| `METRIC_ROLLUPS_ENABLED` | `false` | Liga jobs e endpoints de histórico |
| `METRIC_SAMPLE_INTERVAL_SECONDS` | `300` | Intervalo de amostragem (5 min) |
| `METRIC_SAMPLE_RETENTION_HOURS` | `72` | Retenção de amostras brutas |
| `METRIC_HOURLY_ROLLUP_INTERVAL_SECONDS` | `3600` | Ciclo rollup horário |
| `METRIC_DAILY_ROLLUP_INTERVAL_SECONDS` | `86400` | Ciclo rollup diário |
| `METRIC_HOURLY_RETENTION_DAYS` | `35` | Retenção rollups horários |
| `METRIC_DAILY_RETENTION_DAYS` | `400` | Retenção rollups diários |

Documentado em `.env.api.example`.

### Backend — jobs NestJS

Sub-etapa **6A (amostragem):**

- `MetricsSamplerService`: job periódico lê snapshot de todos os `nodes`, grava `node_metric_samples`, purga amostras antigas, dispara rollup da hora anterior.
- Usa `deriveEffectiveNodeStatus` (mesma semântica operacional do painel).

Rollups:

- `MetricsRollupService`: rollup horário (amostras → hourly) e diário (hourly → daily), com upsert idempotente e retenção configurável.
- `SystemJobLockService`: lock via tabela `system_job_locks` (evita concorrência entre ciclos).

Arquivos principais:

- `apps/api/src/metrics-history/metrics-sampler.service.ts`
- `apps/api/src/metrics-history/metrics-rollup.service.ts`
- `apps/api/src/metrics-history/metrics-rollup.util.ts`
- `apps/api/src/metrics-history/system-job-lock.service.ts`
- `apps/api/src/metrics-history/metrics-history.module.ts`

### API read-only

**`GET /api/v1/nodes/:nodeId/metrics/history?period=24h|7d|30d`**

- Permissão: `firewalls.view`
- RBAC: `assertNodeAccess` por cliente
- Cache in-memory: 30s por usuário + node + período
- Períodos: `24h` e `7d` → rollups **horários**; `30d` → rollups **diários**
- Resposta inclui `enabled`, `points[]`, `summary` (médias ponderadas)

Quando `METRIC_ROLLUPS_ENABLED=false`, endpoint responde `enabled: false` e `points: []` (fail-safe para UI).

### Painel web

Aba **Métricas** do detalhe do firewall (`/nodes/[id]?tab=metrics`):

- Snapshot atual (heartbeat) preservado
- Nova seção **Tendências** com seletor 24h / 7d / 30d
- Sparklines CSS leves (sem Recharts/Prometheus/Grafana)
- Tabela compacta de buckets (últimos 24)
- Estado vazio claro quando flag off ou sem dados

Arquivos principais:

- `apps/web/components/nodes/node-metrics-trends-panel.tsx`
- `apps/web/components/nodes/node-detail-metrics-tab.tsx`
- `apps/web/lib/metrics-history.ts`
- `apps/web/lib/api.ts` (`getNodeMetricsHistory`)

### Testes unitários

- `apps/api/test/metrics-rollup.test.mjs` — agregação idempotente, timezone UTC, janelas de período, disponibilidade

---

## O que não foi entregue

| Item | Motivo |
|------|--------|
| Gráficos no `/dashboard` frota | Escopo prioritário no detalhe do node; dashboard mantém KPIs existentes |
| Prometheus/Grafana | Explicitamente fora do escopo |
| Alteração de contrato heartbeat/ingest | Regra do plano — preservado |
| Smoke automatizado do endpoint history | Validado via build + testes utilitários |

---

## Rollback

1. `METRIC_ROLLUPS_ENABLED=false` — para jobs; UI mostra aviso e snapshot atual continua operacional
2. Ocultar seção Tendências — automático quando `enabled: false`
3. Migrations são aditivas — tabelas podem permanecer vazias sem impacto no snapshot

---

## Homologação sugerida

1. Aplicar migration: `npm run prisma:migrate:deploy` no container API
2. Definir `METRIC_ROLLUPS_ENABLED=true` em `.env.api`
3. Redeploy `docker compose up -d --build api web`
4. Aguardar ~5 min + 1h para rollups horários
5. Abrir `/nodes/{id}?tab=metrics` e alternar períodos
6. Validar RBAC: usuário escopo cliente A não acessa node do cliente B

---

## Próximo passo (Fase 7)

Fundacao de jobs/comandos — contrato unico de idempotencia, retries, concorrencia e historico de execucao antes de ampliar acoes remotas.
