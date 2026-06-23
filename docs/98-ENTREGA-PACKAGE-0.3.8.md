# 98 — Entrega: package pfSense 0.3.8 (Opção D + Fase 3 P2)

**Data:** 2026-06-23  
**Package pfSense:** `0.3.8` (anterior `0.3.7`)  
**Escopo:** Fase 2.2 `pfsense_upgrade` (spike + impl semi-manual), Fase 3.1 `node_secret` runtime, Fase 3.2 docs/backup fields XML

## Resumo

Release que substitui o stub imediato de `pfsense_upgrade` por fluxo honesto com pré-checks (HA, disco, `target_version`), wrapper `run_pfsense_upgrade.sh`, state `pfsense-upgrade-pending.json` e flag `MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=0` (default). Migra `node_secret` para `/var/db/monitor-pfsense-agent/node_secret`, adiciona fields XML (heartbeat + backup) e guia operacional unificado.

## Fase 2.2 — `pfsense_upgrade`

| Item | Implementação |
|------|----------------|
| Spike CE | `docs/97-SPIKE-PFSENSE-UPGRADE-CE.md` (procedimentos lab; sem VM nesta sessão) |
| Wrapper | `run_pfsense_upgrade.sh` — `pfSense-upgrade -d`, log dedicado |
| Dispatch | HA block, disco ≥90%, mismatch target; ack running; spawn background |
| State | `pfsense-upgrade-pending.json` até `finalize_pfsense_upgrade_if_pending` |
| Flag agente | `MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=0` default |
| Semi-manual | State `prepared_manual_confirm`; **sem** failed imediato se spawn OK |

## Fase 3.1 — `node_secret` runtime

| Item | Implementação |
|------|----------------|
| Arquivo canônico | `/var/db/monitor-pfsense-agent/node_secret` (0600) |
| Migração | copy-on-read do XML legado; limpa `node_secret` + `secret_stored=on` |
| Bootstrap/CLI | `store_node_secret()` no seed |
| GUI | Diagnóstico: **configurado** mascarado |
| Uninstall | Remove secret file |

## Fase 3.2 — Docs + backup fields XML

- Fields XML: `heartbeat_mode`, `secret_stored`, `config_backup_*`
- `backup_systemup_monitor.php` documentado como thin wrapper
- Guia: `docs/pfsense-package/00-GUIA-OPERACAO-PACKAGE.md`
- Runbook ISPConfig 253: `docs/95-RUNBOOK-ISPConfig-253-BACKUP-LIMIT.md`

## Versionamento

| Local | Valor |
|-------|-------|
| `Makefile` `PORTVERSION` | `0.3.8` |
| `SYSTEMUP_MONITOR_AGENT_VERSION` | `0.3.8` |
| `config/package-release.env` | `0.3.8` |
| `.cursor/rules/versioning.mdc` | `0.3.8` |

## Artefato de release

| Item | Valor |
|------|-------|
| Arquivo | `dist/pfsense-package/monitor-pfsense-package-v0.3.8.tar.gz` |
| SHA256 | `ef0cabb5744ec4328d71af754811d80fc98e021e3d29f114010614b2f68e9f78` |
| Gerado em | 2026-06-23 (`./scripts/release-pfsense-package.sh --no-push`) |
| Publicado | _(commit após push)_ |

## Testes executados (host dev)

```text
php -l systemup_monitor.inc, systemup_monitor_cli.php     → OK
sh -n monitor-pfsense-agent.sh, run_pfsense_upgrade.sh  → OK
php scripts/test-node-secret-migration.php                → OK
bash scripts/test-pfsense-upgrade-dispatch.sh             → OK
bash scripts/test-backup-schedule-logic.sh                → OK
bash scripts/smoke-agent-release.sh                       → OK
bash scripts/smoke-pfsense-upgrade-command.sh             → OK
./scripts/release-pfsense-package.sh --no-push            → OK
```

## Pendências operacionais (lab / operador)

| Item | Ação |
|------|------|
| Flags não assistidas CE | Preencher matriz em `docs/97-SPIKE-*` |
| `MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=1` | Só após lab confirmar flags |
| Deploy piloto 0.3.8 | Checklist guia operação §7 |
| Gateways reais / alertas WAN | Piloto pfSense |
| Regressão VPN/NAT pós-merge service | Piloto 5+ min loop |
| `pkg delete` limpeza completa | Piloto pfSense |
| ISPConfig **253** SSH | Runbook `docs/95-RUNBOOK-ISPConfig-253-*` |

## Próximo passo sugerido

1. VM CE 2.8.1: spike experimentos §97
2. Piloto package 0.3.8 + validar migração `node_secret`
3. Habilitar `PFSENSE_UPGRADE_ENABLED` + fluxo semi-manual end-to-end
