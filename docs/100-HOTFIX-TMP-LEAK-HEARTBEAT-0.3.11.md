# 100 — Hotfix: vazamento de arquivos `/tmp/tmp.*` (heartbeat)

**Data:** 2026-06-23  
**Package:** `0.3.11`  
**Sintoma:** milhares de arquivos em `/tmp` com conteúdo JSON de resposta do heartbeat:

```json
{"ok":true,"server_time":"...","node_status":"online"}
```

## Causa

Em `heartbeat()`, `process_heartbeat_commands()` registrava `trap` próprio que **substituía** o trap de limpeza de `payload_file` / `response_file` / `err_file`. A cada ciclo (~30s) restavam 3 arquivos `mktemp` órfãos.

## Correção

- Remoção explícita de temporários em `heartbeat()` e `process_heartbeat_commands()`
- Não imprimir mais o corpo JSON do heartbeat no log do loop (reduz ruído)

## Limpeza no pfSense (pós-upgrade)

```sh
# Remover órfãos conhecidos do heartbeat (revisar antes em ambiente crítico)
find /tmp -maxdepth 1 -type f -name 'tmp.*' -size -200c -exec grep -l '"node_status":"online"' {} \; 2>/dev/null | xargs rm -f
```

## Upgrade

Publicar `0.3.11` e atualizar pelo GUI ou SSH conforme `docs/99-HOTFIX-UPGRADE-0.3.5-NODE-SECRET.md`.
