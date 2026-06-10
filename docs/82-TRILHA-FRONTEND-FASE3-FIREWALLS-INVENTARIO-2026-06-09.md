# Trilha executável — Front-end Fase 3 (Firewalls inventário)

**Data:** 2026-06-09  
**Status:** em execução  
**Plano mestre:** `26-plano-fase3-firewalls-inventario-backup-alertas-2026-06-09.md`  
**Entrega anterior:** `docs/81-ENTREGA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md`

## Objetivo

Checklist para refatorar **somente** `/nodes`: design system, colunas backup e alertas, filtros + ordenação — **sem** shell, detalhe ou páginas admin.

## Versão alvo

- Painel web: `0.3.0` → `0.4.0` (minor)
- API: `0.2.5` → `0.2.6` (patch — campos opcionais na listagem)

---

## Pré-voo

- [x] Ler `26-plano-fase3-firewalls-inventario-backup-alertas-2026-06-09.md`
- [x] Ler `apps/web/app/nodes/page.tsx` atual
- [x] Confirmar `open_alerts` já na API de listagem
- [x] Confirmar ausência de resumo backup na listagem (extensão API necessária)

---

## Bloco A — API mínima

### A1. Util backup

- [ ] `backup-visual-status.util.ts` com regra 36h e falha recente

### A2. `nodes.service.ts`

- [ ] Include último backup armazenado + último comando `config_backup_now` falho
- [ ] Expor `backup_status` e `latest_backup_received_at` em cada item

### A3. Build API

```bash
cd apps/api && npm run build
```

---

## Bloco B — Componentes web

### B1. `installation-badge.tsx`

- [ ] Badge design system: bloqueado / agente ativo / pronto p/ bootstrap

### B2. `nodes-inventory-table.tsx`

- [ ] `StatusBadge` para status operacional e backup
- [ ] Coluna alertas com `Badge` (link para `/alerts` se operador)
- [ ] Coluna instalação + link Abrir

### B3. `backup-status.ts`

- [ ] Mapa `ok|late|failed|never` → `StatusBadgeStatus`

---

## Bloco C — Página `/nodes`

### C1. `page.tsx`

- [ ] `getSession` + `isClientRole` para ocultar alertas
- [ ] Filtros em `Card` + `Button` primary
- [ ] Ordenação `sort_by` / `sort_order` no form
- [ ] `PageSection` para filtros e tabela
- [ ] Tipos API atualizados em `lib/api.ts`

### C2. Build web

```bash
cd apps/web && npm run build
```

---

## Bloco D — Versionamento e docs

- [ ] Bump `apps/web/package.json` → `0.4.0`
- [ ] Bump `apps/api/package.json` → `0.2.6`
- [ ] Atualizar índices e `docs/HISTORICO-E-LINHA-DO-TEMPO.md`
- [ ] Criar `docs/82-ENTREGA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md`

---

## Bloco E — Deploy

```bash
cd /opt/Monitor-Pfsense && docker compose up -d --build
```

---

## Testes manuais

1. `/nodes` — tabela com colunas Status, Firewall, Local, Versão, Último contato, Backup, Alertas (operador), Instalação
2. Perfil `client` — sem coluna Alertas
3. Filtros + ordenação via URL
4. Backup: badges coerentes com detalhe do firewall
5. Rodapé `v0.4.0`; shell inalterado

---

## Deferidos (Fase 4+)

- Detalhe em abas
- Backups frota agregada
- Refatoração `nodes-table-with-delete` (admin)
