# 157 — Package 0.5.5: gestão de técnicos habilitada por padrão

**Data:** 2026-08-01  
**Versões:** package pfSense **`0.5.5`** · painel `1.10.5` (mensagem de erro) · API `0.10.1` (sem mudança de contrato)

## Motivo

No teste de provisionamento em `firewall.voner.br`, o agente recusou com `technician accounts disabled on agent`. A flag `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED` vinha **off por default** e **não havia checkbox** na GUI do package — só era possível ligar via PHP manual.

Diretriz operacional: a gestão de técnicos deve estar **habilitada por padrão**.

## Mudanças no package 0.5.5

1. Default `technician_accounts_enabled` = `on` em `systemup_monitor_defaults()`.
2. Runtime do agente: `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED` gerado com default **ligado** (`normalize_yes_no(..., 'on')`).
3. Shell do agente: fallback `${MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED:-1}` (antes `:-0`).
4. Checkbox na GUI `Services > SystemUp Monitor`: **Gestao de tecnicos (usuarios locais)** — visível e configurável; padrão ligado após sync/upgrade.

## Upgrade

Após upgrade remoto/manual para **0.5.5**, o `install.sh` regenera o config do agente (`sync`) e aplica defaults — nós que não tinham a chave passam a ter a flag **ligada** sem comando PHP.

## Artefato

- `dist/pfsense-package/monitor-pfsense-package-v0.5.5.tar.gz`
- SHA256 em `config/package-release.env`
