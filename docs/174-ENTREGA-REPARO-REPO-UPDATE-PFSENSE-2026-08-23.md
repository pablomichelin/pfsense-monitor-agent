# 174 — Reparo do repositório de update do pfSense

**Data:** 2026-08-23  
**Versões:** API **0.10.11** · painel **1.11.5** · package pfSense **0.5.13**

## Problema

Além do cache mentiroso (entrega 173), o check/upgrade do OS falha com:

- lock fantasma (“outra instância de pfSense-upgrade”)
- `pkg` sem confiança TLS (resolve com `certctl rehash`)
- ferramentas `pkg` / `pfSense-repo` / `pfSense-upgrade` corrompidas
- timeout IPv6

Receitas oficiais: [Troubleshooting Upgrades](https://docs.netgate.com/pfsense/en/latest/troubleshooting/upgrades.html).

## O que mudou

### Package 0.5.13

- Lock órfão sem processo vivo é removido (incluindo `pkg.lock` ocioso).
- Se o `-u` falhar por TLS, roda `certctl rehash` e tenta de novo.
- Se falhar por timeout/rota, tenta `pfSense-upgrade -4`.
- Classifica o erro (`tls`, `lock`, `dns`, `ipv6`, `metadata`, `unknown`) e manda a última linha de `/conf/upgrade_log.latest.txt`.
- Ação `repair-repo`: receita Netgate (`pkg-static clean -ay` + reinstall `pkg` + `-xfy pfSense-repo pfSense-upgrade`), com `bootstrap -f` só se o metadata estiver quebrado.

### API 0.10.11

- Colunas `pfsense_update_error_class`, `pfsense_update_log_snippet`, `pfsense_repo_repair_requested_at`.
- Heartbeat devolve `force_repo_repair` (prioridade sobre `force_update_check`).
- `POST /api/v1/nodes/:id/pfsense-upgrade/repair-repo`.

### Painel 1.11.5

- Texto da causa no card de upgrade.
- Botão **Reparar repositório** com confirmação (hostname / CONFIRMAR).

## Uso

1. Atualizar a frota para package **0.5.13** (SHA256 `c952972c0b30430dd5b94bca5a83b7e450f380861c4a1b3074d33c4570a5525a`).
2. **Atualizar verificação** para o playbook leve (certctl / IPv4 / lock).
3. Se ainda falhar: **Reparar repositório** (não muda a versão do OS nem o firmware branch).
