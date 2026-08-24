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
| 1 | Plataforma (PHP, `gwlb.inc`, `certctl`, encoding XML) | OK | `2.9.0-RELEASE`, FreeBSD `16.0-CURRENT`, PHP `8.5.7`, Xeon E5-2690 v4 (não Celeron J). `gwlb.inc` existe; `gwlib.inc` **não**. `certctl` ok. `config.xml` `version=24.6`, entidades `&quot;,&gt;,&amp;` (`ENT_XML1=16`). |
| 2 | GUI package sem `E_DEPRECATED` / TypeError | OK com ressalva | `php -l` limpo nas 3 páginas + `.inc`. Menus Services/Status registrados. `curl_close()` só em comentário. O **core** do pfSense emite `E_DEPRECATED` (backtick, nullable) ao incluir `config.inc` no PHP 8.5 — não é o nosso package. |
| 3 | Heartbeat 0.5.16 + métricas | OK | Node `lab-pfsense-290` `effective_status=online`, `agent_version=0.5.16`, `pfsense_version=2.9.0-RELEASE`. CPU 2.8% / mem 15.16% / disco 3%. Gateways `WAN_DHCP` e `WAN_DHCP6` online via `gwlb.inc`. |
| 4 | DHCP Kea ou ISC sem falso `stopped` | N/A | Sem Kea; `dhcpd` existe no XML com 0 ifaces enabled. Não bloqueia. |
| 5 | IPsec/OpenVPN/WG (IPsec optional) | N/A | IPsec desligado, OpenVPN sem instância, sem WG. `swanctl` 6.0.7 presente; charon parado (sem SA para parsear). |
| 6 | Backup `config.xml` + dedup SHA256 | OK | Dois envios; 1 stored (`config_sha256=ae6fcf74…`, 15286 B, gzip, package 0.5.16). Controlador LAN `:3031` (ver ressalva DNS). |
| 7 | Técnico descartável create / set_password / delete | OK | `zzz_lab290_e2e` uid 65535, `id` Unix ok, `bcrypt-hash` no nível certo (`item=no`). set_password + delete; ausente no SO e no `config.xml`. Backup local de `/conf/config.xml` removido ao final. Wrappers 2.8/Plus batem com `auth.inc` do 2.9.0 (L302 `getUserEntry` devolve `idx`+`item`; L881 `local_user_set_password` lê `['item']`). |
| 8 | Branch list + `pfSense-upgrade -d -c` parseável | Parcial | `list` → `ok:true` product `ce`, `branches=[]` (lab sem metadata de repo). `-c` / `upgrade-check --force`: `pfSense-repoc-static: failed to fetch the repo data`, `error_class=unknown`. Texto parseável; o lab **não alcança** os repos Netgate. Sem `-y`. |
| 9 | Finalize simulado `2.9.0` ≡ `/etc/version` | OK | `2.9.0-RELEASE` normalizado = `2.9.0`. |
| 10 | XML instalado contém `ramdisk_dir_names` | OK | `monitor-pfsense-agent` no XML instalado. RAM disk não foi ligado neste lab. |

## Cadastro no controlador

Cliente de lab explícito (`LAB-PFSENSE-290`) e node próprio — não reutilizar node de produção. Artefato 0.5.16 instalado via SSH (tarball local + `bootstrap/install.sh`); o fetch do hostname público falha no `curl` deste lab.

## O que esta rodada não cobre

- Upgrade remoto 2.8.x → 2.9.0.
- Inventário Celeron J / panic ACPI da frota.
- Restore de backup 2.8 em 2.9.
- HA / XMLRPC.
- Ligar `PFSENSE_UPGRADE_ENABLED` em produção.
- pfSense Plus 26.x.

## Evidências e veredito

Entrega: [docs/178-ENTREGA-HOMOLOGACAO-PFSENSE-2.9.0-PACKAGE-0.5.16-2026-08-24.md](178-ENTREGA-HOMOLOGACAO-PFSENSE-2.9.0-PACKAGE-0.5.16-2026-08-24.md).

### Plataforma (amostra)

```text
VERSION=2.9.0-RELEASE
UNAME=16.0-CURRENT
PHP 8.5.7 (cli)
HW=Intel(R) Xeon(R) CPU E5-2690 v4 @ 2.60GHz
GWLB=yes GWLIB=no CERTCTL=yes
```

`auth.inc` L881: `local_user_set_password(&$user_item_config, $password)` usa `$user_item_config['item']`.  
`auth.inc` L302: `getUserEntry($name)` devolve `['idx' => …, 'item' => …]`.

### Heartbeat / backup

- Cliente `LAB-PFSENSE-290` / node `lab-pfsense-290` (`f76e9f8f-c8ca-40aa-921f-b0710a6d3430`).
- Package **0.5.16** SHA256 `5242b87951328942efc8796025bc367bd8e4acd31a1a8f1ce33e3e616f06bd01`.
- Instalação pelo artefato local (SSH). O hostname público `pfs-monitor.systemup.inf.br` **não resolve no `curl` deste lab** (`host` resolve Cloudflare; `curl -4` e `curl -6` estouram timeout). Agente apontado para `http://192.168.100.221:3031` só neste node de lab.

### Veredito

**Homologado com ressalvas** — package `0.5.16` no lab `192.168.100.10` (CE 2.9.0). Não nasceu 0.5.17 (auth/swanctl não quebraram).

Pendências para frota: não ligar `PFSENSE_UPGRADE_ENABLED`; inventário Celeron J; Kea e IPsec ao vivo em box que tenha o recurso; upgrade remoto 2.8→2.9; repos Netgate neste lab; `pgrep` com âncora `$` marca `dpinger` como `not_installed` embora o processo exista (gateways vêm corretos).
