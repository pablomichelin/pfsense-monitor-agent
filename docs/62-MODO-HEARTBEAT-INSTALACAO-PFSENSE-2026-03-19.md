# 62. Modo de heartbeat na instalacao do pfSense

Data: `2026-03-19`

## Objetivo

Permitir escolher, no momento de copiar o comando de instalacao do firewall, se o package sera instalado em modo `normal` ou `light`.

## Motivacao

- O modo `light` estava fixo no runtime do package.
- Isso prejudicava diagnosticos em firewalls que precisam enviar servicos e gateways em todo heartbeat, como no caso do pfSense+ com muitos tuneis IPsec.
- O comando do painel precisava deixar explicito qual modo sera aplicado no firewall.

## O que foi alterado

### 1. Novo padrao operacional

- O package passou a considerar `normal` como modo padrao.
- O runtime agora grava `MONITOR_AGENT_LIGHT_HEARTBEAT="0"` em modo normal e `MONITOR_AGENT_LIGHT_HEARTBEAT="1"` em modo light.

### 2. Instalador do package

- `packages/pfsense-package/bootstrap/install.sh` agora aceita:

```sh
--heartbeat-mode normal
--heartbeat-mode light
```

- O instalador repassa a escolha para o CLI do package.

### 3. CLI do package

- `systemup_monitor_cli.php seed` agora aceita `--heartbeat-mode normal|light`.
- O valor fica persistido em `installedpackages/systemupmonitor/config[0].heartbeat_mode`.

### 4. Comando gerado pelo painel

- `GET /api/v1/admin/nodes/:id/bootstrap-command` agora aceita `heartbeat_mode`.
- O frontend das telas:
  - `/nodes/[id]`
  - `/bootstrap`
  expõe botões `Normal` e `Light`.
- O botão/copiar comando usa o modo selecionado e inclui `--heartbeat-mode ...`.

### 5. Script auxiliar do servidor

- `scripts/generate-install-command.sh` agora aceita:

```sh
./scripts/generate-install-command.sh NODE_UID normal
./scripts/generate-install-command.sh NODE_UID light
```

## Validacao executada

- `npm run build` em `apps/api`
- `npm run build` em `apps/web`
- `docker compose up -d --build api web`
- validacao de sintaxe:
  - `sh -n` nos instaladores shell
  - `php -l` nos arquivos PHP do package
- validacao funcional:
  - comando gerado com `--heartbeat-mode normal`
  - comando gerado com `--heartbeat-mode light`
  - endpoint `bootstrap-command?heartbeat_mode=light` retornando `heartbeat_mode: "light"`

## Resultado esperado

- Para teste e diagnostico de VPN/servicos, usar `Normal`.
- Para operacao enxuta em ambientes grandes, usar `Light`.
- O operador escolhe isso diretamente na tela do firewall, antes de copiar o comando.
