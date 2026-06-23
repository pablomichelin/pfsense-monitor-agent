# Entrega Fase 0 — limite de upload backup (ISPConfig + compose)

**Data:** 2026-06-23  
**Plano:** [`docs/94-PLANO-MELHORIAS-PACKAGE-0.3.6.md`](94-PLANO-MELHORIAS-PACKAGE-0.3.6.md) — Opção B (infra)  
**Escopo:** validar cadeia proxy/nginx para `/api/v1/ingest/config-backup` (5m, timeouts, health) **sem** deploy piloto pfSense.

## Resumo executivo

| Resultado | Detalhe |
|-----------|---------|
| Host compose `192.168.100.221` | Stack saudável; healthz LAN/localhost/público **200** |
| Teste limite HTTPS | `verify-config-backup-upload-limit.sh` **OK** (payload 100 KiB → HTTP 400, não 413/502) |
| Smoke backup API | `smoke-config-backup-api.sh` **OK** via `https://pfs-monitor.systemup.inf.br` |
| Host ISPConfig `192.168.100.253` | **Não verificado in situ** — SSH `root@192.168.100.253` bloqueado (`Permission denied`) neste ambiente |
| Release package | **0.3.6** publicada no Git (`6a4a6ed`) — ver Parte A abaixo |

## Evidências — host compose (`192.168.100.221`)

Executado em **2026-06-23** no próprio host (hostname `IA`, IP `192.168.100.221`).

```text
docker compose ps  → api, web, db, nginx Up (healthy)
curl http://192.168.100.221:3031/healthz     → 200
curl http://127.0.0.1:8088/healthz           → 200
curl https://pfs-monitor.systemup.inf.br/healthz → 200
```

- **Nginx interno** (`infra/nginx/default.conf`): `location = /api/v1/ingest/config-backup` com `client_max_body_size 5m`, `proxy_read_timeout` / `proxy_send_timeout` **120s** — conferido no repositório e alinhado ao snippet versionado.
- **Volume backups:** `compose.yaml` monta `./data/pfsense-config-backups` → `/app/data/pfsense-config-backups`.
- **Chave criptografia:** `BACKUP_ENCRYPTION_KEY_BASE64` presente em `.env.api` (valor não registrado neste doc).

### Scripts

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-config-backup-upload-limit.sh
# Limite de upload da rota de backup OK. (HTTP 400 para payload de teste — aceitável)

BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/smoke-config-backup-api.sh
# smoke-config-backup-api OK backup_uid=cfgb_20260623T140521Z_b04fd730
```

## Checklist Fase 0.2 — ISPConfig (`192.168.100.253`)

Referência versionada: [`infra/ispconfig/nginx.monitor-pfsense.conf`](../infra/ispconfig/nginx.monitor-pfsense.conf)  
Automação: [`scripts/ispconfig-apply-monitor-backup-limit.sh`](../scripts/ispconfig-apply-monitor-backup-limit.sh)

| # | Verificação | Status | Evidência / observação |
|---|-------------|--------|-------------------------|
| 1 | Vhost `pfs-monitor.systemup.inf.br` | **Indireto OK** | Domínio público responde 200 em `/healthz` e rota backup passa teste de limite |
| 2 | Upstream `http://192.168.100.221:3031` | **Indireto OK** | Cadeia pública funcional; snippet repo define `set $monitor_origin` correto |
| 3 | `client_max_body_size 5m` na rota backup | **Indireto OK** | `verify-config-backup-upload-limit.sh` verde via HTTPS (sem 413) |
| 4 | Limite global 64k + override backup | **Repo OK** | Snippet ISPConfig documenta global `64k` + location `5m` |
| 5 | Timeouts proxy backup ≥ 120s | **Repo OK** | Snippet; não inspecionado no vhost real (253 inacessível) |
| 6 | Timeouts gerais location `/` ≥ 300s | **Repo OK** | Snippet |
| 7 | Headers Cloudflare | **Repo OK** | `CF-Connecting-IP`, `X-Forwarded-Proto https`, `X-Forwarded-Port 443` no snippet |
| 8 | `nginx -t` | **Pendente operador** | Requer SSH em 253 |
| 9 | `systemctl reload nginx` | **Pendente operador** | Requer SSH em 253 |
| 10 | Script `ispconfig-apply-monitor-backup-limit.sh` | **Pendente operador** | Copiar/executar em 253 se vhost divergir do snippet |

### Bloqueador manual

```text
ssh -o BatchMode=yes root@192.168.100.253
→ Permission denied (publickey,password)
```

**Ação sugerida:** operador com acesso ao 253 executar checklist 8–10 e anexar saída de `grep -A6 'location = /api/v1/ingest/config-backup'` no vhost efetivo.

## Checklist Fase 0.3 — compose (221)

| # | Verificação | Status |
|---|-------------|--------|
| 1 | Stack saudável | **OK** |
| 2 | Health LAN `:3031` | **OK** (200) |
| 3 | Health localhost `:8088` | **OK** (200) |
| 4 | Limite backup nginx interno | **OK** (repo + stack ativa) |
| 5 | Volume backups montado | **OK** |
| 6 | Chave criptografia | **OK** (presente, não logada) |
| 7 | Teste limite upload HTTPS | **OK** |

## Critério de aceite 0.5 (plano 94)

- [x] `verify-config-backup-upload-limit.sh` verde via HTTPS público
- [x] Smoke backup API 2xx em fluxo válido (node provisionado no smoke)
- [x] Evidência documentada neste arquivo
- [ ] Conferência **in situ** do vhost ISPConfig (253) — **pendente SSH**

## Parte A — release 0.3.6 (referência)

| Item | Valor |
|------|--------|
| Repositório | `https://github.com/pablomichelin/pfsense-monitor-agent` |
| Branch | `main` |
| Commit | `6a4a6ed` |
| Artefato | `dist/pfsense-package/monitor-pfsense-package-v0.3.6.tar.gz` |
| SHA256 | `a1a6c34f271e54705d6a49a7d4d1aabfa3a7536c1fd69e2956462a446ed2e78e` |
| Raw bootstrap | `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/dist/pfsense-package/monitor-pfsense-package-v0.3.6.tar.gz` |

## Próximo passo

1. Operador: validar/aplicar snippet no **253** (itens 8–10).  
2. Trilha **Opção C / 0.3.7** no plano 94 (P1 gateways, auto-update, pkg-deinstall) — fora desta entrega.
