# 132 — Entrega: Correções auditoria framework pfSense (package 0.4.10)

**Data:** 2026-07-02  
**Plano de origem:** correções auditoria package pfSense (wrappers, config_read, framework XML/GUI, validação, HMAC)  
**Versões antes:** package `0.4.9` (código) · release publicada `0.4.7`  
**Versões depois:** package `0.4.10` (código; release após `release-pfsense-package.sh`)

**Referências:** `CORTEX.md`, `LEITURA-INICIAL.md`, plano `.cursor/plans/correcoes_package_pfsense_monitor_e43ecc24.plan.md`

---

## Contexto

Auditoria validada contra o código-fonte oficial do pfSense CE 2.8.x identificou erros no pacote `pfSense-pkg-systemup-monitor`. O controlador (API/web) **não** precisou de alterações. Todas as correções ficam em `packages/pfsense-package/` + documentação.

---

## Achados e correções

### Fase 1 — Críticos funcionais

| Item | Problema | Correção |
|------|----------|----------|
| 1.1 | `run_node_reboot.sh` e `run_package_upgrade.sh` postavam `command-result` com headers `X-Monitor-*` e liam `NODE_SECRET` do `.conf` (vazio após migração B1) | Subcomando `post-command-result` no agente, delegando a `agent_post_command_result_*` + `backup_post_signed_json`; wrappers simplificados |
| 1.2 | `config_read()` inexistente em `systemup_monitor_persist_package_config()` — proteção anti-stale morta | Troca por `config_read_file()` com fallback `parse_config(true)` |

### Fase 2 — Conformidade framework de packages

| Item | Problema | Correção |
|------|----------|----------|
| 2.1 | `fbegin.inc` e `<body>` manual nas 3 páginas WWW (legado pre-2.3) | Removidos; `head.inc`/`foot.inc` fecham o documento |
| 2.2 | `<additional_files_needed>` no XML (não processado pelo pkg-utils atual) | Removido; arquivos já no `pkg-plist` |
| 2.3 | Status do serviço com CDATA multi-statement (`exec` + variáveis) | Expressão única `mwexec(...)` alinhada a `systemup_monitor_service_definition()` |
| 2.4 | `custom_php_global_functions` com efeito colateral em todo carregamento | Removido; defaults via `systemup_monitor_read_config()` / `sync_config` |

### Fase 3 — Validação e robustez

| Item | Problema | Correção |
|------|----------|----------|
| 3.1 | Intervalo inválido podia gerar busy-loop | `systemup_monitor_normalize_interval_seconds()` (clamp 10–3600); `custom_php_validation_command`; sanitização no loop |
| 3.2 | `hex_hmac()` passava segredo no argv do `openssl` (visível em `ps`) | PHP com env var `MONITOR_HMAC_KEY`; fallback openssl comentado |
| 3.3 | `json_escape` não escapava `\n`/`\r`/`\t` | Extensão via `awk` nos scripts shell afetados |
| 3.4 | `pkg-install.in` / `pkg-deinstall.in` dependiam de `PKG_ROOTDIR` para `rc.packages` | Paths absolutos `/usr/local/bin/php -f /etc/rc.packages` |
| 3.5 | `build-pfsense-package-artifact.sh` substituía `%%PKGVERSION%%` só no `info.xml`; `systemup_monitor.xml` chegava ao firewall com placeholder no caminho one-shot (pré-existente desde 0.4.x) | `sed` do build passa a cobrir também `files/usr/local/pkg/systemup_monitor.xml`; artefato 0.4.10 regerado |

---

## Arquivos principais alterados

- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh`
- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/run_node_reboot.sh`
- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/run_package_upgrade.sh`
- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh`
- `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc`
- `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.xml`
- `packages/pfsense-package/files/usr/local/www/config_systemup_monitor.php`
- `packages/pfsense-package/files/usr/local/www/status_systemup_monitor.php`
- `packages/pfsense-package/files/usr/local/www/backup_systemup_monitor.php`
- `packages/pfsense-package/files/pkg-install.in`
- `packages/pfsense-package/files/pkg-deinstall.in`
- `packages/pfsense-package/Makefile` (`PORTVERSION=0.4.10`)
- `packages/pfsense-agent/bin/monitor-pfsense-agent.sh` (paridade HMAC/json_escape legado)

---

## Validação estática executada

- `sh -n` em todos os `.sh` alterados do package
- `php -l` em `.inc`/`.php` alterados
- `scripts/test-package-upgrade-dispatch.sh`
- `scripts/test-package-update-harden.php`
- `scripts/test-install-upgrade-files.sh`
- `scripts/release-pfsense-package.sh --no-push` (artefato + `config/package-release.env`)

---

## Homologação (pfSense CE 2.8.1) — CONCLUÍDA em 2026-07-02

Testado pelo operador em firewall real com sucesso:

1. Páginas GUI abrem sem warning / body duplicado — OK
2. Validação de campos no save do package — OK
3. Fluxo de comando fim a fim com `command-result` chegando ao controlador — OK

---

## Follow-up registrado (fora deste ciclo)

- Migração completa de `global $config` para `config_get_path()` / `config_set_path()` no `.inc`
- Registro de privilégios (`priv`) para páginas WWW — admin-only via `page-all` aceitável no MVP
- Deduplicação caminhos de desinstalação (`custom_php_deinstall_command` vs `pkg-deinstall.in`) — documentar apenas

---

## Próximo passo operacional

Release `0.4.10` publicada (artefato regerado com fix 3.5, SHA256 `2b6d26904010c2636be697640a663cf1b24e6f3ae30f33c8fcdb3cdea481b853`, commit/push em `origin main`). Alinhar frota via coluna **Pacote** em `/nodes` usando o upgrade remoto.
