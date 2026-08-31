# 183 — Hotfix: `php -r` quebra em `kea-dhcp4` (PHP 8 / CE 2.9.0)

**Data:** 2026-08-31  
**Versões:** package pfSense **0.5.19** · API `0.11.1` (sem mudança) · painel `1.12.6` (sem mudança)

## Problema

A cada ~30s (heartbeat), o CLI PHP no pfSense CE 2.9.0 morria:

```text
PHP Fatal error: Uncaught Error: Undefined constant "kea"
in Command line code:69
```

Causa: em `service_should_be_monitored()`, o bloco `php -r '...'` usava aspas simples em `$config->{'kea-dhcp4'}`. O shell encerrava o quoting e o PHP recebia `$config->{kea-dhcp4}` (`kea` como constante).

## Correção

- `$config->{"kea-dhcp4"}` e `$kea->{"dhcp4-enable"}` (aspas duplas dentro do `php -r` em aspas simples).
- Detecção Kea / `kea-dhcp4` / ISC dhcpd / DHCP off preservada.
- Teste `scripts/test-service-should-monitor-dhcp-kea.sh` executa a **função extraída do script** (mesma camada de shell), não PHP isolado.

## Risco e rollback

- **Risco:** baixo — só quoting do detector de DHCP; sem mudança de contrato.
- **Rollback:** republicar **0.5.18** (`config/package-release.env` anterior + lote `package_upgrade`). O Fatal `kea` volta no 2.9.0.

## Arquivos

- `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh`
- `scripts/test-service-should-monitor-dhcp-kea.sh`
- `packages/pfsense-package/Makefile` / `systemup_monitor.inc` → **0.5.19**
