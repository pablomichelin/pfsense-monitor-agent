# 95 — Entrega: package pfSense 0.3.6 (Opção A / P0)

**Data:** 2026-06-23  
**Package pfSense:** `0.3.6` (anterior `0.3.5`)  
**Escopo:** Fase 1.1 (merge cirúrgico `installedpackages.service`) + Fase 1.2 (backoff backup) + Fase 4.4 (metadados)

## Resumo

Release P0 que completa a correção iniciada em 0.3.5: persistência segura do `config.xml` agora também no snapshot de serviços rc.d (upsert só `monitor_pfsense_agent`), o agente deixa de martelar o controlador quando upload de backup falha (502/timeout/auth), e metadados do package deixam de exibir "scaffold".

## Fase 1.1 — Merge cirúrgico `installedpackages.service`

### Problema

`systemup_monitor_export_package_snapshot()` / `import_package_snapshot()` ainda copiavam o array completo `installedpackages.service`, podendo remover serviços de outros packages quando o snapshot estava stale.

### Correção

- **Export:** chave `monitor_service_entry` (somente entrada `monitor_pfsense_agent`); removido `service_entries` legado.
- **Import:** upsert via `systemup_monitor_register_service()` ou `systemup_monitor_unregister_service()` quando `remove_monitor_service`; compatibilidade com snapshots 0.3.5 que ainda trazem `service_entries` (extrai só nossa entrada).
- **`systemup_monitor_unregister_service()`:** inalterado em comportamento — já removia só nossa entrada.

### Arquivos

- `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc`

## Fase 1.2 — Backoff no upload de backup

### Problema

Com agendamento vencido e infra instável (502), o loop de 30s executava `backup-scheduled` a cada ciclo, martelando o controlador.

### Correção

- Estado em `/var/db/monitor-pfsense-agent/backup-upload-backoff.json`
- `classify_upload_error`: classes `upstream`, `timeout`, `auth`, `client`, `success`
- Exponential backoff com jitter ±10% (502/upstream: base 5 min, teto 6 h)
- `backup_should_run_scheduled()` respeita `next_attempt_at`
- `config_backup_now` com `command_id` **não** passa por `backup_should_run_scheduled` — bypass para operador
- Log estruturado: `backup-backoff class=... http=... next=...`
- Sucesso limpa backoff (`backup_backoff_clear`)

### Arquivos

- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh`

## Fase 4.4 — Metadados

- `info.xml`: descr sem "scaffold"
- `pkg-descr`: expandido (funcionalidades, CE 2.8.1+, link docs)
- `Makefile` `COMMENT=` alinhado

## Versionamento

| Local | Valor |
|-------|-------|
| `packages/pfsense-package/Makefile` `PORTVERSION` | `0.3.6` |
| `SYSTEMUP_MONITOR_AGENT_VERSION` | `0.3.6` |
| `config/package-release.env` | `0.3.6` |
| `.cursor/rules/versioning.mdc` | `0.3.6` |

## Artefato de release

| Item | Valor |
|------|-------|
| Arquivo | `dist/pfsense-package/monitor-pfsense-package-v0.3.6.tar.gz` |
| SHA256 | `a1a6c34f271e54705d6a49a7d4d1aabfa3a7536c1fd69e2956462a446ed2e78e` |
| Gerado em | 2026-06-23 (`./scripts/release-pfsense-package.sh --no-push`) |

`config/package-release.env` atualizado automaticamente pelo script de release.

## Testes executados (host dev)

```text
php scripts/test-service-merge-snapshot.php     → OK (10 cenarios)
bash scripts/test-backup-schedule-logic.sh      → OK (incl. backoff agendado)
bash scripts/test-backup-backoff.sh             → OK (classify, 502~5min, blocks/clear)
sh -n .../monitor-pfsense-agent.sh              → OK
php -l .../systemup_monitor.inc                 → OK
```

## Critérios de aceite (dev)

| Critério | Status |
|----------|--------|
| Merge service não substitui array inteiro | OK (test PHP) |
| Backoff 502 → ~5 min inicial | OK (test shell) |
| `config_backup_now` bypass backoff | OK (código + grep test) |
| info.xml/pkg-descr sem "scaffold" | OK |
| Versão 0.3.6 bumped | OK |

## Pendências (operacionais — fora desta sessão)

- [x] Gerar artefato: `./scripts/release-pfsense-package.sh --no-push` (2026-06-23)
- [ ] Publicar release (commit/push `config/package-release.env` + artefato; redeploy API se necessário)
- [ ] Deploy piloto em pfSense CE 2.8.1+ (VPN/NAT intactos após 5+ min de loop)
- [ ] Configuration History sem remoção de serviços de terceiros (validação em firewall real)
- [ ] Fase 0 infra ISPConfig (502/413) — checklist separado, não implementado aqui
- [ ] Fase 4.3 heartbeat HTTP errors — P1, não incluído em 0.3.6

## Rollout sugerido

1. Publicar artefato (commit/push ou `./scripts/release-pfsense-package.sh` sem `--no-push`)
2. Atualizar package nos firewalls afetados (GUI ou `install-from-release.sh`)
3. Após update: `php .../systemup_monitor_cli.php sync`
4. Monitorar logs: `grep backup-backoff /var/log/monitor-pfsense-agent.log`

## Referências

- Plano: `docs/94-PLANO-MELHORIAS-PACKAGE-0.3.6.md`
- Contexto 0.3.5: `docs/92-ENTREGA-CORRECAO-WRITE-CONFIG-SEGURO-2026-06-23.md`
