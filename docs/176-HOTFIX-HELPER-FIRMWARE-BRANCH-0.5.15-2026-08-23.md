# 176 — Hotfix helper de firmware branch

**Data:** 2026-08-23  
**Versões:** API **0.11.0** · painel **1.12.2** · package pfSense **0.5.15**

## Problema

No Fw.acrel.lageado (package 0.5.14) o **Apontar branch** falhou com:

`set_pfsense_update_branch.php not found`

O arquivo **estava no disco**. O `install.sh` copia a árvore `files/usr` via tar, mas o helper saiu em modo `644`. O check do agente usava `[ ! -x ... ]` e tratava “sem +x” como “não existe”. O `pkg-plist` e a lista de `chmod` do bootstrap também omitiam o arquivo.

A GUI do pfSense no mesmo host já oferecia `Current Stable Version (2.9.0)` — o train existe; só o agente remoto falhou.

## O que mudou

### Package 0.5.15

- `chmod 0755` do helper no `install.sh`.
- Entrada no `pkg-plist`.
- Check e `set-branch` usam `-f` (o PHP só precisa ler o arquivo) e tentam `chmod 0755` antes do `set`.

### Painel 1.12.2

- Texto do card explica o 0.5.14 sem +x e pede upgrade para 0.5.15+.

## Uso

1. No firewall: **Atualizar package remotamente** para **0.5.15** (SHA256 `b27f1fe9d167e8e1f996c519d56ff085a3fac8f7c586279b37eb0904cb03f450`).
2. Depois: **Apontar branch** → `2.9.0` → CONFIRMAR.
3. Atalho na GUI do pfSense (já válido agora): System → Update → Branch → `Current Stable Version (2.9.0)`.
