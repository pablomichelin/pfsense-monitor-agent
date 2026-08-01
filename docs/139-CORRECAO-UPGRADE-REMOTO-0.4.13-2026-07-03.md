# 139 — Correção upgrade remoto (release 0.4.13)

**Data:** 2026-07-03  
**Status:** Corrigido no controlador (API/web rebuild); HILE pendente re-tentativa remota

---

## Sintoma (HILE `fw-r0f5nver`)

| Campo | Valor |
|-------|-------|
| Hostname | `FW-Chamais.grupobotta.br` |
| Node UID | `fw-r0f5nver` |
| Instalado | 0.4.10 |
| Publicado (antes) | 0.4.12 |
| Erro UI | `install-from-release failed (see /var/log/monitor-pfsense-package-upgrade.log)` |
| Comando DB | `e48277ba-…` — payload SHA256 `cef14c46…` correto; falha ~17s após dispatch |

Menu GUI ausente (`menu=0`) — doc **138**; não era mismatch de artefato.

---

## Causa raiz — upgrade remoto abortava no `install.sh`

Dois bugs combinados no fluxo `package_upgrade` → `run_package_upgrade.sh` → `install-from-release.sh` → `install.sh`:

### 1. `register_package_gui` fatal antes de invalidar opcache

Ordem em `install.sh` (0.4.10–0.4.12):

1. `install_package_files` — grava 0.4.12 no disco
2. `register_package_gui` — chama `register-gui` → `systemup_monitor_ensure_gui_registration()` (**só existe em 0.4.12+**)
3. PHP ainda podia carregar **`systemup_monitor.inc` 0.4.10 em opcache**
4. Função ausente ou retry incompleto → **exit 1** (`set -eu`)
5. `invalidate_package_php_cache` só rodava **depois** do `seed` — tarde demais

Payload da API estava correto (SHA256, URL, secret via `--secret-file`). A falha era **pós-download**, na instalação local.

### 2. `service monitor_pfsense_agent restart` durante upgrade remoto

`install.sh` reiniciava o serviço ao final. Durante upgrade remoto, o wrapper `run_package_upgrade.sh` ainda está em execução — restart prematuro podia interromper o processo ou deixar o agente inconsistente.

---

## Correções (release **0.4.13**)

| Arquivo | Mudança |
|---------|---------|
| `bootstrap/install.sh` | `invalidate_package_php_cache` **antes** de `register_package_gui`; `register_package_gui \|\| true`; pula restart quando `MONITOR_PACKAGE_UPGRADE_MODE=1` |
| `run_package_upgrade.sh` | exporta `MONITOR_PACKAGE_UPGRADE_MODE=1`; reinicia serviço **após** sucesso do install |
| `fleet-inventory-section.tsx` + `fleet-batch-backup-panel.tsx` | backup em lote usa **seleção** quando há checkboxes; contadores distinguem selecionados vs filtro (corrige confusão 3 vs 57) |

**Release:** `0.4.13` — SHA256 `2551a567f2cb20e911b59febacde6f719ff1558502411ba2f3b6c2a8b5f90c7c` (63 745 bytes)

---

## Bug UI lote (3 vs 57)

**Causa:** painel **Backup em lote** sempre enviava `nodes.length` (todos visíveis no filtro, ex. 57). Painel **Atualizar package** já usava `selectedNodes` corretamente — usuário via “57” no card de backup acima.

**Correção:** com checkboxes marcados, backup também limita a `selectedIds`. Textos de seção descrevem quantos estão selecionados.

Backend `package-upgrade.service.ts` sempre respeitou `node_ids` do POST — sem alteração.

---

## Verificação pós-deploy

```bash
curl -s http://127.0.0.1:8088/api/v1/agent/package-release | jq '{version,sha256}'
# 0.4.13 / 2551a567…

curl -sI http://127.0.0.1:8088/api/v1/agent/package-artifact | grep -i content-length
# Content-Length: 63745

./scripts/smoke-agent-release.sh 0.4.13
```

---

## O que fazer no HILE agora

1. **Upgrade remoto (recomendado):** painel → node `fw-r0f5nver` → **Atualizar package remotamente** (publicado 0.4.13). Comando anterior falhou; novo dispatch usa artefato corrigido.
2. **Alternativa manual:** `./scripts/generate-install-command.sh fw-r0f5nver` no controlador.
3. **Menu GUI (se ainda ausente após upgrade):** script de reparo no doc **138** ou `register-gui` via CLI 0.4.13.

---

## Relacionados

- Doc **136** — SHA256 desync (resolvido; Content-Length OK)
- Doc **138** — race menu GUI (fix base em 0.4.12; upgrade path corrigido em 0.4.13)
