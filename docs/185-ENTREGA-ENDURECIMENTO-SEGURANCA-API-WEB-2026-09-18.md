# 185 — Entrega: endurecimento de segurança API + web (2026-09-18)

## Escopo

Lote de correções de segurança no controlador, sem mudança no package pfSense (nenhum arquivo de agente tocado — não há upgrade de frota nesta entrega).

## Mudanças

1. **Proteção zip-bomb no ingest de backup** (`apps/api/src/backups/backups-ingest.service.ts`)
   - Rejeita payload gzip antes de descomprimir quando o tamanho declarado (`X-Config-Size`) excede `CONFIG_BACKUP_MAX_BYTES` (default 5 MB) → `413`.
   - `gunzipSync` agora com `maxOutputLength` limitado ao mesmo teto.
   - Mensagem de erro unificada para gzip inválido/oversized.

2. **Fail-fast de configuração de proxy** (`apps/api/src/config/app-config.ts`)
   - `TRUSTED_PROXY_IPS` definida com `TRUST_PROXY=false` agora derruba o boot com erro explícito, em vez de ignorar silenciosamente a allowlist.

3. **Fail-closed no middleware web** (`apps/web/middleware.ts`)
   - `MONITOR_API_BASE_URL` agora é obrigatória (sem fallback `127.0.0.1:8088`).
   - Erro de rede com a API retorna `503` + `Retry-After: 30`, em vez de deixar passar requisição com cookie de sessão stale.

## Versões

- API `0.11.1` → `0.11.2`
- Painel web `1.12.6` → `1.12.7`
- Package pfSense: **0.5.20 (sem mudança)**

## Validação

- `tsc --noEmit` limpo em `apps/api` e `apps/web`.
- `npm run build` do web concluído (middleware 35.6 kB).

## Deploy

Rebuild dos containers `api` e `web` (`docker compose build api web && up -d`). Nenhuma migração de banco.