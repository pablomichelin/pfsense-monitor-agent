# 27. Plano de execução — Fase 4: detalhe firewall em abas

Data: `2026-06-09`  
Status: `encerrado` — ver `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`  
Próximo passo operacional: `docs/83-TRILHA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md`

## Documentos relacionados

| Documento | Papel |
|-----------|--------|
| `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md` | Roadmap UX — Fase 4 |
| `docs/82-ENTREGA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md` | Entrega anterior (inventário) |
| `docs/SISTEMA-VISUAL-PAINEL.md` | Design system |

## Objetivo

Refatorar **`/nodes/[id]`** de scroll longo para layout em **abas operacionais**, preservando todas as funcionalidades (métricas, serviços, interfaces, maintenance, backups, alertas, bootstrap, edição de metadados).

## Versões alvo

| Componente | Versão atual | Versão alvo | Tipo |
|------------|--------------|-------------|------|
| API | `0.2.6` | `0.2.6` | Sem alteração |
| Painel web | `0.4.0` | `0.5.0` | **minor** — nova navegação no detalhe |

## Escopo autorizado

### Abas

| Aba | ID query `?tab=` | Conteúdo | Visibilidade |
|-----|------------------|----------|--------------|
| Visão geral | `overview` (default) | Identidade, interfaces, maintenance | Todos |
| Métricas | `metrics` | CPU/mem/disco/uptime + serviços VPN | Todos |
| Alertas | `alerts` | `recent_alerts` | Operadores (não `client`) |
| Backup | `backup` | `NodeConfigBackupsSection` | Todos com permissão de backup |
| Configuração | `config` | Editar cadastro + bootstrap/instalar agente | `firewalls.update` ou bootstrap visível |

### Design system

- `PageSection`, `Card`, `Alert`, `Button`, `Badge`, `StatusBadge` nas novas seções
- `PageHero` mantido acima das abas
- Flash messages (`created`, `rekey`, `maintenance`, `updated`) com `Alert`

### Componentes novos

- `apps/web/components/nodes/node-detail-tabs.tsx` (client — navegação)
- `apps/web/components/nodes/node-detail-*-tab.tsx` (painéis)
- `apps/web/lib/node-detail-helpers.ts` (helpers extraídos da page)

## Fora de escopo

- Shell global, dashboard, `/nodes` list, admin pages
- Página Backups frota (Fase 5)
- Alterações de API
- Remoção de features existentes

## Perfis

| Perfil | Abas visíveis |
|--------|---------------|
| Operador | Todas conforme permissão |
| Client | Sem Alertas; Config só se bootstrap permitido |

## Critérios de aceite

- [ ] Abas navegáveis sem perda de funcionalidade
- [ ] `?tab=` persiste na URL ao trocar aba
- [ ] Parâmetros bootstrap (`heartbeat_mode`, etc.) preservados
- [ ] Perfil `client` sem aba Alertas
- [ ] Build web OK; deploy OK; rodapé `v0.5.0`

## Próximas fases

| Fase | Conteúdo |
|------|----------|
| 5 | Backups frota + menu |
| 6 | Usuários drawer; Conta separada |
| 7 | Auditoria filtros |
| 8 | Design system nas pages restantes |
