# Matriz de Decisão Executável — Simplificação do Monitor-Pfsense

**Data:** 2026-03-14  
**Objetivo:** Informação técnica acionável para decidir o que remover, consolidar, ajustar ou manter, sem quebrar o que funciona.

---

## 1. Resumo Executivo Curto

A matriz abaixo foi extraída do código real do projeto. Cada item tem origem de dados, dependências e risco documentados. Há **12 remoções seguras imediatas**, **8 consolidações de baixo risco** e **3 itens que parecem excesso mas devem permanecer**. A ordem recomendada é em 3 ondas: onda 1 (muito baixo risco), onda 2 (baixo risco), onda 3 (médio risco). Os arquivos mais impactados são `apps/web/app/dashboard/page.tsx`, `apps/web/app/alerts/page.tsx`, `apps/web/app/sessions/page.tsx`, `apps/web/app/bootstrap/page.tsx`, `apps/web/app/login/page.tsx` e `apps/web/app/layout.tsx`.

---

## 2. Matriz Detalhada por Item

### A. DASHBOARD

| # | Campo | Valor |
|---|-------|-------|
| **DASH-01** | | |
| 1. Nome do item | Hero stat "Nodes" | |
| 2. Tela / rota | `/dashboard` | |
| 3. Componente / arquivo exato | `apps/web/app/dashboard/page.tsx` L74-79, PageHero stats | |
| 4. Origem dos dados | API `getDashboardSummary()` → `summary.totals.nodes` | |
| 5. Finalidade original | Resumo executivo do total de nodes | |
| 6. Uso real hoje | Mostra total; também está no SummaryCard L84 | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | UI apenas, API `/api/v1/dashboard/summary` | |
| 9. Duplicidade | **Duplicidade visual** — idêntico ao SummaryCard "Nodes" L84 | |
| 10. Risco de alteração | Muito baixo | |
| 11. O que pode quebrar | Nada funcional | |
| 12. Testes que precisam passar | smoke-realtime-refresh, smoke-frontend-assets | |
| 13. Recomendação | **Ajustar** — remover "Nodes" do PageHero, manter apenas no SummaryCard | |
| 14. Justificativa | PageHero com 3 stats fica redundante; SummaryCard já mostra Nodes | |
| 15. Ganho esperado | Menos duplicidade, menos ruído | |

| # | Campo | Valor |
|---|-------|-------|
| **DASH-02** | | |
| 1. Nome do item | Hero stat "Alertas abertos" | |
| 2. Tela / rota | `/dashboard` | |
| 3. Componente / arquivo exato | `apps/web/app/dashboard/page.tsx` L76-77 | |
| 4. Origem dos dados | API `summary.totals.open_alerts` | |
| 5. Finalidade original | Alerta rápido de problemas | |
| 6. Uso real hoje | Valor duplicado no SummaryCard "Open Alerts" L89 | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | UI, API | |
| 9. Duplicidade | **Duplicidade visual** — mesmo valor em PageHero e SummaryCard | |
| 10. Risco de alteração | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-realtime-refresh | |
| 13. Recomendação | **Ajustar** — remover "Alertas abertos" do PageHero OU remover SummaryCard "Open Alerts"; manter um só | |
| 14. Justificativa | Um ponto único é suficiente | |
| 15. Ganho | Menos duplicidade | |

| # | Campo | Valor |
|---|-------|-------|
| **DASH-03** | | |
| 1. Nome do item | SummaryCard "Nodes" | |
| 2. Tela / rota | `/dashboard` | |
| 3. Componente / arquivo exato | `apps/web/app/dashboard/page.tsx` L84, SummaryCard | |
| 4. Origem dos dados | API `summary.totals.nodes` | |
| 5. Finalidade original | Total de nodes | |
| 6. Uso real hoje | Duplicado com PageHero | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | UI, API | |
| 9. Duplicidade | Duplicidade visual com PageHero | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-realtime-refresh | |
| 13. Recomendação | **Manter** (se remover do PageHero) ou **Consolidar** em um único bloco | |
| 14. Justificativa | O total de nodes é útil; não precisa estar em 2 lugares | |
| 15. Ganho | Menos ruído | |

| # | Campo | Valor |
|---|-------|-------|
| **DASH-04** | | |
| 1. Nome do item | SummaryCard "Open Alerts" | |
| 2. Tela / rota | `/dashboard` | |
| 3. Componente / arquivo exato | `apps/web/app/dashboard/page.tsx` L89 | |
| 4. Origem dos dados | API `summary.totals.open_alerts` | |
| 5. Finalidade original | Quantidade de alertas abertos | |
| 6. Uso real hoje | Duplicado no PageHero | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | UI, API | |
| 9. Duplicidade | Duplicidade visual | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-realtime-refresh | |
| 13. Recomendação | **Manter** (consolidar removendo do PageHero) | |
| 14. Justificativa | Card é o local mais visível; PageHero pode ter só 2 stats | |
| 15. Ganho | Menos duplicidade | |

