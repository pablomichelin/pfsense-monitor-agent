# 65. Frontend, package pfSense e deploy do modulo integrado

Data: `2026-06-08`
Revisao: `2026-06-08`

## Objetivo

Definir como o backup aparece no painel, no package pfSense e no fluxo de deploy. Contrato tecnico completo em `docs/64-...md`.

## Execucoes ja feitas nesta trilha

| Item | Evidencia |
|------|-----------|
| Backup PostgreSQL | `backups/postgres/postgres-monitor_pfsense-20260609-014628Z.dump` |
| Restore validado | 13 tabelas; `clients=47`, `nodes=53` |
| Contrato publico | `verify-origin-contract.sh` passou |
| Origem no repo | `infra/ispconfig/nginx.monitor-pfsense.conf` -> `192.168.100.221:3031` |
| Limite backup no repo | `infra/nginx/default.conf` + ISPConfig reference com `5m` por rota |
| Volume backup | `compose.yaml` monta `data/pfsense-config-backups` |
| Mockups | `docs/mockups/backup-pfsense-ui-mockup.html` e PNGs |

Pendente em producao: aplicar snippet ISPConfig e rodar `verify-config-backup-upload-limit.sh`.

## Frontend (MVP)

Local: `apps/web/app/nodes/[id]/page.tsx`

Bloco `Backups de configuracao`:

- status: `Em dia` / `Atrasado` (>36h) / `Falhou` / `Nunca enviado`
- ultimo backup, idade, tamanho, SHA256 curto, quantidade armazenada
- lista de backups do firewall
- botao `Solicitar backup agora` + estados do comando
- link para auditoria filtrada do node
- download apenas `superadmin`

Atualizacao de UI:

- polling a cada `5s` enquanto comando `pending/picked_up/running`
- reutilizar `RealtimeRefresh` quando o dashboard emitir refresh

Permissoes MVP (fechadas): ver doc `63`.

## Package pfSense

Evoluir `packages/pfsense-package/` — sem package novo.

Abas: `Configuracao | Diagnostico | Backup`

Aba `Backup`: enable, intervalo, on-change, compress, aceitar solicitacao remota, diagnostico local, botao `Enviar backup agora`.

Instalador: `--config-backup-enabled no` por padrao em producao; `yes` em homolog.

## Release

```bash
./scripts/release-pfsense-package.sh
```

Fonte: `config/package-release.env` apontando para `pablomichelin/pfsense-monitor-agent`.

## Deploy do app

Servidor: `192.168.100.221`, dominio `https://pfs-monitor.systemup.inf.br`

Fluxo:

1. backup PostgreSQL
2. migration Prisma
3. `docker compose up -d --build`
4. smokes
5. release package
6. homolog pfSense
7. piloto em um cliente

Smokes:

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-origin-contract.sh
BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-config-backup-upload-limit.sh
# apos Fase C:
./scripts/smoke-config-backup-api.sh
./scripts/smoke-config-backup-download.sh
./scripts/smoke-config-backup-retention.sh
./scripts/smoke-config-backup-request-now.sh
```

## Ordem de implementacao

1. concluir Fase B em producao
2. backend (Fase C)
3. smokes com XML fake
4. comando no heartbeat + package `backup-config`
5. bloco frontend
6. homolog real
7. piloto
