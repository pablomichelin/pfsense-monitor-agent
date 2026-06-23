# 82 — Entrega front-end Fase 3 (Firewalls inventário)

**Data:** 2026-06-09  
**Versão painel:** `0.4.0`  
**API:** `0.2.6` (campos opcionais na listagem)  
**Plano:** `26-plano-fase3-firewalls-inventario-backup-alertas-2026-06-09.md`  
**Trilha:** `docs/82-TRILHA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md`

---

## 1. Resumo

Inventário `/nodes` refatorado com design system: colunas **Backup** e **Alertas**, filtros em `Card`/`Button`, ordenação via query string e perfil `client` sem coluna de alertas. Extensão mínima da API para expor `backup_status` na listagem.

---

## 2. Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `26-plano-fase3-firewalls-inventario-backup-alertas-2026-06-09.md` | Plano Fase 3 |
| `docs/82-TRILHA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md` | Trilha executável |
| `apps/api/src/nodes/backup-visual-status.util.ts` | Derivação status backup (regra 36h) |
| `apps/web/lib/backup-status.ts` | Mapa para `StatusBadge` |
| `apps/web/components/nodes/installation-badge.tsx` | Badge instalação/bootstrap |
| `apps/web/components/nodes/nodes-inventory-table.tsx` | Tabela inventário |

---

## 3. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `apps/api/src/nodes/nodes.service.ts` | `backup_status`, `latest_backup_received_at` na listagem |
| `apps/web/app/nodes/page.tsx` | Design system, filtros, ordenação, perfil client |
| `apps/web/lib/api.ts` | Tipos da listagem |
| `apps/api/package.json` | Versão `0.2.6` |
| `apps/web/package.json` | Versão `0.4.0` |

---

## 4. Mudanças visuais e de fluxo

- **Status:** `StatusBadge` PT-BR (Degradado, Manutenção, etc.)
- **Backup:** `StatusBadge` backup-* + idade relativa do último envio
- **Alertas:** contagem com `Badge`; coluna oculta para perfil `client`
- **Instalação:** `InstallationBadge` + link Abrir
- **Filtros:** `PageSection` + `Card` + `Button`; opções de ordenação
- **Empty state:** `Alert` info

---

## 5. API

`GET /api/v1/nodes` — novos campos por item:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `backup_status` | `ok` \| `late` \| `failed` \| `never` | Mesma regra do bloco de detalhe (36h) |
| `latest_backup_received_at` | ISO \| `null` | Último backup armazenado |

---

## 6. Perfis

| Perfil | Comportamento |
|--------|---------------|
| Operador | Colunas Status, Backup, Alertas, Instalação |
| Client | Sem coluna Alertas |

---

## 7. Como validar

1. Acessar `/nodes` — tabela com colunas novas
2. Filtrar por status offline — URL reflete query params
3. Ordenar por versão pfSense — ordem muda
4. Perfil client — sem coluna Alertas
5. Comparar backup de um nó com detalhe `/nodes/[id]`
6. Rodapé exibe `v0.4.0`
7. Shell sidebar/header inalterados

---

## 8. Build e deploy

```bash
cd apps/api && npm run build
cd apps/web && npm run build
cd /Dados/Monitor-Pfsense && docker compose up -d --build
```

---

## 9. Deferidos (Fase 4+)

- Detalhe firewall em abas
- Backups frota agregada
- Refatoração tabela admin (`nodes-table-with-delete`)