| # | Campo | Valor |
|---|-------|-------|
| **DASH-05** | | |
| 1. Nome do item | SummaryCard "Fora da matriz" | |
| 2. Tela / rota | `/dashboard` | |
| 3. Componente / arquivo exato | `apps/web/app/dashboard/page.tsx` L90-94 | |
| 4. Origem dos dados | API `summary.totals.versions_out_of_matrix` | |
| 5. Finalidade original | Versões pfSense fora da matriz homologada | |
| 6. Uso real hoje | Também no PageHero (L78) | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | UI, API, `summary.version_matrix` | |
| 9. Duplicidade | Duplicidade visual | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-realtime-refresh | |
| 13. Recomendação | **Consolidar** — manter no PageHero OU no card, não nos dois | |
| 14. Justificativa | Informação importante; um único ponto basta | |
| 15. Ganho | Menos ruído | |

| # | Campo | Valor |
|---|-------|-------|
| **DASH-06** | | |
| 1. Nome do item | Zona quente | |
| 2. Tela / rota | `/dashboard` | |
| 3. Componente / arquivo exato | `apps/web/app/dashboard/page.tsx` L97-150 | |
| 4. Origem dos dados | Derivado de `nodes.items` (API `getNodesList`) filtrado por offline/degraded, slice(0,6) | |
| 5. Finalidade original | Listar firewalls que exigem atenção | |
| 6. Uso real hoje | Ação operacional imediata | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API getNodesList, UI, navegação (links para /nodes e /nodes/[id]) | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Baixo (não mexer na lógica) | |
| 11. O que pode quebrar | Se alterar filtro ou slice | |
| 12. Testes | smoke-realtime-refresh | |
| 13. Recomendação | **Manter** | |
| 14. Justificativa | Core operacional; CORTEX define zona quente como essencial | |
| 15. Ganho | Melhor operação | |

| # | Campo | Valor |
|---|-------|-------|
| **DASH-07** | | |
| 1. Nome do item | Matriz de versão | |
| 2. Tela / rota | `/dashboard` | |
| 3. Componente / arquivo exato | `apps/web/app/dashboard/page.tsx` L152-187 | |
| 4. Origem dos dados | Derivado de `nodes.items` (reduce por pfsense_version) + `summary.version_matrix.homologated_pfsense_versions` | |
| 5. Finalidade original | Ver distribuição de versões pfSense | |
| 6. Uso real hoje | Governança e planejamento de upgrades | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API getNodesList, getDashboardSummary, UI | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Baixo | |
| 11. O que pode quebrar | Nada se não alterar lógica | |
| 12. Testes | smoke-realtime-refresh | |
| 13. Recomendação | **Manter** | |
| 14. Justificativa | 08-painel-web-e-telas e CORTEX exigem visibilidade de versão | |
| 15. Ganho | Melhor operação | |

---

### B. INVENTÁRIO / FIREWALLS

| # | Campo | Valor |
|---|-------|-------|
| **INV-01** | | |
| 1. Nome do item | Hero stats (Itens filtrados, Agente ativo, Bloqueados) | |
| 2. Tela / rota | `/nodes` | |
| 3. Componente / arquivo exato | `apps/web/app/nodes/page.tsx` L126-135 | |
| 4. Origem dos dados | `nodes.items.length` (API) + `bootstrapSummary` derivado de nodes.items | |
| 5. Finalidade original | Contexto do inventário filtrado | |
| 6. Uso real hoje | Útil; bootstrapSummary repete nos 3 cards | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API getNodesList, getNodesFilters, query string | |
| 9. Duplicidade | Duplicidade parcial — bootstrapSummary usado em Hero e em 3 cards | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-realtime-refresh, smoke-admin-operations (nodes) | |
| 13. Recomendação | **Consolidar** — remover os 3 cards (Bootstrap, Agente ativo, Bloqueados), manter apenas PageHero | |
| 14. Justificativa | PageHero já mostra Agente ativo e Bloqueados; os 3 cards repetem | |
| 15. Ganho | Menos duplicidade, menos ruído | |

| # | Campo | Valor |
|---|-------|-------|
| **INV-02** | | |
| 1. Nome do item | Cards Bootstrap, Agente ativo, Bloqueados | |
| 2. Tela / rota | `/nodes` | |
| 3. Componente / arquivo exato | `apps/web/app/nodes/page.tsx` L193-235 | |
| 4. Origem dos dados | `bootstrapSummary` derivado de nodes.items | |
| 5. Finalidade original | Resumo do estágio de bootstrap | |
| 6. Uso real hoje | Duplica PageHero | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | UI apenas | |
| 9. Duplicidade | Duplicidade funcional com PageHero | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-realtime-refresh | |
| 13. Recomendação | **Remover** | |
| 14. Justificativa | PageHero stats cobrem a mesma informação | |
| 15. Ganho | Menos ruído, menos duplicidade | |

