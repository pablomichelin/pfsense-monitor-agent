# Entrega — Correção backup agendado em loop (auditoria frota)

**Data:** 2026-06-13  
**Versões:** API `0.2.9`, package pfSense `0.2.35`, painel `1.0.0` (sem alteração)

## Problema

Firewalls com backup **mensal** (ou outro agendamento) enviavam tentativas `scheduled` a cada ~30s. No monitor, milhares de linhas `duplicado` com o mesmo hash.

## Auditoria da frota (54 nodes, 21 com backup)

| Firewall | Cliente | dup/24h | agente | Observação |
|---|---|---:|---|---|
| maquimalhas.home.arpa | Maquimalhas | 2712 | 0.2.34 | loop desde 12/06 |
| FW-metalpox.metalpox.com.br | Metalpox | 2704 | 0.2.34 | loop desde 11/06 |
| incubatorio-fw.incubatorio.bomjesus | Incubatorio Bom Jesus | 2636 | 0.2.34 | loop desde 10/06 |
| *demais 18 com backup* | — | 0–1 | vários | comportamento normal |

- Origem: `scheduled`, sem `command_id` — **não** era heartbeat/comando remoto.
- Comandos `config_backup_now` presos: **nenhum** na frota.
- Outros nodes (Construnivel, CB-Hidro, Contacenter) tiveram **1** duplicata e pararam — padrão esperado antes do loop infinito.

## Causa raiz (agente 0.2.34)

1. **`backup_should_run_scheduled`**: `Somente se mudou` invertido (hash igual → enviava; hash diferente → pulava).
2. **`backup_schedule_due`**: timestamp ilegível em `last-config-backup-at` = “nunca fez backup” → agendamento sempre vencido.
3. Loop do agente (`heartbeat` + `backup-scheduled` a cada 30s) amplifica o bug.

## Correções

### Package pfSense `0.2.35`

- Lógica correta de agendamento + `Somente se mudou`.
- Guard em `backup_config_now` antes do upload agendado.
- Timestamp ilegível não mantém agendamento vencido forever.

Artefato: `dist/pfsense-package/monitor-pfsense-package-v0.2.35.tar.gz`  
`config/package-release.env` atualizado.

### API `0.2.9`

- Supressão de duplicata **agendada** sem gravar linha (desde 0.2.8).
- **Early exit** antes do gunzip quando hash já armazenado (menos CPU).
- **Alerta em log** se >30 supressões/hora/node (agente desatualizado).
- Comandos `picked_up`/`running` expiram após `expires_at` (antes só `pending`).

### Scripts operacionais

| Script | Uso |
|---|---|
| `scripts/test-backup-schedule-logic.sh` | Regressão da lógica de agendamento |
| `scripts/audit-config-backup-fleet.sh` | Auditar frota (loops, comandos presos) |
| `scripts/cleanup-scheduled-duplicate-backups.sh` | Limpar histórico duplicado (`--apply`) |

## Ações prioritárias

1. **Controlador:** API `0.2.9` deployada (`docker compose up -d --build`).
2. **Publicar** artefato `0.2.35` no GitHub (`release-pfsense-package.sh` / pipeline habitual).
3. **Atualizar package nos 3 pfSense** em loop (prioridade alta).
4. **Opcional:** limpar histórico duplicado:

```bash
./scripts/cleanup-scheduled-duplicate-backups.sh          # dry-run
./scripts/cleanup-scheduled-duplicate-backups.sh --apply  # executar
```

## Verificação

```bash
./scripts/audit-config-backup-fleet.sh
./scripts/test-backup-schedule-logic.sh
```

- Após API 0.2.8+: novas linhas duplicadas agendadas **param** (confirmado ~02:05 UTC).
- Após package 0.2.35 nos pfSense: uploads desnecessários cessam; próximo `stored` no slot configurado ou se o XML mudar.
