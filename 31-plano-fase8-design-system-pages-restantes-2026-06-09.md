# 31. Plano de execução — Fase 8: design system nas pages restantes

Data: `2026-06-09`  
Status: `encerrado` — ver `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`  
Próximo passo operacional: `docs/87-TRILHA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md`

## Documentos relacionados

| Documento | Papel |
|-----------|--------|
| `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md` | Roadmap UX — Fase 8 (última) |
| `docs/86-ENTREGA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md` | Entrega anterior |
| `docs/SISTEMA-VISUAL-PAINEL.md` | Design system |

## Objetivo

Adotar o design system (`Button`, `Badge`, `StatusBadge`, `Alert`, `Card`, `PageSection`, `DataTable`) nas **páginas restantes** que ainda usam padrão legado (`glass-panel` direto, botões inline, tabelas sem wrapper). **Encerrar o roadmap UX do plano 24.**

## Versões alvo

| Componente | Versão atual | Versão alvo | Tipo |
|------------|--------------|-------------|------|
| API | `0.2.7` | `0.2.7` | **Sem alteração** |
| Painel web | `0.8.0` | `1.0.0` | **minor** — adoção ampla + fechamento roadmap UX |

## Auditoria — páginas a migrar

| Página / componente | Estado antes | Ação |
|---------------------|--------------|------|
| `/alerts` | `glass-panel`, badges inline | Migrar design system + PT-BR |
| `/bootstrap` | `glass-panel`, botões inline | Migrar design system + PT-BR |
| `/admin` (cadastro) | `glass-panel`, links inline | `PageSection` + `Card` + `Button` |
| `/admin/usuarios` | `glass-panel` | `PageSection` + `Card` |
| `/admin/clientes` | `glass-panel`, forms legados | `PageSection` + `Card` + `Button` |
| `/admin/permissoes` | `glass-panel` | `PageSection` + `Card` |
| `/sessions` | `glass-panel`, tabela inline | `DataTable` + `Badge` + `Button` |
| `/login` | `glass-panel` no form | `Card` |
| `admin-collapsible-card.tsx` | `glass-panel` | `Card` + `Button` |
| `nodes-table-with-delete.tsx` | órfão (não importado) | Atualizar para `DataTable` (consistência) |

## Fora de escopo

- Páginas já entregues Fases 2–7 (dashboard, nodes, detalhe, backups, conta, audit) — salvo ajustes mínimos
- Shell global (sidebar, header, layout)
- Backend / API
- Novas features

## Componente novo

- `apps/web/components/ui/data-table.tsx` — wrapper fino (`Card` + `table` + toolbar + empty state)
- `apps/web/lib/form-field-styles.ts` — classes compartilhadas de input/select

## Critério de versão `1.0.0`

Fase 8 encerra as 8 fases do plano 24; adoção do design system nas pages operacionais/admin restantes justifica **minor** para `1.0.0` (marco de maturidade UX do painel).

## Arquivos novos

- `31-plano-fase8-design-system-pages-restantes-2026-06-09.md`
- `docs/87-TRILHA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md`
- `docs/87-ENTREGA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md`
- `apps/web/components/ui/data-table.tsx`
- `apps/web/lib/form-field-styles.ts`

## Checklist de encerramento

- [x] DataTable criado e exportado em `components/ui`
- [x] Pages prioritárias migradas
- [x] PT-BR em acentos óbvios (admin, bootstrap, alerts)
- [x] Bump painel `1.0.0`
- [x] Índices + histórico atualizados
- [x] Build web + `docker compose up -d --build`
- [x] Roadmap UX plano 24 **encerrado**