| # | Campo | Valor |
|---|-------|-------|
| **INV-03** | | |
| 1. Nome do item | Filtros (client_id, site_id, status, search) | |
| 2. Tela / rota | `/nodes` | |
| 3. Componente / arquivo exato | `apps/web/app/nodes/page.tsx` L137-191 | |
| 4. Origem dos dados | filterOptions da API getNodesFilters; values de query string | |
| 5. Finalidade original | Filtrar inventário | |
| 6. Uso real hoje | Essencial para operação | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API, query string (form GET) | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Alto se alterar parâmetros (backend espera client_id, site_id, status, search) | |
| 11. O que pode quebrar | Filtragem; API GET /api/v1/nodes | |
| 12. Testes | smoke-admin-operations | |
| 13. Recomendação | **Manter** | |
| 14. Justificativa | CORTEX define filtros obrigatórios | |
| 15. Ganho | — | |

| # | Campo | Valor |
|---|-------|-------|
| **INV-04** | | |
| 1. Nome do item | Tabela de firewalls | |
| 2. Tela / rota | `/nodes` | |
| 3. Componente / arquivo exato | `apps/web/app/nodes/page.tsx` L237-311 | |
| 4. Origem dos dados | API getNodesList, nodes.items | |
| 5. Finalidade original | Lista principal de firewalls | |
| 6. Uso real hoje | Core do inventário | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API, UI, Link para /nodes/[id] | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Alto | |
| 11. O que pode quebrar | Navegação, inventário | |
| 12. Testes | smoke-admin-operations | |
| 13. Recomendação | **Manter** | |
| 14. Justificativa | Essencial | |
| 15. Ganho | — | |

---

### C. ALERTAS

| # | Campo | Valor |
|---|-------|-------|
| **ALT-01** | | |
| 1. Nome do item | Hero stats (Abertos, Reconhecidos, Críticos) | |
| 2. Tela / rota | `/alerts` | |
| 3. Componente / arquivo exato | `apps/web/app/alerts/page.tsx` L171-180 | |
| 4. Origem dos dados | `openCount`, `acknowledgedCount`, `criticalCount` — derivados de alerts.items (filtro local), não de alerts.totals | |
| 5. Finalidade original | Resumo do escopo filtrado | |
| 6. Uso real hoje | Útil; openCount/ackCount duplicam alerts.totals quando sem filtro | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API getAlertsList, getSession, ALERT_WRITE_ROLES | |
| 9. Duplicidade | Parcial — PageHero usa counts locais; SummaryCards usam alerts.totals (API) | |
| 10. Risco | Baixo | |
| 11. O que pode quebrar | Exibição; totals vs items filtrados podem divergir | |
| 12. Testes | smoke-admin-operations (ack/resolve) | |
| 13. Recomendação | **Manter** PageHero; **Ajustar** para usar alerts.totals quando não há filtros | |
| 14. Justificativa | PageHero é contexto; SummaryCards são detalhe | |
| 15. Ganho | Consistência | |

| # | Campo | Valor |
|---|-------|-------|
| **ALT-02** | | |
| 1. Nome do item | SummaryCards Open, Acknowledged, Resolved | |
| 2. Tela / rota | `/alerts` | |
| 3. Componente / arquivo exato | `apps/web/app/alerts/page.tsx` L269-278 | |
| 4. Origem dos dados | API `alerts.totals.open`, `alerts.totals.acknowledged`, `alerts.totals.resolved` | |
| 5. Finalidade original | Contagem por status | |
| 6. Uso real hoje | Útil para triagem | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API getAlertsList | |
| 9. Duplicidade | Nenhuma entre os 3 | |
| 10. Risco | Baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-admin-operations | |
| 13. Recomendação | **Manter** | |
| 14. Justificativa | Status é o critério principal de workflow | |
| 15. Ganho | — | |

| # | Campo | Valor |
|---|-------|-------|
| **ALT-03** | | |
| 1. Nome do item | SummaryCards Critical, Warning, Info | |
| 2. Tela / rota | `/alerts` | |
| 3. Componente / arquivo exato | `apps/web/app/alerts/page.tsx` L275-277 | |
| 4. Origem dos dados | API `alerts.totals.critical`, `alerts.totals.warning`, `alerts.totals.info` | |
| 5. Finalidade original | Contagem por severidade | |
| 6. Uso real hoje | Severity já aparece em cada item da lista (badge) | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | UI, API | |
| 9. Duplicidade | Duplicidade parcial — severity visível nos itens | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-admin-operations | |
| 13. Recomendação | **Remover** | |
| 14. Justificativa | Severity por item basta; 6 cards é excesso | |
| 15. Ganho | Menos ruído, menos confusão | |

