# Dashboard Operacional Inicial — Lista de Servidores

**Data:** 2026-03-15  
**Status:** Implementado e documentado  
**Versões:** Painel 0.1.6, API 0.1.2, Package 0.2.0 (inalterado)

---

## 1. Resumo executivo

Trilha para transformar a tela inicial operacional (`/dashboard`) em visão com **lista/tabela de servidores** contendo métricas do último heartbeat (CPU, memória, disco, uptime), sem alterar package, heartbeat ou ingest. A listagem foi estendida no backend para incluir essas métricas de forma eficiente (um único query com include do último heartbeat por node).

---

## 2. Requisitos atendidos

| Requisito | Status |
|-----------|--------|
| Tela inicial = /dashboard operacional | ✅ |
| Manter summary, cards, zona quente, matriz de versão | ✅ |
| Lista/tabela operacional de servidores | ✅ |
| Cliente, host, site, status, versão pfSense | ✅ |
| cpu_percent, memory_percent, disk_percent, uptime_seconds | ✅ |
| Último heartbeat, alertas ativos, maintenance | ✅ |
| Link para abrir detalhe | ✅ |
| Fallback "—" quando não há métrica/heartbeat | ✅ |
| Dados em uma única chamada (sem N+1) | ✅ |
| Sem alterar package, heartbeat ou ingest | ✅ |

---

## 3. Implementação

### 3.1 API

- **GET /api/v1/nodes** estendido para retornar por item:
  - `cpu_percent: number | null`
  - `memory_percent: number | null`
  - `disk_percent: number | null`
  - `uptime_seconds: number | null`

- Origem: último heartbeat já persistido (include `heartbeats: { orderBy: { receivedAt: 'desc' }, take: 1 }`).
- Uma única query; sem loop de detalhe no frontend.

### 3.2 Frontend

- **Dashboard** (`/dashboard`):
  - Mantidos: PageHero, 5 SummaryCards, Zona quente, Matriz de versão, RealtimeRefresh.
  - Adicionada: seção "Lista operacional — Servidores monitorados" com tabela.
  - Colunas: Cliente, Host, Site, Status, pfSense, CPU, Mem, Disco, Uptime, Último HB, Alertas, Maint., Ação (Abrir).
  - Fallback: quando não existe heartbeat/métrica, exibe "—" para CPU, Mem, Disco e Uptime.

### 3.3 Versões

- Painel: 0.1.5 → 0.1.6
- API: 0.1.1 → 0.1.2
- Package: 0.2.0 (inalterado)

---

## 4. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `apps/api/src/nodes/nodes.service.ts` | listNodes: include heartbeats (último), mapear cpu_percent, memory_percent, disk_percent, uptime_seconds |
| `apps/api/package.json` | 0.1.1 → 0.1.2 |
| `apps/web/app/dashboard/page.tsx` | Tabela operacional; import formatPercent, formatUptime; fallback "—" |
| `apps/web/lib/api.ts` | NodesListResponse: cpu_percent, memory_percent, disk_percent, uptime_seconds |
| `apps/web/package.json` | 0.1.5 → 0.1.6 |
| `apps/web/app/layout.tsx` | Footer v0.1.6 |

---

## 5. Validação

- Dashboard carrega com summary, cards, zona quente, matriz e tabela.
- Tabela exibe todos os servidores retornados pela API.
- Métricas CPU, memória, disco e uptime aparecem quando há heartbeat; "—" quando não há.
- Link "Abrir" leva ao detalhe do node.
- Nenhuma regressão em cards, zona quente ou matriz de versão.
- Build API e web concluídos com sucesso.

---

## 6. Escopo não incluído (fase 2)

- Filtros avançados, ordenação complexa, busca avançada
- Agrupamento por cliente, ranking de críticos
- Preferências de visualização

---

## 7. Referências

- `docs/44-TRILHA-EXCLUSAO-HOSTS-2026-03-15.md`
- `CORTEX.md`
- `00_inicio.md`
