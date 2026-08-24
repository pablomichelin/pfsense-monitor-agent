# 177 — Plano de homologação pfSense CE 2.9.0 (lab 192.168.100.10)

**Data:** 2026-08-24  
**Lab:** `192.168.100.10` (já em CE 2.9.0)  
**Package alvo:** `0.5.16`  
**Controlador:** `192.168.100.221` — painel interno `:3031` / `https://pfs-monitor.systemup.inf.br`  
**API / painel:** sem mudança de contrato (`0.11.0` / `1.12.2`) salvo se o lab forçar.

## Decisões

- Não executar `pfSense-upgrade -y` neste lab (já está em 2.9.0).
- Não tocar `192.168.100.254`, frota, Zabbix, Apache ou MySQL.
- Segredo de acesso ao lab só fora do git — nunca neste arquivo.
- Agente legado `packages/pfsense-agent/` fora de escopo.

## Acesso SSH

Sessão interativa abre o menu do pfSense — teclar **8** para o shell.

Automação (igual [docs/155](155-VALIDACAO-E2E-LOCAL-USER-CREATE-PFSENSE-254-2026-07-31.md)): comando remoto **sem** `-t` contorna o menu.

```text
ssh -o StrictHostKeyChecking=accept-new root@192.168.100.10 'cat /etc/version'
```

Primeira ação no 10: `/etc/version`, `uname -r`, `php -v`, `sysctl hw.model` (errata Celeron J — só registro). Copiar para este doc apenas os trechos de `/etc/inc/auth.inc` (`local_user_set_password`, `getUserEntry`), não o arquivo inteiro.

## Riscos que este package corrige (0.5.16)

1. `curl_close()` emite `E_DEPRECATED` no PHP 8.5.7.
2. Coletor de gateways pedia `gwlib.inc`; o arquivo canônico é `gwlb.inc`.
3. DHCP Kea 3.x não era visto (só `dhcpd`) — falso `stopped` / serviço omitido.
4. Sem `ramdisk_dir_names`, reboot com RAM disk apaga `/var/db/monitor-pfsense-agent` (inclui `node_secret`).
5. Finalize de upgrade comparava `2.9.0` com `2.9.0-RELEASE` (igualdade estrita).

## Fora deste patch (inspeção no lab)

- Assinatura real de `local_user_set_password` / `getUserEntry` em `/etc/inc/auth.inc`.
- Formato `swanctl --list-sas` (strongSwan 6).
- Texto de `pfSense-upgrade -d -c` (somente `-c`/`-u`, nunca `-y`).
- `isMajorBranchBump()` não bloqueia 2.8→2.9 (major semver = 2 nos dois).

## Checklist E2E

Critério de aceite para “homologado com ressalvas”: itens 1–3, 6–7 e 8. Itens 4, 5, 9, 10 só bloqueiam se o recurso existir no box e falhar.

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 1 | Plataforma (PHP, `gwlb.inc`, `certctl`, encoding XML) | | |
| 2 | GUI package sem `E_DEPRECATED` / TypeError | | |
| 3 | Heartbeat 0.5.16 + métricas | | |
| 4 | DHCP Kea ou ISC sem falso `stopped` | | |
| 5 | IPsec/OpenVPN/WG (IPsec optional) | | |
| 6 | Backup `config.xml` + dedup SHA256 | | |
| 7 | Técnico descartável create / set_password / delete | | |
| 8 | Branch list + `pfSense-upgrade -d -c` parseável | | |
| 9 | Finalize simulado `2.9.0` ≡ `/etc/version` | | |
| 10 | XML instalado contém `ramdisk_dir_names` | | |

## Cadastro no controlador

Cliente de lab explícito (`LAB-PFSENSE-290`) e node próprio — não reutilizar node de produção. Instalação via `scripts/generate-install-command.sh` do release 0.5.16.

## O que esta rodada não cobre

- Upgrade remoto 2.8.x → 2.9.0.
- Inventário Celeron J / panic ACPI da frota.
- Restore de backup 2.8 em 2.9.
- HA / XMLRPC.
- Ligar `PFSENSE_UPGRADE_ENABLED` em produção.
- pfSense Plus 26.x.

## Evidências e veredito

Preenchidos ao final da execução (seção abaixo).

### Veredito

*(pendente — preencher após o E2E)*