| # | Campo | Valor |
|---|-------|-------|
| **ALT-04** | | |
| 1. Nome do item | Filtros severity e type | |
| 2. Tela / rota | `/alerts` | |
| 3. Componente / arquivo exato | `apps/web/app/alerts/page.tsx` L221-246 | |
| 4. Origem dos dados | Query string; API getAlertsList aceita severity, type | |
| 5. Finalidade original | Filtrar por severidade e tipo técnico | |
| 6. Uso real hoje | Uso esporádico (troubleshooting) | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API, query string | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Baixo | |
| 11. O que pode quebrar | Filtros se remover; API continua suportando | |
| 12. Testes | smoke-admin-operations | |
| 13. Recomendação | **Mover para avançado** — colapsar em "Mais filtros" | |
| 14. Justificativa | Operação diária usa status e busca; severity/type são avançados | |
| 15. Ganho | Menos confusão, menos ruído | |

| # | Campo | Valor |
|---|-------|-------|
| **ALT-05** | | |
| 1. Nome do item | Botão "Acknowledge" | |
| 2. Tela / rota | `/alerts` | |
| 3. Componente / arquivo exato | `apps/web/app/alerts/page.tsx` L71-80, ActionForms | |
| 4. Origem dos dados | props canManageAlerts (RBAC), alertId, status, returnTo | |
| 5. Finalidade original | Reconhecer alerta | |
| 6. Uso real hoje | Operação essencial | |
| 7. Quem enxerga | superadmin, admin, operator (ALERT_WRITE_ROLES) | |
| 8. Dependências | RBAC, server action acknowledgeAlertAction, lib/alerts.ts | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Muito baixo (apenas label) | |
| 11. O que pode quebrar | Nada funcional | |
| 12. Testes | smoke-admin-operations | |
| 13. Recomendação | **Ajustar** — traduzir "Acknowledge" para "Reconhecer" | |
| 14. Justificativa | Padronizar português | |
| 15. Ganho | Menos confusão | |

---

### D. BOOTSTRAP / INSTALAÇÃO

| # | Campo | Valor |
|---|-------|-------|
| **BOOT-01** | | |
| 1. Nome do item | Hero stats Prontos, Ativos, Bloqueados | |
| 2. Tela / rota | `/bootstrap` | |
| 3. Componente / arquivo exato | `apps/web/app/bootstrap/page.tsx` L337-346 | |
| 4. Origem dos dados | `pending.length`, `active.length`, `blocked.length` derivados de filteredItems | |
| 5. Finalidade original | Contexto do escopo de bootstrap | |
| 6. Uso real hoje | Duplicado nos 3 cards L448-482 | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API getNodesList, lógica getBootstrapBucket | |
| 9. Duplicidade | Duplicidade funcional | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-bootstrap-flow | |
| 13. Recomendação | **Remover** os 3 cards (L448-482), manter PageHero | |
| 14. Justificativa | PageHero já informa; cards são redundantes | |
| 15. Ganho | Menos duplicidade, menos ruído | |

| # | Campo | Valor |
|---|-------|-------|
| **BOOT-02** | | |
| 1. Nome do item | Cards Prontos, Ativos, Bloqueados | |
| 2. Tela / rota | `/bootstrap` | |
| 3. Componente / arquivo exato | `apps/web/app/bootstrap/page.tsx` L448-482 | |
| 4. Origem dos dados | pending.length, active.length, blocked.length | |
| 5. Finalidade original | Resumo visual por bucket | |
| 6. Uso real hoje | Duplicam PageHero | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | UI | |
| 9. Duplicidade | Duplicidade funcional | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-bootstrap-flow | |
| 13. Recomendação | **Remover** | |
| 14. Justificativa | PageHero + atalhos (Todos/Prontos/Ativos/Bloqueados) + filas cobrem | |
| 15. Ganho | Menos ruído | |

| # | Campo | Valor |
|---|-------|-------|
| **BOOT-03** | | |
| 1. Nome do item | Overrides release_base_url, controller_url no formulário principal | |
| 2. Tela / rota | `/bootstrap` | |
| 3. Componente / arquivo exato | `apps/web/app/bootstrap/page.tsx` L423-436 | |
| 4. Origem dos dados | Query string release_base_url, controller_url | |
| 5. Finalidade original | Homologação em ambientes alternativos | |
| 6. Uso real hoje | Uso esporádico (homologação) | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | Query string, getNodeBootstrapCommand | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Médio | |
| 11. O que pode quebrar | Fluxo de homologação se esconder mal | |
| 12. Testes | smoke-bootstrap-flow | |
| 13. Recomendação | **Mover para avançado** — dentro de AdvancedSection | |
| 14. Justificativa | Uso avançado; reduz ruído para operação normal | |
| 15. Ganho | Menos confusão | |

