# Guia de operação — package pfSense SystemUp Monitor

**Package:** `pfSense-pkg-systemup-monitor`  
**Versão de referência:** `0.4.7` (release publicada em `config/package-release.env`)  
**Runtime:** agente em `/usr/local/libexec/monitor-pfsense-agent/`

---

## Índice

1. [Instalação e bootstrap](#1-instalação-e-bootstrap)
2. [Configuração (GUI pfSense)](#2-configuração-gui-pfsense)
3. [Node secret (runtime)](#3-node-secret-runtime)
4. [Heartbeat normal vs light](#4-heartbeat-normal-vs-light)
5. [Backup de config.xml](#5-backup-de-configxml)
6. [Atualização do package](#6-atualização-do-package)
7. [Upgrade pfSense OS (remoto)](#7-upgrade-pfsense-os-remoto)
8. [Diagnóstico e logs](#8-diagnóstico-e-logs)
9. [Desinstalação](#9-desinstalação)

---

## 1. Instalação e bootstrap

- Comando gerado pelo painel Monitor-Pfsense (node cadastrado → aba Configuração).
- Alternativa servidor: `./scripts/generate-install-command.sh <NODE_UID> [normal|light]`
- Procedimento detalhado: [`docs/INSTALACAO-AGENTE-PFSENSE.md`](../INSTALACAO-AGENTE-PFSENSE.md)

**Artefato:** tarball `monitor-pfsense-package-vX.Y.Z.tar.gz` via GitHub raw ou endpoint `/api/v1/agent/package-release`.

---

## 2. Configuração (GUI pfSense)

**Services → SystemUp Monitor**

| Aba | Função |
|-----|--------|
| Configuração | URL controlador, node UID, customer code, serviços, heartbeat mode |
| Diagnóstico | Status runtime, último erro heartbeat, comandos úteis |
| Backup | Agendamento e envio manual de `config.xml` |

Campos persistentes estão em `systemup_monitor.xml` (incl. backup e `heartbeat_mode`).

---

## 3. Node secret (runtime)

| Item | Valor |
|------|-------|
| Arquivo canônico | `/var/db/monitor-pfsense-agent/node_secret` (0600, root) |
| XML | `secret_stored=on`; campo `node_secret` vazio após bootstrap/migração |
| GUI Diagnóstico | Exibe **configurado** (mascarado) |
| Rotação | Rekey no painel → novo comando bootstrap/install |

**Migração:** instalações legadas com secret no XML migram automaticamente (copy-on-read) no primeiro `sync`.

**Atenção:** backup nativo `config.xml` do pfSense ainda contém metadados do package — proteger backups pfSense.

---

## 4. Heartbeat normal vs light

| Modo | Payload |
|------|---------|
| **normal** | Métricas + serviços + gateways |
| **light** | Métricas essenciais; API mantém último estado de gateways/serviços |

Definido em `--heartbeat-mode` no bootstrap ou field `heartbeat_mode` no XML.

Env runtime: `MONITOR_AGENT_LIGHT_HEARTBEAT=1` em `/usr/local/etc/monitor-pfsense-agent.conf`.

---

## 5. Backup de config.xml

- Habilitar na aba **Backup** ou fields XML `config_backup_*`.
- Agendamentos: hours / daily / weekly / monthly.
- Opções: somente se mudou (hash), gzip, aceitar `config_backup_now` remoto.
- Estado local: `/var/db/monitor-pfsense-agent/backup-*.json`
- Especificação: [`docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`](../64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md)

---

## 6. Atualização do package

**Release alvo:** definida em `config/package-release.env` no controlador (hoje **`0.4.7`**).

| Canal | Uso |
|-------|-----|
| GUI pfSense | Botão **Atualizar** na aba Configuração |
| CLI local | `php .../systemup_monitor_cli.php upgrade [--force]` |
| Painel Monitor-Pfsense | Aba Visão geral → **Atualizar package remotamente** (agente ≥ **0.4.6**, permissão `package.upgrade.run`) |
| API | `POST /api/v1/nodes/:id/package-upgrade/request` |

Guia completo do fluxo remoto: [`docs/114-UPGRADE-REMOTO-PACKAGE.md`](../114-UPGRADE-REMOTO-PACKAGE.md).

- Secret do update via arquivo temporário (não argv).
- Rate limit GUI: 1 update / 24h (bypass `--force`).

### Troubleshooting — upgrade de 0.3.5 falha com `Refusing --node-secret`

**Sintoma:** `/tmp/monitor-update.log` contém:

```text
Refusing --node-secret on command line; use MONITOR_UPDATE_NODE_SECRET or --secret-file.
```

**Causa:** package **0.3.5** (ou anterior) montava update com `--node-secret` na linha de comando; o instalador baixado do controlador/GitHub (0.3.7+) recusava esse argumento — caminho GUI quebrado até hotfix **0.3.9** do `install-from-release.sh` em `main`.

**Resolução:**

1. Após push do hotfix no repositório, **retentar o botão Atualizar** na GUI (o instalador é baixado de novo a cada tentativa).
2. Se persistir, usar workaround SSH (§ abaixo ou `docs/99-HOTFIX-UPGRADE-0.3.5-NODE-SECRET.md`).

Doc: [`docs/COMANDO-ATUALIZAR-PACKAGE-PFSENSE.md`](../COMANDO-ATUALIZAR-PACKAGE-PFSENSE.md)

### Troubleshooting — tarball OK mas `AGENT_VERSION` permanece 0.3.5

**Sintoma:** log de update mostra download ~48 kB e `Config do agente regenerado (AGENT_VERSION=0.3.5)` após hotfix do instalador.

**Causa:** `install.sh` copiava o tarball, mas o PHP do pfSense (opcache + `install_package_xml`) mantinha `systemup_monitor.inc` stale — corrigido em **0.3.10**.

**Resolução:** retentar update após release **0.3.10** no controlador, ou workaround SSH em `docs/99-HOTFIX-UPGRADE-0.3.5-NODE-SECRET.md` (sync com `opcache.enable_cli=0`).

---

## 7. Upgrade pfSense OS (remoto)

- Painel: aba Visão geral → **Atualizar pfSense** (RBAC `pfsense.upgrade.run`).
- API flag: `PFSENSE_UPGRADE_ENABLED=true` no controlador.
- Agente flag: `MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=0` (default até lab CE).

**Fluxo operacional atual:**

> Base entregue na trilha `0.3.8` e ainda valida na release `0.4.7`.

1. Comando enfileirado → ack `running`
2. Agente executa `pfSense-upgrade -d` (prepara repositórios)
3. Operador confirma manualmente em **System → Update → Confirm**
4. Pós-reboot: agente finaliza via `/conf/upgrade_log.latest.txt`

Spike / lab: [`docs/97-SPIKE-PFSENSE-UPGRADE-CE.md`](../97-SPIKE-PFSENSE-UPGRADE-CE.md)

---

## 7.1 Ações operacionais allowlistadas (package ≥ **0.4.8**)

Comandos via heartbeat — **sem shell remoto**.

| Comando | Allowlist / regras |
|---------|-------------------|
| `service_restart` | `monitor_pfsense_agent`, `unbound`, `dhcpd`, `ntpd`, `dpinger` |
| `node_reboot` | Atraso 30–600s; resultado enviado antes do reboot |

**Controlador:** `OPERATIONAL_ACTIONS_ENABLED=true` (+ sub-flags). RBAC: `service.restart.run`, `node.reboot.run`.

**Agente:** `MONITOR_AGENT_OPERATIONAL_ACTIONS_ENABLED=1`, `MONITOR_AGENT_SERVICE_RESTART_ENABLED=1`, `MONITOR_AGENT_NODE_REBOOT_ENABLED=1` no `.conf` (defaults `0`).

Log: `/var/log/monitor-pfsense-agent-operational.log` · Entrega: [`docs/126-ENTREGA-ACOES-OPERACIONAIS-2026-07-02.md`](../126-ENTREGA-ACOES-OPERACIONAIS-2026-07-02.md)

---

## 8. Diagnóstico e logs

| Recurso | Caminho |
|---------|---------|
| Log agente | `/var/log/monitor-pfsense-agent.log` |
| Log upgrade OS | `/var/log/monitor-pfsense-agent-upgrade.log` |
| Log update package | `/tmp/monitor-update.log` |
| Estado heartbeat erro | `/var/db/monitor-pfsense-agent/last-heartbeat-error.json` |
| Cache update OS | `/var/db/monitor-pfsense-agent/pfsense-update-check.json` |

Scripts servidor: `scripts/diagnose-agent-gateways-pfsense.sh` (no pfSense).

---

## 9. Desinstalação

```bash
pkg delete pfSense-pkg-systemup-monitor
# ou bootstrap/uninstall.sh
```

Remove serviço rc.d, libexec, runtime conf e `node_secret` (documentar backup prévio se necessário).

---

## Referências cruzadas

- Historico da trilha 0.3.x: `docs/94-PLANO-MELHORIAS-PACKAGE-0.3.6.md`, `docs/98-ENTREGA-PACKAGE-0.3.8.md`
- Hotfix historico upgrade 0.3.5: `docs/99-HOTFIX-UPGRADE-0.3.5-NODE-SECRET.md`
- CORTEX: [`CORTEX.md`](../../CORTEX.md)
