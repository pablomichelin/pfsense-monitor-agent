# 163 — Backup habilitado por padrão + correção pedido remoto

**Data:** 2026-08-01  
**Versões:** package pfSense **`0.5.8`** · painel **`1.10.9`** · API `0.10.3` (sem mudança)

## Motivo

Pedidos de backup pelo portal expiravam sem `error_message` em praticamente toda a frota: o package vinha com `config_backup_enabled` **off** por padrão, e o agente descartava `config_backup_now` em silêncio.

Diretriz operacional: backup (agendado + remoto) deve nascer **ligado**, para o operador poder requisitar `config.xml` no momento necessário sem ir em cada pfSense.

## Achados

1. **57/57** nodes reportavam `config_backup_policy_json.enabled = false`.
2. **21** comandos `config_backup_now` expiraram sem ack (`picked_up` nunca ocorreu).
3. Backups **scheduled** ainda chegavam porque `backup_scheduled` usava `if ! backup_should_run_scheduled`, invertendo a convenção 0=pular / 1=executar (o guard `on_change` dentro de `backup_config_now` limitava o flood).

## Mudanças — package `0.5.8`

1. Default `config_backup_enabled` = `on` em `systemup_monitor_defaults()` (mesmo padrão do `technician_accounts_enabled`).
2. Runtime/upgrade/bootstrap: normalize e `install.sh` passam a default **yes**.
3. Fallback do shell: `MONITOR_AGENT_CONFIG_BACKUP_ENABLED` ausente → ligado (`:-1`).
4. Pedido remoto recusado agora reporta falha:
   - `config backup disabled on agent`
   - `remote backup requests disabled on agent`
5. Correção do caller de `backup_scheduled` (remove o `!` que invertia skip/run).
6. GUI/XML: texto indicando padrão ligado; checkbox de backup com normalize default `on`.

## Mudanças — painel `1.10.9`

- Mensagens PT-BR para os erros acima na aba Backup do node.
- Seletor de install: padrão passa a ler **habilitado**; labels Ligado / Desligado.

## Upgrade / rollout

Após upgrade para **0.5.8**, `apply_defaults` + sync regeneram o `.conf` do agente: nós com chave vazia/ausente passam a ter backup **ligado** (e aceitar remoto, que já era default `on`).

```bash
# no controlador, após publicar artefato:
# upgrade remoto pela coluna Pacote em /nodes, ou lote package_upgrade
```

## Artefato

- `dist/pfsense-package/monitor-pfsense-package-v0.5.8.tar.gz`
- SHA256 em `config/package-release.env`

## Verificação

```bash
./scripts/test-backup-schedule-logic.sh
# Após rollout em um node: heartbeat com config_backup.enabled=true
# Solicitar backup no portal → succeeded (não Expirou)
```
