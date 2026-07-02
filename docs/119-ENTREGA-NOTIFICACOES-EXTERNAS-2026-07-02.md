# 119 — Entrega: Notificações externas

**Data:** 2026-07-02  
**Fase do plano 117:** Fase 1 — Notificações externas  
**Componentes alterados:** API, web, docs (sem package pfSense)  
**Versões antes:** API `0.6.4` · web `1.4.5` · package `0.4.7`  
**Versões depois:** API `0.6.4` · web `1.4.5` · package `0.4.7` (sem bump de versão nesta entrega)

**Referências:** `docs/118-BASELINE-MELHORIAS-SEGURAS-2026-07-02.md`, `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md`

---

## Escopo entregue

### Dados (Prisma)

Tabelas aditivas:

| Tabela | Papel |
|--------|-------|
| `notification_channels` | Canal (email/webhook/telegram), config pública JSON, segredos cifrados |
| `notification_rules` | Roteamento por severidade, tipo de alerta, cliente opcional |
| `notification_deliveries` | Histórico idempotente por alerta+canal+abertura |

Migration: `20260702120000_notification_channels`

### API (`/api/v1/notifications`)

| Método | Rota | Permissão |
|--------|------|-----------|
| GET | `/status` | `notifications.view` |
| GET/POST/PATCH/DELETE | `/channels`, `/channels/:id` | view / manage |
| POST | `/channels/:id/test` | `notifications.test` |
| GET/POST/PATCH/DELETE | `/rules`, `/rules/:id` | view / manage |
| GET | `/deliveries?alert_id=` | `notifications.view` |

**Dispatcher:** disparo assíncrono quando alerta abre ou reabre (ingest + lifecycle). Idempotência via `idempotency_key`.

**Providers:** webhook HTTP, Telegram Bot API, SMTP básico.

### Feature flags (env)

| Variável | Default | Efeito |
|----------|---------|--------|
| `NOTIFICATIONS_ENABLED` | `false` | Liga/desliga dispatcher |
| `NOTIFICATIONS_MAX_ATTEMPTS` | `3` | Tentativas por entrega |
| `NOTIFICATIONS_RETRY_DELAY_MS` | `5000` | Backoff entre retries |

Documentado em `.env.api.example`.

### RBAC

Permissões novas (migration + `permission-keys.ts`):

- `notifications.view`
- `notifications.manage`
- `notifications.test`

Concedidas a `superadmin` e `admin` na migration.

### Auditoria (`audit_logs`)

Ações registradas:

- `notifications.channel.create|update|delete|test`
- `notifications.rule.create|update|delete`

Segredos **nunca** retornados na API após salvos (`has_secrets` + mascaramento em `config_public`).

### Painel web

- Rota: `/admin/notificacoes` (menu Administração → Notificações)
- CRUD completo de canais e regras (formulários inline, confirmação de delete)
- Teste de canal (server action + CSRF)
- Histórico das últimas 100 entregas
- RBAC refletido no menu (`route-policy.ts`) e na página

---

## O que não foi entregue

| Item | Motivo |
|------|--------|
| Bump semver API/web | Entrega aditiva atrás de feature flag; versão mantida |
| Entregas no detalhe do alerta (`/nodes/[id]` ou `/alerts`) | Fora do escopo mínimo; endpoint `GET /deliveries?alert_id=` já existe |
| Smoke automatizado dedicado a notificações | Suite existente não estendida nesta sessão |
| Validação SMTP/Telegram em produção | Exige credenciais reais do operador |
| `NOTIFICATIONS_ENABLED=true` em produção | Decisão operacional; default permanece `false` |

---

## Impacto

| Área | Impacto |
|------|---------|
| API | Novo módulo; hooks em ingest/lifecycle **não alteram** contrato de alertas |
| Banco | Migration aditiva; sem breaking change |
| UI | Nova página admin |
| Package/agente | Nenhum |
| Operação | Redeploy API/web necessário para runtime |

---

## Rollback

1. `NOTIFICATIONS_ENABLED=false` (ou omitir env) — dispatcher inerte; alertas internos intactos
2. Remover canais/regras via UI ou API se desejado
3. Reversão de schema exigiria fase própria (tabelas aditivas podem permanecer inertes)

---

## Testes executados

| Teste | Resultado |
|-------|-----------|
| `npm run build` (API) | OK |
| `npm run build` (web) | OK |
| `node --test apps/api/test/notification-rule-matcher.test.mjs` | OK (3/3) |
| `docker compose build api web && up -d` | OK |
| `prisma migrate deploy` (container) | OK — 22 migrations, sem pendências |
| `GET /healthz` | 200 |
| `GET /api/v1/notifications/status` (sem sessão) | 401 (rota registrada) |

**Smoke suite completa:** não reexecutada nesta sessão (baseline doc 118 registra falha pré-existente em `smoke-agent-release.sh`).

---

## Redeploy (2026-07-02)

```bash
cd /Dados/Monitor-Pfsense
docker compose build api web
docker compose up -d api web
docker compose exec -T api npx prisma migrate deploy
```

Resultado: containers `api` e `web` recriados e healthy; migration `20260702120000_notification_channels` registrada (aplicada previamente no DB + incluída na imagem).

---

## Evidências operacionais

Para habilitar envios reais em homologação:

1. Definir `NOTIFICATIONS_ENABLED=true` em `.env.api` (container api)
2. Reiniciar API: `docker compose up -d api`
3. Cadastrar canal webhook apontando para receptor local (ex.: `nc -l` ou RequestBin)
4. Criar regra wildcard (sem filtros) ligada ao canal
5. Provocar alerta (ex.: parar agente → heartbeat_missing) ou usar **Testar** no canal

---

## Próximo passo

1. **Fase 2** do plano 117 — Dashboard frota e matriz de versões
2. Opcional: entregas por alerta no detalhe do firewall; smoke `notifications` na suite
3. Rollout operacional: validar SMTP/Telegram com credenciais reais antes de `NOTIFICATIONS_ENABLED=true` em produção

---

*Entrega Fase 1 — plano de melhorias seguras. Feature flag default desligada.*
