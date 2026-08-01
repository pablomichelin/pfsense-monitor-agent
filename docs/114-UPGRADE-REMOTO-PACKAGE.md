# Upgrade remoto do package SystemUp Monitor

**Release atual do package publicada pelo controlador:** `0.4.7` (`config/package-release.env`).

## Visão geral

A partir do package **0.4.6**, o controlador pode enfileirar o comando `package_upgrade` na fila `node_commands`. No próximo heartbeat, o agente:

1. recebe `artifact_url`, `sha256` e `target_version` no payload;
2. valida a URL (controlador configurado ou raw GitHub do repositório oficial);
3. baixa `install-from-release.sh` e o tarball;
4. verifica SHA256;
5. executa a instalação em segundo plano;
6. reporta `succeeded` ou `failed` via `/api/v1/ingest/command-result`.

## Pré-requisito — primeira instalação manual

Firewalls com agente **&lt; 0.4.6** não possuem o handler `package_upgrade`. Para cada um:

1. Instale manualmente o package na release alvo (**`0.4.7`** recomendado — GUI, `install-from-release.sh` ou comando bootstrap do painel).
2. Após isso, upgrades futuros podem ser disparados remotamente (para a release configurada no controlador).

## API

| Método | Endpoint | Permissão |
|--------|----------|-----------|
| GET | `/api/v1/nodes/:id/package-upgrade/status` | `firewalls.view` |
| POST | `/api/v1/nodes/:id/package-upgrade/request` | `package.upgrade.run` |
| POST | `/api/v1/package-upgrade/batch` | `package.upgrade.run` |

Body opcional do POST:

```json
{
  "target_version": "0.4.7",
  "artifact_url": "https://pfs-monitor.systemup.inf.br/api/v1/agent/package-artifact",
  "sha256": "..."
}
```

Se omitido, usa `config/package-release.env` / endpoint `GET /api/v1/agent/package-release`.

## Painel

Na página do firewall → aba **Visão geral** → card **Atualização do package SystemUp Monitor** → botão **Atualizar package remotamente** (requer `package.upgrade.run` e agente ≥ 0.4.6).

**Em lote:** página **Inventário** (`/nodes`) → selecione firewalls com checkbox → **Atualizar package em lote** (mesma permissão). Doc: `docs/133-ENTREGA-BATCH-UPGRADE-PACKAGE-2026-07-02.md`.

## Variáveis de ambiente (API)

| Variável | Default | Descrição |
|----------|---------|-----------|
| `PACKAGE_UPGRADE_ENABLED` | `true` | Feature flag |
| `PACKAGE_UPGRADE_MIN_AGENT_VERSION` | `0.4.6` | Versão mínima com handler remoto |
| `PACKAGE_UPGRADE_COMMAND_EXPIRE_MINUTES` | `60` | Expiração do comando pendente |
| `PACKAGE_UPGRADE_MAX_CONCURRENT` | `0` | Limite global (0 = ilimitado) |

## Logs no pfSense

- `/var/log/monitor-pfsense-package-upgrade.log`
- Lock: `/var/run/monitor-pfsense-package-upgrade.lock`

## Testes

```bash
./scripts/test-package-upgrade-dispatch.sh
cd apps/api && npm run build && node --test test/package-upgrade.util.test.mjs
```