| # | Campo | Valor |
|---|-------|-------|
| **BOOT-04** | | |
| 1. Nome do item | Comando principal, comandos de teste, preflight, evidências | |
| 2. Tela / rota | `/bootstrap` | |
| 3. Componente / arquivo exato | `apps/web/app/bootstrap/page.tsx` L413-446, L449-467 | |
| 4. Origem dos dados | getNodeBootstrapCommand API, buildPfSensePrecheckBlock, buildEvidenceBlock (locais) | |
| 5. Finalidade original | Instalação e diagnóstico | |
| 6. Uso real hoje | Essencial para bootstrap; preflight e evidências em AdvancedSection | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API getNodeBootstrapCommand, UI | |
| 9. Duplicidade | Comando principal aparece no detalhe do node também — duplicidade parcial | |
| 10. Risco | Alto (não mexer) | |
| 11. O que pode quebrar | Fluxo de instalação | |
| 12. Testes | smoke-bootstrap-flow | |
| 13. Recomendação | **Manter** | |
| 14. Justificativa | Core do bootstrap; duplicação com detalhe do node é intencional (dois contextos) | |
| 15. Ganho | — | |

| # | Campo | Valor |
|---|-------|-------|
| **BOOT-05** | | |
| 1. Nome do item | Seção "Escopo atual" + atalhos Todos/Prontos/Ativos/Bloqueados | |
| 2. Tela / rota | `/bootstrap` | |
| 3. Componente / arquivo exato | `apps/web/app/bootstrap/page.tsx` L446-464 | |
| 4. Origem dos dados | resultSummary (string), hasActiveFilters, buildBootstrapHref | |
| 5. Finalidade original | Navegação rápida entre buckets | |
| 6. Uso real hoje | Útil; complementa filtro bucket | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | Query string, UI | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Baixo | |
| 11. O que pode quebrar | Navegação entre buckets | |
| 12. Testes | smoke-bootstrap-flow | |
| 13. Recomendação | **Manter** | |
| 14. Justificativa | Atalhos são úteis; escopo resume filtros | |
| 15. Ganho | — | |

---

### E. MINHA CONTA / SESSIONS

| # | Campo | Valor |
|---|-------|-------|
| **SES-01** | | |
| 1. Nome do item | Cards Total, Ativas, Revogadas | |
| 2. Tela / rota | `/sessions` | |
| 3. Componente / arquivo exato | `apps/web/app/sessions/page.tsx` L98-121 | |
| 4. Origem dos dados | sessions.items.length, activeCount, revokedCount (derivados de sessions.items) | |
| 5. Finalidade original | Resumo de sessões | |
| 6. Uso real hoje | Duplicam exatamente PageHero stats (L89-93) | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API getAuthSessions, UI | |
| 9. Duplicidade | Duplicidade funcional | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-auth-sessions | |
| 13. Recomendação | **Remover** | |
| 14. Justificativa | PageHero já mostra Total, Ativas, Revogadas | |
| 15. Ganho | Menos duplicidade, menos ruído | |

| # | Campo | Valor |
|---|-------|-------|
| **SES-02** | | |
| 1. Nome do item | Lista de sessões + botão Revogar sessão | |
| 2. Tela / rota | `/sessions` | |
| 3. Componente / arquivo exato | `apps/web/app/sessions/page.tsx` L124-196 | |
| 4. Origem dos dados | API getAuthSessions | |
| 5. Finalidade original | Governança das próprias sessões | |
| 6. Uso real hoje | Essencial para segurança | |
| 7. Quem enxerga | Todos autenticados | |
| 8. Dependências | API, revokeSessionAction (lib/auth.ts) | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Alto (não mexer na lógica) | |
| 11. O que pode quebrar | Revogação de sessões | |
| 12. Testes | smoke-auth-sessions | |
| 13. Recomendação | **Manter** | |
| 14. Justificativa | CORTEX e documentação definem essa funcionalidade | |
| 15. Ganho | — | |

---

### F. CADASTRO / ADMIN

| # | Campo | Valor |
|---|-------|-------|
| **ADM-01** | | |
| 1. Nome do item | Cards Clientes, Sites, Nodes, Usuários | |
| 2. Tela / rota | `/admin` | |
| 3. Componente / arquivo exato | `apps/web/app/admin/page.tsx` L157-213 | |
| 4. Origem dos dados | filterOptions.clients.length, filterOptions.sites.length, nodes.items.length, users.items.length | |
| 5. Finalidade original | Contexto do inventário administrativo | |
| 6. Uso real hoje | Duplicam PageHero (Clientes, Nodes, Usuários) | |
| 7. Quem enxerga | admin, superadmin | |
| 8. Dependências | API getNodesFilters, getNodesList, getUsersList | |
| 9. Duplicidade | Duplicidade parcial — PageHero tem Clientes, Nodes, Usuários; cards têm + Sites | |
| 10. Risco | Baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-admin-operations | |
| 13. Recomendação | **Consolidar** — remover os 4 cards, manter só PageHero | |
| 14. Justificativa | PageHero dá contexto suficiente; admin tem muitas seções | |
| 15. Ganho | Menos ruído | |

