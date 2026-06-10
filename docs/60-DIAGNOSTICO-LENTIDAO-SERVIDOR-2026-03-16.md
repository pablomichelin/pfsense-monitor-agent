# Diagnóstico: servidor lento ao navegar no painel

**Data:** 2026-03-16

## Sintomas

- Ao clicar em opções do menu, o carregamento demora muito.
- Muitas vezes ocorre erro (timeout ou falha na requisição).

## Causas identificadas

### 1. Listagem de nodes sem limite

- O endpoint `GET /api/v1/nodes` carregava **todos** os firewalls cadastrados em uma única resposta.
- Cada node vinha com: site, client, alertas abertos e **último heartbeat** (join na tabela `heartbeats`).
- Com dezenas/centenas de nodes e tabela `heartbeats` grande, a query ficava pesada e a resposta lenta.

**Ajuste feito:** limite padrão de **500** nodes por requisição (máximo 1000 via query `limit`). A API passa a usar `take: limit` na query.

### 2. Dashboard e outras telas chamando a lista completa

- A página do dashboard faz `getDashboardSummary()` e **`getNodesList()`** em paralelo.
- A lista completa era usada para: totais, “nodes que precisam de atenção” e contagem por versão.
- Com o limite de 500 na API, a lista retorna no máximo 500 nodes e o carregamento tende a normalizar.

### 3. Tabela `heartbeats` sem retenção

- Cada heartbeat (a cada ~30 s por firewall) grava um registro com `payload_json` (JSON grande).
- Não há job de limpeza: a tabela cresce indefinidamente.
- Com muitos nodes e muito tempo de uso, a tabela fica enorme e as queries que buscam “último heartbeat por node” podem ficar mais lentas.

**Recomendação:** criar rotina (cron/script) para apagar heartbeats antigos (ex.: manter últimos 7 dias ou últimos N por node). Ver seção “Próximos passos” abaixo.

### 4. Auditoria sem índice para filtros

- Listagem de auditoria (`GET /api/v1/admin/audit-logs`) filtra por `action` e `target_type` e ordena por `created_at desc`.
- Existia apenas índice em `created_at`; filtros por action/target_type não tinham índice adequado.

**Ajuste feito:** criado índice composto `(action, target_type, created_at)` na tabela `audit_logs` (migration `20260316100000_audit_log_filter_index`).

## Alterações realizadas no código

| Onde | O quê |
|------|--------|
| `apps/api/src/nodes/dto/list-nodes-query.dto.ts` | Parâmetro opcional `limit` (1–1000), default 500. |
| `apps/api/src/nodes/nodes.service.ts` | `listNodes()` usa `take: limit` no `findMany` de nodes. |
| `apps/api/src/dashboard/dashboard.service.ts` | `getSummary()` passa a rodar em paralelo a busca de nodes e a contagem de alertas abertos. |
| `apps/api/prisma/schema.prisma` | Índice `@@index([action, targetType, createdAt])` em `AuditLog`. |
| `apps/api/prisma/migrations/20260316100000_audit_log_filter_index/` | Migration que cria o índice em `audit_logs`. |

## O que você precisa fazer

1. **Aplicar a migration do índice de auditoria** (se ainda não tiver rodado):  
   O `DATABASE_URL` fica no `.env.api` e é usado pelo container da API. Rode a migration **dentro do container**:
   ```bash
   cd /opt/Monitor-Pfsense
   docker compose run --rm api npx prisma migrate deploy
   ```
   Se a imagem da API foi construída antes de existir a nova migration, reconstrua antes:  
   `docker compose build api && docker compose run --rm api npx prisma migrate deploy`

2. **Rebuild e restart dos serviços** para usar o código novo:
   ```bash
   cd /opt/Monitor-Pfsense
   docker compose up -d --build
   ```

3. **Se tiver mais de 500 nodes:** a listagem passará a mostrar no máximo 500. Para aumentar temporariamente, a chamada à API pode enviar `?limit=1000`. No futuro pode ser implementada paginação (offset/cursor).

## Próximos passos recomendados

1. **Retenção de heartbeats**
   - Definir política (ex.: manter 7 dias).
   - Script ou job que apague registros antigos em `heartbeats` (e rode periodicamente, ex.: diário).

2. **Paginação na listagem de nodes**
   - Parâmetros `offset` e `limit` (ou cursor) para não depender de um limite fixo quando houver muitos firewalls.

3. **Monitorar tamanho das tabelas**
   - Verificar periodicamente o tamanho de `heartbeats` e `audit_logs` no PostgreSQL (ex.: `pg_total_relation_size('heartbeats')`).

4. **Timeouts**
   - Nginx já está com `proxy_read_timeout 300s` para o front e 3600s para SSE. Se ainda houver timeout, revisar se a API está demorando em algum endpoint específico (logs, APM ou log de tempo por rota).

## Verificação rápida no banco

Para ver o tamanho da tabela de heartbeats:

```sql
SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) AS size
FROM pg_class WHERE relname = 'heartbeats';
```

Para ver quantidade de registros:

```sql
SELECT count(*) FROM heartbeats;
```

Se a tabela estiver muito grande (milhões de linhas), a retenção de dados (item 1 dos “Próximos passos”) é prioritária.
