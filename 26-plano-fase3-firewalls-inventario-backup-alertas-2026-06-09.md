# 26. Plano de execução — Fase 3: Firewalls inventário (backup + alertas)

Data: `2026-06-09`  
Status: `encerrado` — ver `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`  
Próximo passo operacional: `docs/82-TRILHA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md`

## Documentos relacionados

| Documento | Papel |
|-----------|--------|
| `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md` | Roadmap UX; Fase 3 na seção "Próximas fases" |
| `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md` | Shell Fase 1 (intocado) |
| `docs/81-ENTREGA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md` | Dashboard enxuto; CTA → `/nodes` |
| `docs/65-FRONTEND-E-DEPLOY-BACKUP-PFSENSE-2026-06-08.md` | Estados de backup no detalhe |
| `docs/SISTEMA-VISUAL-PAINEL.md` | Tokens e padrões visuais |

## Objetivo desta trilha

Refatorar `/nodes` (inventário de firewalls) com o design system da Fase 0, adicionando colunas **Alertas** e **Backup**, mantendo filtros, ordenação e diferenças de perfil `client` vs operador — **sem** alterar shell global, detalhe `/nodes/[id]` ou páginas admin.

## Versões alvo ao encerrar

| Componente | Versão atual | Versão alvo | Tipo de bump |
|------------|--------------|-------------|--------------|
| API | `0.2.5` | `0.2.6` | **patch** — campos opcionais `backup_status` e `latest_backup_received_at` em `GET /api/v1/nodes` |
| Painel web | `0.3.0` | `0.4.0` | **minor** — novas colunas e refactor visual do inventário |

Entrega documental: `docs/82-ENTREGA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md`

---

## Escopo autorizado

### Inventário `/nodes`

- Adotar `StatusBadge`, `Badge`, `Card`, `PageSection`, `Button`
- Coluna **Status** via `StatusBadge` (labels PT-BR)
- Coluna **Alertas** com contagem `open_alerts` (oculta para perfil `client`, alinhado ao dashboard)
- Coluna **Backup** com `StatusBadge` (`backup-ok` / `backup-late` / `backup-failed` / `backup-never`) + idade relativa
- Manter filtros: cliente, site, status, busca
- Adicionar ordenação: `sort_by` (nome, agente, versão) + `sort_order`
- Resumo no hero: itens exibidos, agentes ativos, bloqueados (mantido)
- `RealtimeRefresh` no aside do hero

### API mínima (necessidade comprovada)

A listagem não expunha resumo de backup; N chamadas a `/config-backups` por nó seria inviável (até 200 itens). Extensão mínima em `listNodes`:

- `backup_status`: `ok` \| `late` \| `failed` \| `never` (regra 36h igual ao bloco de detalhe)
- `latest_backup_received_at`: ISO ou `null`

### Preservar

- Shell Fase 1: sidebar, header, breadcrumbs, `app/layout.tsx`
- Página detalhe `/nodes/[id]` (Fase 4)
- Demais páginas operacionais e admin
- Permissões e escopo RBAC inalterados

---

## Fora de escopo (proibido)

- Detalhe firewall em abas (Fase 4)
- Página Backups frota / menu Backups (Fase 5)
- Refatoração global de admin, alertas, bootstrap, auditoria
- Alteração de shell global (salvo bug crítico)
- Endpoint agregado de backups frota

---

## Arquivos previstos

| Arquivo | Ação |
|---------|------|
| `apps/api/src/nodes/backup-visual-status.util.ts` | **Novo** — derivação de status backup |
| `apps/api/src/nodes/nodes.service.ts` | Incluir resumo backup na listagem |
| `apps/web/lib/api.ts` | Tipos `backup_status`, `latest_backup_received_at` |
| `apps/web/lib/backup-status.ts` | **Novo** — mapa para `StatusBadge` |
| `apps/web/components/nodes/nodes-inventory-table.tsx` | **Novo** — tabela com design system |
| `apps/web/components/nodes/installation-badge.tsx` | **Novo** — badge instalação/bootstrap |
| `apps/web/app/nodes/page.tsx` | Refatoração principal |
| `26-plano-fase3-...md` | Este plano |
| `docs/82-TRILHA-...md` | Trilha executável |
| `docs/82-ENTREGA-...md` | Entrega ao concluir |

---

## Critérios de aceite

- [ ] `/nodes` usa componentes do design system
- [ ] Coluna Alertas visível para operador; oculta para perfil `client`
- [ ] Coluna Backup com status e idade do último backup
- [ ] Filtros e ordenação funcionam via query string
- [ ] Links para detalhe e alertas preservados
- [ ] Shell Fase 1 inalterado
- [ ] Build web + API ok; containers sobem após deploy
- [ ] Rodapé exibe `v0.4.0`

---

## Próximas fases (fora desta entrega)

| Fase | Conteúdo |
|------|----------|
| 4 | Detalhe firewall em abas |
| 5 | Página Backups frota + menu |
| 6 | Usuários lista/drawer; Conta separada |
| 7 | Auditoria filtros amigáveis |
| 8 | Adoção design system nas pages restantes |