| # | Campo | Valor |
|---|-------|-------|
| **ADM-02** | | |
| 1. Nome do item | Token do agente (card + formulário) | |
| 2. Tela / rota | `/admin` | |
| 3. Componente / arquivo exato | `apps/web/app/admin/page.tsx` L355-399 | |
| 4. Origem dos dados | API getAgentTokens por node, createAgentTokenAction | |
| 5. Finalidade original | Emissão de tokens auxiliares | |
| 6. Uso real hoje | Uso avançado (integrações, rotacionar sem rekey) | |
| 7. Quem enxerga | admin, superadmin | |
| 8. Dependências | API, RBAC | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Médio | |
| 11. O que pode quebrar | Fluxo de token se remover | |
| 12. Testes | smoke-admin-operations | |
| 13. Recomendação | **Manter** — não é excesso; é feature necessária | |
| 14. Justificativa | Documentado em LEITURA-INICIAL; útil para operações | |
| 15. Ganho | — | |

---

### G. LOGIN

| # | Campo | Valor |
|---|-------|-------|
| **LOG-01** | | |
| 1. Nome do item | Hero stats (Sessão, Cookie, Autoridade) | |
| 2. Tela / rota | `/login` | |
| 3. Componente / arquivo exato | `apps/web/app/login/page.tsx` L24-32 | |
| 4. Origem dos dados | Estático (hardcoded) | |
| 5. Finalidade original | Explicar arquitetura de autenticação | |
| 6. Uso real hoje | Pouco valor para operador | |
| 7. Quem enxerga | Anônimo (antes do login) | |
| 8. Dependências | Nenhuma | |
| 9. Duplicidade | Duplicado nos 3 cards da seção "Controle de acesso" | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-frontend-assets (GET /login) | |
| 13. Recomendação | **Remover** — tanto do PageHero quanto dos 3 cards | |
| 14. Justificativa | Operador quer entrar, não entender arquitetura | |
| 15. Ganho | Menos ruído, melhor onboarding | |

| # | Campo | Valor |
|---|-------|-------|
| **LOG-02** | | |
| 1. Nome do item | Seção "Controle de acesso" com 3 cards (Sessão, Cookie, Autoridade) | |
| 2. Tela / rota | `/login` | |
| 3. Componente / arquivo exato | `apps/web/app/login/page.tsx` L35-58 | |
| 4. Origem dos dados | Estático | |
| 5. Finalidade original | Institucional / técnico | |
| 6. Uso real hoje | Ruído para operação | |
| 7. Quem enxerga | Anônimo | |
| 8. Dependências | Nenhuma | |
| 9. Duplicidade | Duplicidade com PageHero stats | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-frontend-assets | |
| 13. Recomendação | **Remover** | |
| 14. Justificativa | Não agrega à operação | |
| 15. Ganho | Menos confusão, melhor onboarding | |

---

### H. AUDITORIA

| # | Campo | Valor |
|---|-------|-------|
| **AUD-01** | | |
| 1. Nome do item | Tela /audit | |
| 2. Tela / rota | `/audit` | |
| 3. Componente / arquivo exato | `apps/web/app/audit/page.tsx` | |
| 4. Origem dos dados | API getAuditLogs (`/api/v1/admin/audit`) | |
| 5. Finalidade original | Trilha administrativa | |
| 6. Uso real hoje | Acessível apenas via URL ou link no detalhe do node | |
| 7. Quem enxerga | admin, superadmin (redirect se não ADMIN_ROLES) | |
| 8. Dependências | RBAC ADMIN_ROLES, API, query string (action, target_type, target_id) | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-admin-operations (valida /audit) | |
| 13. Recomendação | **Ajustar** — adicionar link "Auditoria" no menu para admin/superadmin | |
| 14. Justificativa | Tela existe e é útil; falta descoberta | |
| 15. Ganho | Melhor operação | |

| # | Campo | Valor |
|---|-------|-------|
| **AUD-02** | | |
| 1. Nome do item | Motivo de não estar no menu | |
| 2. Tela / rota | layout.tsx navItems | |
| 3. Componente / arquivo exato | `apps/web/app/layout.tsx` L26-40 | |
| 4. Origem dos dados | Array navItems hardcoded; visibleNavItems = navItems + Admin (se ADMIN_ROLES) | |
| 5. Finalidade original | Navegação principal | |
| 6. Uso real hoje | Audit nunca foi adicionado a navItems | |
| 7. Quem enxerga | — | |
| 8. Dependências | hasRole(session?.user.role, ADMIN_ROLES) | |
| 9. Duplicidade | Nenhuma | |
| 10. Risco | Muito baixo | |
| 11. O que pode quebrar | Nada | |
| 12. Testes | smoke-admin-operations | |
| 13. Recomendação | **Ajustar** — incluir `{ href: '/audit', label: 'Auditoria' }` em visibleNavItems quando ADMIN_ROLES | |
| 14. Justificativa | Consistência com 08-painel-web-e-telas que define /audit | |
| 15. Ganho | Melhor operação | |

