# 142 — Upgrade pfSense OS remoto completo (release 0.4.17)

**Data:** 2026-07-04  
**Status:** Implementado — package **0.4.17**, painel **1.5.3**

---

## Problema

O botão **Atualizar pfSense** no painel marcava sucesso, mas exigia confirmação manual em
**System → Update** no firewall — fluxo semi-manual herdado do spike CE (doc 97), nunca
fechado para execução real.

## Solução

A confirmação no painel (hostname / CONFIRMAR) passa a ser a confirmação operacional.
O agente executa upgrade completo:

```sh
pfSense-upgrade -d -u
env ASSUME_ALWAYS_YES=yes pfSense-upgrade -d -y   # reboot automático
```

Pós-reboot, `finalize_pfsense_upgrade_if_pending` só marca `succeeded` quando
`pfsense_version == target_version`.

| Mudança | Detalhe |
|---|---|
| `run_pfsense_upgrade.sh` | execução real com `-y`; default `EXEC_ENABLED=1` |
| `systemup_monitor.inc` | default `pfsense_upgrade_exec_enabled=1` |
| `finalize_pfsense_upgrade_if_pending` | succeeded só com versão == alvo; `failed` imediato |
| Painel | copy remoto completo; banners honestos |

## Rollout systemup (piloto)

1. Atualizar package do host **systemup** para **0.4.17** (upgrade remoto de package).
2. Aguardar heartbeat (~30s).
3. Disparar **Atualizar pfSense** novamente (26.03-RELEASE → 26.03.1).
4. Aguardar reboot (~15–90 min); versão deve aparecer **26.03.1** após online.

## Opt-out

`MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=0` no agente restaura modo legado (só repos + GUI manual).

## Relacionados

- Doc **97** — spike CE (flags `-y` documentadas upstream)
- Doc **141** — falso sucesso semi-manual (0.4.16)
