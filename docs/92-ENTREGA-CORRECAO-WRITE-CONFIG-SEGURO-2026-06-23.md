# 92 — Entrega: correção segura de persistência do config.xml (package 0.3.5)

**Data:** 2026-06-23  
**Package pfSense:** `0.3.5` (anterior `0.3.4`)

## Problema

Firewalls em produção reportaram **reversão silenciosa** de VPN, NAT, senhas e demais alterações no `config.xml`, aparentemente correlacionada à instalação do SystemUp Monitor.

Investigação no código identificou que `systemup_monitor_sync_config()` e `systemup_monitor_sync_backup_settings()` chamavam `write_config()` gravando **o `$config` inteiro**. Se o resync do pfSense rodasse com snapshot **stale** em memória (boot, filter sync, corrida entre abas), o XML era sobrescrito com estado antigo — padrão clássico de packages pfSense.

O agente shell (heartbeat/backup) **nunca escreve** no `config.xml`; o controlador **não possui restore** automático para o firewall.

## Correção

### 1. `systemup_monitor_persist_package_config($reason)`

- Exporta snapshot **apenas** de `installedpackages.systemupmonitor` e `installedpackages.service` (entrada do agente).
- Chama `config_read()` para recarregar o config **do disco**.
- Reaplica somente o snapshot do package.
- Só então chama `write_config()`.

VPN/NAT/regras vêm sempre do disco; só a seção do SystemUp Monitor é mesclada.

### 2. `systemup_monitor_sync_config()` — resync periódico

- **Remove** `write_config()` incondicional.
- Atualiza somente `/usr/local/etc/monitor-pfsense-agent.conf` e reinicia o serviço.
- Persiste no XML **somente** se a entrada do serviço rc.d ainda não existir (`systemup_monitor_is_service_registered()`).

### 3. `systemup_monitor_sync_backup_settings()`

- Usa `systemup_monitor_persist_package_config()` em vez de `write_config()` direto.

### 4. CLI (`systemup_monitor_cli.php`)

- `seed` e `remove` passam a usar persistência segura.

### 5. `systemup_monitor_register_service()`

- Idempotente: retorna `false` se a entrada já existe e está correta (evita gravações desnecessárias).

## Arquivos alterados

- `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc`
- `packages/pfsense-package/files/usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php`
- `packages/pfsense-package/Makefile` → `0.3.5`

## Rollout

1. Gerar artefato: `./scripts/release-pfsense-package.sh` (ou pipeline habitual).
2. Atualizar package nos firewalls afetados (comando one-shot na página do node ou `install-from-release.sh`).
3. Após update, opcional: `php .../systemup_monitor_cli.php sync` (só regenera runtime; **não** regrava XML).

## Verificação pós-deploy

No pfSense, após alterar VPN/NAT e aguardar o período em que ocorria revert:

- **Diagnostics → Configuration History** não deve mostrar entradas repetidas `SystemUp Monitor package settings updated` sem interação humana.
- Configurações operacionais permanecem intactas.

## O que não mudou

- Agente: heartbeat e backup continuam **somente leitura** do `config.xml`.
- API: sem restore remoto; backups permanecem no controlador.