---

## 3. Lista de Remoções Seguras Imediatas

| # | Item | Arquivo | Linhas aproximadas | Risco |
|---|------|---------|--------------------|-------|
| 1 | Cards Total, Ativas, Revogadas (Sessions) | sessions/page.tsx | 98-121 | Muito baixo |
| 2 | Cards Bootstrap, Agente ativo, Bloqueados (Inventário) | nodes/page.tsx | 193-235 | Muito baixo |
| 3 | Cards Prontos, Ativos, Bloqueados (Bootstrap) | bootstrap/page.tsx | 448-482 | Muito baixo |
| 4 | SummaryCards Critical, Warning, Info (Alertas) | alerts/page.tsx | 275-277 | Muito baixo |
| 5 | Seção "Controle de acesso" + 3 cards (Login) | login/page.tsx | 35-58 | Muito baixo |
| 6 | PageHero stats Sessão, Cookie, Autoridade (Login) | login/page.tsx | 24-32 | Muito baixo |
| 7 | Stat "Nodes" do PageHero (Dashboard) | dashboard/page.tsx | 76 | Muito baixo |
| 8 | Stat "Alertas abertos" do PageHero (Dashboard) — se consolidar em card | dashboard/page.tsx | 77 | Muito baixo |
| 9 | Stat "Fora da matriz" do PageHero (Dashboard) — se consolidar em card | dashboard/page.tsx | 78 | Muito baixo |

**Nota:** Para DASH, escolher: **ou** remover stats do PageHero **ou** remover SummaryCards duplicados. Não remover todos.

---

## 4. Lista de Consolidações Seguras

| # | Ação | Arquivo | Descrição |
|---|------|---------|-----------|
| 1 | Dashboard: PageHero com 2 stats | dashboard/page.tsx | Manter "Alertas abertos" e "Fora da matriz" no Hero; remover "Nodes" (já no card) |
| 2 | Dashboard: Reduzir SummaryCards | dashboard/page.tsx | Manter 5 cards: Online, Degraded, Offline, Maintenance, Open Alerts, Fora da matriz (ou unificar Nodes+Open Alerts em menos) |
| 3 | Inventário: Remover 3 cards bootstrap | nodes/page.tsx | Manter só PageHero |
| 4 | Bootstrap: Remover 3 cards | bootstrap/page.tsx | Manter só PageHero + atalhos |
| 5 | Sessions: Remover 3 cards | sessions/page.tsx | Manter só PageHero |
| 6 | Admin: Remover 4 cards | admin/page.tsx | Manter só PageHero |
| 7 | Alertas: Remover 3 SummaryCards (Critical, Warning, Info) | alerts/page.tsx | Manter 3 de status |
| 8 | Login: Remover bloco institucional inteiro | login/page.tsx | Manter apenas formulário + título |

---

## 5. Itens que Devem Ir para Modo Avançado

| # | Item | Onde | Ação |
|---|------|------|------|
| 1 | Filtros severity e type (Alertas) | alerts/page.tsx | Colapsar em "Mais filtros" ou details/summary |
| 2 | Overrides release_base_url, controller_url (Bootstrap) | bootstrap/page.tsx | Mover para dentro de AdvancedSection existente "Diagnóstico e preflight" ou criar nova |
| 3 | Campo ha_role (Editar node) | nodes/[id]/page.tsx | Já poderia ficar em seção avançada; atualmente no formulário principal |

---

## 6. Itens que Devem Permanecer

| Grupo | Itens |
|-------|-------|
| Dashboard | Zona quente, Matriz de versão, SummaryCards de status (Online, Degraded, Offline, Maintenance), RealtimeRefresh |
| Inventário | Filtros, tabela, links para detalhe, PageHero |
| Alertas | Filtros (client, site, node, status, search), SummaryCards Open/Ack/Resolved, lista, ActionForms (Acknowledge/Resolver) |
| Bootstrap | Comando principal, comandos de teste, preflight (em avançado), evidências (em avançado), filas, atalhos, escolha do firewall |
| Sessions | PageHero, lista de sessões, botão Revogar |
| Admin | Formulários criar cliente/site/node/usuário, editar cliente/site, token agente, usuários e papéis, sessões de usuários |
| Login | Formulário email/senha, mensagem de erro |
| Audit | Tela completa, filtros, lista de eventos |

---

## 7. Ordem Recomendada de Simplificação em Ondas

### Onda 1 — Muito baixo risco (executar primeiro)

1. **Login:** Remover PageHero stats (Sessão, Cookie, Autoridade) e seção "Controle de acesso" com 3 cards  
2. **Sessions:** Remover 3 cards (Total, Ativas, Revogadas)  
3. **Layout:** Adicionar "Auditoria" ao menu para admin  
4. **Alertas:** Traduzir "Acknowledge" → "Reconhecer"  
5. **Alertas:** Remover 3 SummaryCards (Critical, Warning, Info)  

