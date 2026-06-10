# 28. Plano de execução — Fase 5: Backups frota + menu

Data: `2026-06-09`  
Status: `encerrado` — ver `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`  
Próximo passo operacional: `docs/84-TRILHA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md`

## Documentos relacionados

| Documento | Papel |
|-----------|--------|
| `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md` | Roadmap UX — Fase 5 |
| `docs/83-ENTREGA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md` | Entrega anterior (detalhe abas) |
| `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md` | Contrato backup |
| `docs/65-FRONTEND-E-DEPLOY-BACKUP-PFSENSE-2026-06-08.md` | UI backup por nó |
| `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md` | Permissão `backups.view` |
| `docs/SISTEMA-VISUAL-PAINEL.md` | Design system |

## Objetivo

Criar página **`/backups`** com visão frota de backups `config.xml`, item **Backups** no menu Operação e proteção de rota — preservando backup por nó em `/nodes/[id]?tab=backup`.

## Versões alvo

| Componente | Versão atual | Versão alvo | Tipo |
|------------|--------------|-------------|------|
| API | `0.2.6` | `0.2.6` | Sem alteração (estratégia front) |
| Painel web | `0.5.0` | `0.6.0` | **minor** — nova rota + menu |

## Decisão de API

`GET /api/v1/nodes` já expõe `backup_status` e `latest_backup_received_at` (Fase 3). **Não criar endpoint agregado** nesta fase — a página consome a listagem existente e calcula KPIs/filtros no front.

## Escopo autorizado

### Página `/backups`

- `PageHero` com KPIs: em dia, atrasados, falharam, nunca
- Filtros: cliente, site, status backup, busca textual, ordenação
- Tabela frota: firewall, local, status backup, último backup, idade, link para `/nodes/[id]?tab=backup`
- `RealtimeRefresh` com `generated_at` da listagem
- Design system: `PageSection`, `Card`, `StatusBadge` (`backup-*`), `Button`, `Alert`

### Menu e rota

- Item **Backups** no grupo Operação quando `backups.view`
- `middleware` / `route-policy`: rota `/backups` exige `backups.view`
- Breadcrumb: Operação › Backups

### Arquivos novos

- `apps/web/app/backups/page.tsx`
- `apps/web/components/backups/backups-fleet-table.tsx`
- `apps/web/lib/backup-fleet-helpers.ts`

### Arquivos alterados

- `apps/web/lib/route-policy.ts` — menu + regra de rota
- `apps/web/components/breadcrumbs.tsx` — `/backups`

## Fora de escopo

- Endpoint agregado dedicado (`GET /api/v1/backups/fleet`)
- Fase 6 (Conta), Fase 7 (Auditoria), Fase 8 (DataTable global)
- Refatorar admin pages
- Alterar fluxos de solicitar/download backup existentes

## Permissões

| Elemento | Permissão |
|----------|-----------|
| Menu Backups | `backups.view` |
| Rota `/backups` | `backups.view` |
| Dados da listagem | `firewalls.view` (já concedida a todos com `backups.view`) |
| Ação solicitar backup | permanece em `/nodes/[id]?tab=backup` (`backups.run`) |
| Download | permanece em detalhe (`backups.download`) |

## Critérios de aceite

- [ ] `/backups` acessível com `backups.view`; bloqueado sem permissão
- [ ] Menu Backups visível no grupo Operação
- [ ] KPIs e tabela coerentes com status da API
- [ ] Link "Ver backup" abre aba backup do firewall
- [ ] `/nodes/[id]?tab=backup` inalterado
- [ ] Build web OK; deploy OK; rodapé `v0.6.0`

## Próximas fases

| Fase | Conteúdo |
|------|----------|
| 6 | Usuários drawer; Conta separada; polimento PT-BR |
| 7 | Auditoria filtros amigáveis |
| 8 | Design system nas pages restantes |
