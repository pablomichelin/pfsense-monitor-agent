# Entrega — upgrade remoto de package em lote (2026-07-02)

| Componente | Versão |
|------------|--------|
| API NestJS | **0.7.0** (endpoint batch) |
| Painel web | **1.5.1** (UI seleção + lote) |

## Escopo

- Novo endpoint `POST /api/v1/package-upgrade/batch` (RBAC `package.upgrade.run`)
- Reutiliza `CommandOrchestratorService.createBatch` com `NodeCommandType.package_upgrade`
- Pré-validação por firewall: heartbeat recente, agente ≥ mínimo, versão desatualizada
- Painel `/nodes`: checkboxes na tabela + card **Atualizar package em lote**
- Resultado por dispositivo (enfileirado / ignorado / falha) + polling do lote via `GET /api/v1/command-batches/:id`

## API — batch

```json
POST /api/v1/package-upgrade/batch
{
  "node_ids": ["uuid-1", "uuid-2"],
  "label": "Inventário — package upgrade (2 nodes)",
  "client_id": "optional-scope-uuid"
}
```

Resposta inclui `summary` (total, enqueued, skipped, failed) e `results[]` por `node_id`.

## Painel

1. Acesse **Inventário** (`/nodes`)
2. Filtre clientes/sites se necessário
3. Marque os firewalls desejados (checkbox)
4. Em **Ações em lote** → **Atualizar package selecionados…**
5. Digite `CONFIRMAR` e confirme
6. Acompanhe a tabela de resultados e o progresso do lote

## Limitações

- Mesmas regras do upgrade unitário (agente ≥ 0.4.6, heartbeat &lt; 5 min, feature flag)
- Firewalls já na versão publicada ou offline são **ignorados** (não abortam o lote)
- Limite global `PACKAGE_UPGRADE_MAX_CONCURRENT` continua aplicável
- Seleção limitada aos até 200 itens do filtro atual

## Arquivos principais

- `apps/api/src/package-upgrade/package-upgrade.service.ts` — `createUpgradeBatch`
- `apps/api/src/package-upgrade/package-upgrade-batch.controller.ts`
- `apps/web/components/nodes/fleet-batch-package-upgrade-panel.tsx`
- `apps/web/components/nodes/fleet-inventory-section.tsx`
