# 87 — Entrega front-end Fase 8 (design system pages restantes)

**Data:** 2026-06-09  
**Versão painel:** `1.0.0`  
**API:** `0.2.7` (sem alteração)  
**Plano:** `31-plano-fase8-design-system-pages-restantes-2026-06-09.md`  
**Trilha:** `docs/87-TRILHA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md`

---

## 1. Resumo

Última fase do **roadmap UX plano 24**: adoção global do design system (`Button`, `Badge`, `Alert`, `Card`, `PageSection`, `DataTable`) nas páginas que ainda usavam padrão legado. Componente **`DataTable`** criado como wrapper fino para tabelas operacionais. **Roadmap UX plano 24 encerrado.**

---

## 2. DataTable

| Arquivo | Descrição |
|---------|-----------|
| `apps/web/components/ui/data-table.tsx` | Wrapper `Card` + `table` + toolbar + empty state |
| `apps/web/lib/form-field-styles.ts` | Classes compartilhadas input/select |

---

## 3. Páginas migradas

| Rota / componente | Mudança principal |
|-------------------|-------------------|
| `/alerts` | PageSection, Card, Badge, Button; labels PT-BR |
| `/bootstrap` | Card, Badge, Button, Alert, PageSection; acentos PT-BR |
| `/admin` | PageSection + Card nos atalhos |
| `/admin/usuarios` | PageSection + Card |
| `/admin/clientes` | PageSection + Card + Button + Alert |
| `/admin/permissoes` | PageSection + Card |
| `/sessions` | DataTable + Badge + Button |
| `/login` | Card no formulário |
| `admin-collapsible-card.tsx` | Card + Button |
| `nodes-table-with-delete.tsx` | DataTable + StatusBadge (órfão — não importado) |

**Não alteradas (Fases 2–7):** dashboard, nodes, detalhe, backups, conta, audit.

---

## 4. Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `31-plano-fase8-design-system-pages-restantes-2026-06-09.md` | Plano Fase 8 |
| `docs/87-TRILHA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md` | Trilha executável |
| `apps/web/components/ui/data-table.tsx` | Componente DataTable |
| `apps/web/lib/form-field-styles.ts` | Estilos de formulário |

---

## 5. Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/app/alerts/page.tsx` | Design system |
| `apps/web/app/bootstrap/page.tsx` | Design system |
| `apps/web/app/admin/page.tsx` | Design system |
| `apps/web/app/admin/usuarios/page.tsx` | Design system |
| `apps/web/app/admin/clientes/page.tsx` | Design system |
| `apps/web/app/admin/permissoes/page.tsx` | Design system |
| `apps/web/app/sessions/page.tsx` | DataTable |
| `apps/web/app/login/page.tsx` | Card |
| `apps/web/components/admin-collapsible-card.tsx` | Card + Button |
| `apps/web/components/nodes-table-with-delete.tsx` | DataTable |
| `apps/web/components/ui/index.ts` | Export DataTable |
| `apps/web/package.json` | Versão `1.0.0` |

---

## 6. Como validar

Checklist (automático parcial + smoke `2026-06-10`):

- [x] Login no painel — rodapé exibe `v1.0.0` (`curl /login`, `smoke-frontend-assets.sh`)
- [x] Rotas protegidas redirecionam sem sessão (`/dashboard`, `/nodes`, `/alerts`, `/audit`, `/backups`, `/conta` → HTTP 307)
- [x] `/healthz` → HTTP 200, `database: up` (versão de serviço alinhada após `SYSTEM_VERSION=0.2.7` + restart API)
- [x] `/alerts`, `/bootstrap`, `/admin/*`, `/sessions` — smoke RBAC/operacional e renderização validados na suite (exceto ajuste PT-BR em `smoke-auth-sessions.sh`, corrigido)
- [x] Smokes automatizados principais OK (`frontend-assets`, `agent-release`, `realtime`, `auth-sessions`, `admin-operations`); suite completa bloqueada em `smoke-bootstrap-flow` enquanto `PACKAGE_RELEASE_VERSION` no env divergir do artefato publicado

Validação manual recomendada (UI fina): filtros em Card em `/alerts`; cards colapsáveis em `/admin`; DataTable em `/sessions`.

---

## 7. Build e deploy

```bash
cd apps/web && npm run build
cd /Dados/Monitor-Pfsense && docker compose up -d --build
```

---

## 8. Encerramento roadmap UX

O plano `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md` previa 8 fases (0–8). Com esta entrega, **todas as fases estão concluídas**. Próximas evoluções de UX devem abrir **nova trilha** com plano próprio.
