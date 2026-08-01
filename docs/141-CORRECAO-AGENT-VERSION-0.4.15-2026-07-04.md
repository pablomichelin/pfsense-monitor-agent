# 141 — Correção SYSTEMUP_MONITOR_AGENT_VERSION (release 0.4.15)

**Data:** 2026-07-04  
**Status:** Corrigido — release **0.4.15** publicada no controlador

---

## Sintoma

Lote de upgrade para **0.4.14** concluiu com **100 comandos `succeeded`**, mas a coluna **Pacote** no inventário permaneceu em **0.4.13** em todos os 50 nós elegíveis.

## Causa raiz

No release **0.4.14**, `Makefile` e `info.xml` foram bumpados para `0.4.14`, mas
`SYSTEMUP_MONITOR_AGENT_VERSION` em `systemup_monitor.inc` ficou em **`0.4.13`**.

O fluxo `install-from-release` → `install.sh` → `sync` grava `AGENT_VERSION` a partir
dessa constante; o heartbeat reporta `agent_version: 0.4.13` mesmo após instalação
bem-sucedida do tarball 0.4.14. O wrapper posta sucesso com `target_version: 0.4.14`
sem validar a versão efetiva instalada.

## Correções (release 0.4.15)

| Arquivo | Mudança |
|---|---|
| `packages/pfsense-package/Makefile` | `PORTVERSION=0.4.15` |
| `systemup_monitor.inc` | `SYSTEMUP_MONITOR_AGENT_VERSION` → **0.4.15** |
| `scripts/build-pfsense-package-artifact.sh` | guard: `INC` deve bater com `Makefile` |
| `scripts/release-pfsense-package.sh` | mesmo guard antes do build |
| `config/package-release.env` | versão/SHA256 0.4.15 |

**Release 0.4.15:** SHA256 `fac56a57b8370b602fddfec18f8e2c514477aaa57421d2c8f20ff0d656a77304`

## Próximo passo operacional

1. Painel `/nodes` → selecionar firewalls ainda em **0.4.13** (ou abaixo).
2. **Atualizar package em lote** → alvo **0.4.15**.
3. Conferir coluna **Pacote** após heartbeat (~30s).

Nós que já receberam o código do 0.4.14 (fixes de menu/reentrega) passam a reportar
**0.4.15** após este upgrade — o delta de código é mínimo (só versão + guards de release).

## Relacionados

- Doc **140** — release 0.4.14 (reentrega de comandos + persist menu)
- Doc **139** — release 0.4.13 (upgrade remoto opcache/restart)
