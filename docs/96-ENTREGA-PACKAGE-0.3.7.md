# 96 — Entrega: package pfSense 0.3.7 (Opção C / P1)

**Data:** 2026-06-23  
**Package pfSense:** `0.3.7` (anterior `0.3.6`)  
**Escopo:** Fase 2.1 (harden auto-update), 2.3 (gateways), 4.1 (cache config.xml), 4.2 (pkg-deinstall), 4.3 (heartbeat HTTP)

## Resumo

Release P1 que implementa coleta real de gateways via `gwlib`, endurece o fluxo de auto-update do package (secret fora de argv, lock, allowlist URL, SHA256 obrigatório, rate limit 24h), cache diário de `config.xml` para interfaces/IPs, desinstalação completa via `pkg-deinstall`/`remove`, e classificação graceful de falhas HTTP no heartbeat (502 vs auth vs timeout).

**Fora deste escopo (conforme plano):** `pfsense_upgrade` real, `node_secret` P2, deploy piloto pfSense, alterações Zabbix.

## Fase 2.1 — Harden auto-update

| Controle | Implementação |
|----------|-----------------|
| Secret fora de argv | `MONITOR_UPDATE_NODE_SECRET` + `--secret-file` (0600); recusa `--node-secret` em `install-from-release.sh` |
| Lock atômico | `/var/run/monitor-package-update.lock` + stale 2h |
| Allowlist URL | `systemup_monitor_validate_release_urls()` vs `controller_url` + GitHub raw |
| Pin SHA256 | Obrigatório em parse e `install-from-release.sh` |
| Log mínimo | `/tmp/monitor-update.log` sem secret; URLs truncadas |
| Rate limit | 1 update / 24h; CLI `upgrade --force` bypass |
| Pós-update | `sync` automático no `install.sh` (existente) |

## Fase 2.3 — `build_gateways_json()`

- Helper `collect_gateways.php` (gwlib `return_gateways_status`, monitor habilitado)
- Mapeamento dpinger → `online|degraded|down|unknown` + `latency_ms` / `loss_percent`
- Heartbeat light continua omitindo gateways
- Script `scripts/diagnose-agent-gateways-pfsense.sh`

## Fase 4.1 — Cache config.xml

- Cache `/var/db/monitor-pfsense-agent/config-snapshot.json` TTL 86400s
- `collect_config_snapshot.php` + `refresh_config_snapshot()` / `ensure_config_snapshot()`
- `build_interfaces_json()`, `detect_mgmt_ips()`, `detect_wan_ips()` leem cache
- Env `MONITOR_AGENT_CONFIG_SNAPSHOT_TTL_SECONDS`

## Fase 4.2 — Desinstalação pkg-deinstall

- `systemup_monitor_package_uninstall()` + `custom_php_deinstall_command` no XML
- `pkg-deinstall.in` chama CLI `remove` antes de `rc.packages`
- `bootstrap/uninstall.sh` paridade (backup www, lock, log)

## Fase 4.3 — Heartbeat HTTP

- Helper `http_post_signed_json()` compartilhado (heartbeat, test-connection, backup ack)
- Classes `upstream|timeout|auth|validation|success` via `classify_http_error`
- State `/var/db/monitor-pfsense-agent/last-heartbeat-error.json`
- GUI Diagnóstico exibe última falha classificada
- Backoff heartbeat opcional (60s–5min upstream)

## Versionamento

| Local | Valor |
|-------|-------|
| `Makefile` `PORTVERSION` | `0.3.7` |
| `SYSTEMUP_MONITOR_AGENT_VERSION` | `0.3.7` |
| `config/package-release.env` | `0.3.7` |
| `.cursor/rules/versioning.mdc` | `0.3.7` |

## Artefato de release

| Item | Valor |
|------|-------|
| Arquivo | `dist/pfsense-package/monitor-pfsense-package-v0.3.7.tar.gz` |
| SHA256 | `5f528e151e9b72ec753b59ac7aa19aa0955df394d98b518334bbc8b2d71b6696` |
| Gerado em | 2026-06-23 (`./scripts/release-pfsense-package.sh --no-push`) |

## Testes executados (host dev)

```text
php -l systemup_monitor.inc, collect_*.php          → OK
sh -n monitor-pfsense-agent.sh, install-from-release.sh → OK
bash scripts/test-config-snapshot-cache.sh          → OK
bash scripts/test-gateways-collect.sh                 → OK
php scripts/test-package-update-harden.php          → OK
bash scripts/test-backup-schedule-logic.sh            → OK (regressao backoff)
./scripts/release-pfsense-package.sh --no-push        → OK
```

## Pendências operacionais

- Deploy piloto pfSense CE 2.8.1+ e validação gateways reais no painel
- Regressão VPN/NAT pós-merge service (5+ min loop)
- Alertas `gateway_down` em WAN down simulado
- Spike CE / `pfsense_upgrade` real → trilha 0.3.8+
- `node_secret` runtime-only → P2

## Próximo passo sugerido

1. Piloto `pkg upgrade` ou bootstrap 0.3.7 em firewall lab
2. `./scripts/diagnose-agent-gateways-pfsense.sh` no pfSense
3. Opção D (spike `pfsense_upgrade` CE) quando lab disponível
