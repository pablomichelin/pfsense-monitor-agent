# 175 — Firmware branch no check de update do pfSense

**Data:** 2026-08-23  
**Versões:** API **0.11.0** · painel **1.12.0** · package pfSense **0.5.14**

## Problema

No Acrel Chapeco (e no restante da frota 2.7.x / 2.8.x) o reparo oficial do repo já tinha rodado com sucesso. O `pfSense-upgrade -c` respondia “up to date” porque o box estava no **train atual** (2.7.2 é o último do 2.7). O 2.9.0 existe — um host da frota já está nele — mas a Netgate **não opta automaticamente** pelo branch novo.

Fontes: [Upgrade Guide](https://docs.netgate.com/pfsense/en/latest/install/upgrade-guide.html), [Troubleshooting Upgrades](https://docs.netgate.com/pfsense/en/latest/troubleshooting/upgrades.html), [anúncio 2.9.0](https://www.netgate.com/blog/netgate-releases-pfsense-community-edition-version-2.9.0).

## O que mudou

### Package 0.5.14

- Heartbeat passa a mandar `pfsense_firmware_branch`, descrição e lista local de repos.
- Ação `set-branch` (allowlist `latest` / `2.8.1` / `2.9.0`):
  - chama `update_repos()` (lista oficial da Netgate)
  - grava `system/pkg_repo_conf_path` como a GUI
  - chama `pkg_switch_repo()` (assinatura 2.7.x ou 2.8+/2.9)
  - recheca o OS
- Bloqueia devel, snapshot, Next Major e Plus upgrade. Em Plus só aceita `latest`.

### API 0.11.0

- Colunas de branch + pedido (`pfsense_update_branch_requested_at` / `target`).
- Heartbeat devolve `force_set_update_branch` com prioridade sobre repair/check.
- `POST /api/v1/nodes/:id/pfsense-upgrade/set-branch`.

### Painel 1.12.0

- Card mostra o firmware branch atual.
- Aviso de 2.7/2.8 deixa de culpar só “cache velho” quando o branch já é conhecido.
- Botão **Apontar branch** com CONFIRMAR / hostname.

## Uso

1. Atualizar a frota para package **0.5.14** (SHA256 `d15a1b5166c84de1f53b0150ff539f47f6fedca73bc04c7e286484d98479d7bf`).
2. No host preso (ex.: Acrel Chapeco): **Apontar branch** → `2.8.1` (saída do 2.7) ou `2.9.0` / Latest.
3. Esperar o check. Se aparecer atualização, **Atualizar pfSense**.
4. Salto 2.7.2 → 2.9.0 é grande (FreeBSD 14 → 16); a doc oficial recomenda versão intermediária se o 2.9.0 não for oferecido.
