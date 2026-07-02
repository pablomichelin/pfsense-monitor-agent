# Entrega — upgrade remoto de package (2026-06-30)

| Componente | Versão |
|------------|--------|
| API NestJS | **0.6.4** |
| Package pfSense | **0.4.6** |

## Escopo

- Novo comando `NodeCommandType.package_upgrade` com payload `target_version`, `artifact_url`, `sha256`
- Módulo `package-upgrade` (status + request) com RBAC `package.upgrade.run`
- Agente: `dispatch_package_upgrade` + wrapper `run_package_upgrade.sh` (allowlist URL, SHA256, `install-from-release.sh`)
- Painel: card **Atualizar package remotamente** na visão geral do firewall
- Doc operacional: `docs/114-UPGRADE-REMOTO-PACKAGE.md`

## Limitação operacional

Firewalls **sem** agente 0.4.6 ainda precisam de **uma** instalação manual (bootstrap/GUI). Depois disso, upgrades via painel/API.

## Artefato

`dist/pfsense-package/monitor-pfsense-package-v0.4.6.tar.gz`

## Deploy

```bash
cd /Dados/Monitor-Pfsense
./scripts/release-pfsense-package.sh --no-push   # se ainda não publicado
docker compose build api web && docker compose up -d api web
docker compose exec api npx prisma migrate deploy
```

## Testes

```bash
./scripts/test-package-upgrade-dispatch.sh
cd apps/api && npm run build && node --test test/package-upgrade.util.test.mjs
```
