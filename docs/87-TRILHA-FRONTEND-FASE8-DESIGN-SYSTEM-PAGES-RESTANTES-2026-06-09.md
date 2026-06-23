# Trilha executável — Front-end Fase 8 (design system pages restantes)

**Data:** 2026-06-09  
**Status:** concluída  
**Plano mestre:** `31-plano-fase8-design-system-pages-restantes-2026-06-09.md`  
**Entrega anterior:** `docs/86-ENTREGA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md`

## Objetivo

Adotar design system e `DataTable` nas páginas restantes; **encerrar roadmap UX plano 24**.

## Versão alvo

- Painel web: `0.8.0` → `1.0.0` (minor — fechamento roadmap)
- API: `0.2.7` (sem alteração)

---

## Pré-voo

- [x] Auditar pages com `glass-panel` direto (fora Fases 2–7)
- [x] Ler `docs/SISTEMA-VISUAL-PAINEL.md` e `components/ui/*`
- [x] Confirmar `nodes-table-with-delete` órfão (substituído por `NodesInventoryTable`)

---

## Bloco A — DataTable

- [x] `apps/web/components/ui/data-table.tsx`
- [x] `apps/web/lib/form-field-styles.ts`
- [x] Export em `components/ui/index.ts`

---

## Bloco B — Migração pages

- [x] `/alerts` — PageSection, Card, Badge, Button, PT-BR
- [x] `/bootstrap` — Card, Badge, Button, Alert, PageSection
- [x] `/admin` — PageSection, Card, atalhos
- [x] `/admin/usuarios` — PageSection, Card
- [x] `/admin/clientes` — PageSection, Card, Button, Alert
- [x] `/admin/permissoes` — PageSection, Card
- [x] `/sessions` — DataTable, Badge, Button, Alert
- [x] `/login` — Card
- [x] `admin-collapsible-card.tsx` — Card, Button
- [x] `nodes-table-with-delete.tsx` — DataTable (consistência)

---

## Bloco C — Documentação e versão

- [x] Bump `apps/web/package.json` → `1.0.0`
- [x] Índices + histórico
- [x] `docs/87-ENTREGA-...`
- [x] Build web + deploy

```bash
cd apps/web && npm run build
cd /Dados/Monitor-Pfsense && docker compose up -d --build
```
