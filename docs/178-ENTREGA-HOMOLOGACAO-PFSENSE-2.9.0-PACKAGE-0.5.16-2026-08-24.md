# 178 — Entrega: homologação pfSense CE 2.9.0 (package 0.5.16)

**Data:** 2026-08-24  
**Versões:** API **0.11.0** · painel **1.12.2** · package pfSense **0.5.16**  
**Lab:** `192.168.100.10`  
**Roteiro:** [docs/177](177-PLANO-HOMOLOGACAO-PFSENSE-2.9.0-LAB-10-2026-08-24.md)

## Veredito

**Homologado com ressalvas.** O package 0.5.16 roda no CE 2.9.0 deste lab (PHP 8.5.7, FreeBSD 16-CURRENT). Não nasceu 0.5.17.

## O que o 0.5.16 corrige

- Remove `curl_close()` (E_DEPRECATED no PHP 8.5).
- Coletor de gateways carrega `/etc/inc/gwlb.inc` (canônico; `gwlib.inc` não existe no 2.9.0).
- DHCP no heartbeat: config/processos ISC **ou** Kea; o nome no payload continua `dhcpd`.
- `ramdisk_dir_names=monitor-pfsense-agent` no XML do package (ticket #16624).
- Finalize de upgrade compara versões normalizadas (`2.9.0` ≡ `2.9.0-RELEASE`).

**SHA256 do artefato:** `5242b87951328942efc8796025bc367bd8e4acd31a1a8f1ce33e3e616f06bd01`

## O que passou no lab

- Heartbeat `0.5.16` / `2.9.0-RELEASE`, node `online`, CPU/mem/disco, gateways WAN online.
- GUI do package registrada (Services + Status); `php -l` limpo; sem TypeError nosso.
- Backup + dedup (2 envios → 1 stored).
- Técnico descartável `zzz_lab290_e2e`: create / `id` Unix / hash no nível certo / set_password / delete. `auth.inc` do 2.9.0 usa o mesmo wrapper `item` já tratado no agente.
- Match de finalize simulado ok.
- `ramdisk_dir_names` presente no XML instalado.

## Ressalvas

- Neste lab o `curl` **não resolve** `pfs-monitor.systemup.inf.br` (`host` resolve; IPv4 e IPv6 estouram). O agente do lab aponta para `http://192.168.100.221:3031`. Não mudar a frota por causa disso.
- DHCP Kea e túneis VPN **não existiam** no box — código está no package, sem exercício ao vivo.
- Check de OS: `pfSense-repoc-static` não busca os repos Netgate; o parser devolve `error_class=unknown` com a mensagem de fetch. `set_pfsense_update_branch.php list` veio com `branches=[]`. Sem `pfSense-upgrade -y`.
- Core do pfSense emite `E_DEPRECATED` no PHP 8.5 ao carregar includes oficiais (backtick, nullable). Não é regressão do nosso `.inc`.
- `dpinger` está no ar, mas o `pgrep` com âncora `$` não casa a linha com argumentos → serviço `not_installed` no heartbeat. Gateways continuam corretos via API.
- Hardware do lab é Xeon E5-2690 v4 — a errata Celeron J / ACPI **não** foi exercitada.

## Fora desta entrega

Upgrade remoto 2.8→2.9, restore 2.8 em 2.9, HA, `PFSENSE_UPGRADE_ENABLED` em produção, Plus 26.x, inventário Celeron J da frota.

## Próximo passo operacional

Publicar 0.5.16 na frota quando couber (artefato já no GitHub raw / controlador). Manter upgrade de OS remoto desligado. Tratar Kea/IPsec ao vivo e repos Netgate em outro box se precisar fechar as ressalvas.
