# Runbook operador — ISPConfig 253 (backup limit nginx)

**Host:** `192.168.100.253` (ISPConfig / nginx público)  
**Status (2026-06-23):** checklist Fase 0 item **253 SSH pendente** — validação completa no **221** + HTTPS público OK ([`docs/95-ENTREGA-INFRA-BACKUP-LIMIT-2026-06-23.md`](95-ENTREGA-INFRA-BACKUP-LIMIT-2026-06-23.md))

---

## Quando executar

- Upload de backup retorna **502** ou **413** via `https://pfs-monitor.systemup.inf.br` mas LAN `192.168.100.221:3031` funciona.
- Após alteração de vhost ISPConfig para o domínio Monitor-Pfsense.

---

## Pré-requisitos

- Acesso SSH `root@192.168.100.253`
- Snippet referência: [`infra/ispconfig/nginx.monitor-pfsense.conf`](../../infra/ispconfig/nginx.monitor-pfsense.conf)
- Script idempotente: [`scripts/ispconfig-apply-monitor-backup-limit.sh`](../../scripts/ispconfig-apply-monitor-backup-limit.sh)

---

## Procedimento

### 1. Copiar script (de estação com acesso)

```bash
scp /Dados/Monitor-Pfsense/scripts/ispconfig-apply-monitor-backup-limit.sh root@192.168.100.253:/tmp/
```

### 2. No host 253

```bash
ssh root@192.168.100.253
bash /tmp/ispconfig-apply-monitor-backup-limit.sh
nginx -t && systemctl reload nginx
```

### 3. Verificar location backup

```bash
VHOST=$(grep -RIl 'server_name.*pfs-monitor.systemup.inf.br' /etc/nginx /usr/local/ispconfig/server/nginx/conf /var/www/conf/nginx 2>/dev/null | head -1)
grep -A8 'location = /api/v1/ingest/config-backup' "$VHOST"
```

**Critério:** `client_max_body_size 5m;` e timeouts proxy ≥ 120s.

### 4. Teste externo (estação com rede)

```bash
cd /Dados/Monitor-Pfsense
BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-config-backup-upload-limit.sh
./scripts/smoke-config-backup-api.sh
```

---

## Evidência

Registrar saída de `nginx -t`, trecho do vhost e script verify em novo bullet em `docs/95-ENTREGA-INFRA-BACKUP-LIMIT-2026-06-23.md` ou anexo operador.

---

## Rollback

Restaurar backup do vhost ISPConfig (`.bak` criado pelo script apply) e `systemctl reload nginx`.
