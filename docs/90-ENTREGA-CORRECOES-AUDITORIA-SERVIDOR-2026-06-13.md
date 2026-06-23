# 90. Entrega — Correções auditoria servidor

**Data:** 2026-06-13  
**Versões:** API `0.2.10`, painel `1.0.1`, package pfSense `0.2.38` (sem alteração)

## Objetivo

Corrigir bugs críticos/alto identificados na auditoria de endurecimento, no lado do controlador (API + painel), sem alterar o package pfSense.

## Correções aplicadas

### Produção / segurança

- `AUTH_BOOTSTRAP_LOGIN_ENABLED=false` em `.env.api` — login via credenciais de ambiente desabilitado após bootstrap local.

### API 0.2.10

| Bug | Correção |
|-----|----------|
| Heartbeat leve inconsistente | Quando `services`/`gateways` omitidos, mantém status persistido e não resolve alertas `service_down`/`gateway_down` |
| Idempotência heartbeat | Caminho idempotente atualiza `lastSeenAt` |
| Race `expireStaleCommands` | `updateMany` condicional a status `pending`/`picked_up`/`running` |
| `markCommandSucceeded` silencioso | Log warning; permite `expired→succeeded` se backup já gravado |
| SSE dashboard sem permissão | `@RequirePermissions('firewalls.view')` em `GET /api/v1/dashboard/events` |
| Paginação audit logs com escopo | Overscan por lote antes de aplicar `limit`/`offset` para usuários com escopo |
| TOCTOU `requestBackupNow` | Transação serializável com rechecagem interna |

### Painel 1.0.1

| Bug | Correção |
|-----|----------|
| Login ignora `?next=` | Redirect pós-login para path interno válido; hidden field no form; middleware preserva `next` |

## Fora de escopo (auditoria)

- Rate limits globais
- Zip bomb / streaming de backup
- Outros itens médio/baixo não listados na prioridade desta entrega

## Validação

- `cd apps/api && npm run build`
- `cd apps/web && npm run build`
- `docker compose up -d --build`
- `curl /healthz`
- Confirmar `AUTH_BOOTSTRAP_LOGIN_ENABLED=false` no container `api`