**Arquivos:** login/page.tsx, sessions/page.tsx, layout.tsx, alerts/page.tsx

### Onda 2 — Baixo risco

6. **Inventário:** Remover 3 cards (Bootstrap, Agente ativo, Bloqueados)  
7. **Bootstrap:** Remover 3 cards (Prontos, Ativos, Bloqueados)  
8. **Dashboard:** Consolidar — remover "Nodes" do PageHero OU um SummaryCard duplicado (Open Alerts ou Fora da matriz)  
9. **Admin:** Remover 4 cards (Clientes, Sites, Nodes, Usuários)  

**Arquivos:** nodes/page.tsx, bootstrap/page.tsx, dashboard/page.tsx, admin/page.tsx

### Onda 3 — Médio risco

10. **Alertas:** Mover filtros severity e type para "Mais filtros" (colapsável)  
11. **Bootstrap:** Mover overrides release_base_url, controller_url para AdvancedSection  
12. **Detalhe node:** Mover campo ha_role para AdvancedSection (opcional)  

**Arquivos:** alerts/page.tsx, bootstrap/page.tsx, nodes/[id]/page.tsx

---

## 8. Arquivos Mais Impactados

| Arquivo | Ondas | Alterações estimadas |
|---------|-------|----------------------|
| `apps/web/app/login/page.tsx` | 1 | Remoção de ~40 linhas |
| `apps/web/app/sessions/page.tsx` | 1 | Remoção de ~25 linhas |
| `apps/web/app/layout.tsx` | 1 | +1 item em navItems/visibleNavItems |
| `apps/web/app/alerts/page.tsx` | 1, 3 | Remoção de 3 cards; colapsar filtros |
| `apps/web/app/nodes/page.tsx` | 2 | Remoção de 3 cards |
| `apps/web/app/bootstrap/page.tsx` | 2, 3 | Remoção de 3 cards; mover overrides |
| `apps/web/app/dashboard/page.tsx` | 2 | Consolidar Hero e/ou SummaryCards |
| `apps/web/app/admin/page.tsx` | 2 | Remoção de 4 cards |
| `apps/web/app/nodes/[id]/page.tsx` | 3 | Mover ha_role (opcional) |

---

## 9. Testes Mínimos por Onda

### Onda 1

```bash
scripts/run-smoke-suite.sh
# Específicos: smoke-frontend-assets, smoke-auth-sessions, smoke-admin-operations
# Validar: GET /login renderiza, GET /sessions renderiza, GET /audit renderiza (admin),
# POST acknowledge/resolve em alertas
```

### Onda 2

```bash
scripts/run-smoke-suite.sh
# smoke-realtime-refresh, smoke-admin-operations, smoke-bootstrap-flow
# Validar: dashboard carrega, nodes lista, bootstrap seleciona node e mostra comando
```

### Onda 3

```bash
scripts/run-smoke-suite.sh
# smoke-bootstrap-flow, smoke-admin-operations
# Validar: filtros de alertas funcionam, overrides de bootstrap funcionam via query string
```

---

## 10. Análise Extra — 4 Conclusões Obrigatórias

### 1. O que pode ser removido imediatamente com risco muito baixo

- Cards Total/Ativas/Revogadas em Sessions  
- Cards Bootstrap/Agente ativo/Bloqueados em Inventário  
- Cards Prontos/Ativos/Bloqueados em Bootstrap  
- SummaryCards Critical/Warning/Info em Alertas  
- Bloco institucional do Login (PageHero stats + 3 cards "Controle de acesso")  
- Stat "Nodes" do PageHero no Dashboard (manter no SummaryCard)  

### 2. O que pode ser consolidado com baixo risco

- Dashboard: PageHero com 2 stats em vez de 3; evitar duplicação entre Hero e cards  
- Admin: remover 4 cards, manter PageHero  
- Filtros de alertas: unificar severity/type em "Mais filtros"  

### 3. O que está feio mas não deve ser mexido ainda

- Densidade do Admin (muitos formulários) — requer refatoração maior  
- Duplicação de comando de bootstrap entre Bootstrap e Detalhe do node — intencional (dois contextos)  
- Paginação ausente em listas longas — fora do escopo de simplificação  

### 4. O que parece excesso, mas na verdade é importante

- **Token do agente** (Admin): necessário para integrações e fluxos operacionais  
- **Overrides de URL** no bootstrap: essenciais para homologação  
- **Matriz de versão** no Dashboard: CORTEX e 08-painel exigem visibilidade de versão  
- **Fila de bootstrap e blocos laterais** (Prontos/Ativos/Bloqueados): navegação operacional útil; o excesso são os 3 cards, não as filas  
- **Filtro type em Alertas**: útil para troubleshooting (heartbeat_missing, service_down, etc.); melhor mover para avançado do que remover  

---

*Fim da matriz. Nenhuma alteração foi implementada. Use este documento como guia para decisões de simplificação.*
