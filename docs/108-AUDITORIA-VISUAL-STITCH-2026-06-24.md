# Auditoria visual completa — Monitor-Pfsense × Google Stitch

**Data:** 2026-06-24  
**Versão painel auditada:** 1.4.0 (web)  
**Metodologia:** Design DNA Stitch + 6 telas de referência + variantes REFINE + comparação tripla (Stitch / painel real / código)  
**Escopo:** 16 rotas do App Router + shell, KPIs, tabelas, filtros, formulários, badges, modais, tabs, responsividade, PT-BR  
**Hotfix preservado:** [106-HOTFIX-ADMIN-NAV-MODAL-PORTAL-2026-06-24.md](./106-HOTFIX-ADMIN-NAV-MODAL-PORTAL-2026-06-24.md) — modal via portal e nav admin **não** devem regredir.

**Evidências capturadas:** `docs/evidencias-auditoria-108/` (login interno + 14 rotas autenticadas via HTTPS externo + modal).

---

## 1. Sumário executivo

- **Stitch MCP:** script `verify-stitch-mcp.sh` OK (14 ferramentas). `CallMcpTool` no subagente falhou com OAuth; fluxo completo executado via HTTP direto (`X-Goog-Api-Key`). Projeto **Monitor-Pfsense NOC** criado com design system alinhado ao DNA dark navy/cyan do painel.
- **Painel real:** shell sidebar + header + PageHero + KPIs + tabelas glass estão **maduros e coerentes** com `SISTEMA-VISUAL-PAINEL.md` nas rotas operacionais (`/dashboard`, `/nodes`, `/nodes/[id]`, `/backups`). Nota média operacional **4/5**.
- **Gaps principais:** (1) **altura de controles** — cluster `h-9` em admin/alertas/auditoria vs spec `h-11`; (2) **PT-BR** — acentuação e termos EN (`active`/`inactive`, “Autenticacao”); (3) **tokens tipográficos** — `tracking-[0.2em]` residual em sidebar e matrizes vs `tracking-wider` (0.08em); (4) **`rounded-full`** pontual em badges/botões fora do padrão `rounded-md`.
- **Modal admin clientes:** hotfix 106 **validado visualmente** — overlay centralizado, botão Excluir visível no viewport (screenshot `admin-clientes-modal-externo.png`). **Não recomendar** rollback de portal/`key={pathname}`.
- **Login:** layout limpo e alinhado ao Stitch; redundância de blocos hero+form e botão “Login” no header público são polish, não bloqueadores.
- **Responsividade:** sidebar colapsável ≤1366px funciona; tabelas com scroll horizontal OK; admin clientes com listagem longa exige scroll — aceitável, mas modal/portal deve permanecer.
- **Browser MCP:** indisponível no subagente; capturas via Playwright headless. HTTP interno (`192.168.100.221:3031`) não persistiu cookies de sessão; **HTTPS externo** funcionou.
- **Prioridade imediata:** padronizar `form-field-styles` compact → default, corrigir PT-BR visível, eliminar `rounded-full` em badges de status (exceto dots/spinners).

---

## 2. Scorecard por tela

| Rota | Nota | Principais problemas | Esforço |
|------|------|----------------------|---------|
| `/login` | 4 | Duplo hero (PageHero + card); “Autenticacao” sem acento; botão Login redundante no header público | P |
| `/dashboard` | 4 | KPI repete label no badge; densidade OK vs Stitch | P |
| `/nodes` | 4 | Tabela densa mas legível; filtros conforme spec | P |
| `/nodes/[id]` | 4 | Tabs cyan OK; botão excluir `rounded-full` legado; stats hero em EN minúsculo (`online`) | P |
| `/backups` | 4 | Tabela fleet alinhada; links `h-9` | P |
| `/alerts` | 3 | Filtros/ações `h-9`; inputs compactos | M |
| `/audit` | 3 | Botões paginação `h-9`; filtros compactos | M |
| `/conta` | 4 | MFA badge `rounded-full`; `space-y-6` | P |
| `/admin` | 3 | Atalhos `h-9`; cards cadastro OK; PT-BR (“organizacao”, “usuario”) | M |
| `/admin/usuarios` | 3 | Tabs + forms `h-9`; densidade alta | M |
| `/admin/clientes` | 3 | `space-y-6`; forms inline sem labels; status EN; listagem longa | M |
| `/admin/clientes-sites` | 3 | Mesmo padrão admin compact | M |
| `/admin/permissoes` | 3 | Matriz: `tracking-[0.2em]`, toggles `rounded-full` | M |
| `/sessions` | 4 | Tabela padrão; hero stats OK | P |
| `/bootstrap` | 3 | Página densa; `space-y-6`; múltiplos padrões de botão | M |
| `/` (redirect) | — | Redirect técnico | — |

**Legenda esforço:** P = pequeno (1–2 dias), M = médio (3–5 dias), G = grande (>1 sprint).

---

## 3. Matriz de gaps

| Tela | Dimensão | Problema | Referência Stitch | Arquivo(s) | Severidade | Recomendação |
|------|----------|----------|-------------------|------------|------------|--------------|
| Global | Typography | Labels sidebar `tracking-[0.2em]` vs 0.08em | Variant inventário (mono labels) | `app-sidebar.tsx`, `app-nav.tsx` | Média | Trocar para `tracking-wider` |
| Global | Components | Botões/inputs `h-9` em admin e filtros secundários | DS: input-h 2.75rem | `form-field-styles.ts`, `button.tsx`, páginas admin/alerts/audit | Alta | Usar `h-11` ou variant `md` default; reservar `sm` só para densidade explícita |
| Global | Components | Badges/botões `rounded-full` | DS: badges `rounded-md` | `delete-node-button.tsx`, `node-config-backups-section.tsx`, `conta/mfa-section.tsx`, `permissions-matrix-*.tsx` | Média | Migrar para `rounded-md`/`rounded-lg`; manter `rounded-full` só em dots/spinners |
| Global | Text (PT-BR) | Acentos ausentes | Stitch PT-BR correto | `login/page.tsx`, `client-delete-button.tsx`, `admin/page.tsx` | Média | Passar copy por revisão PT-BR |
| Global | Text (PT-BR) | Options `active`/`inactive` em selects | Labels “Ativo”/“Inativo” | `admin/clientes/page.tsx`, `role-scope-fields.tsx` | Média | Usar `statusLabel()` de `rbac-labels.ts` |
| `/login` | Layout | PageHero + card repetem hierarquia | Login Stitch: card único | `login/page.tsx` | Baixa | Unificar título ou remover eyebrow duplicado |
| `/login` | Text | “Autenticacao administrativa” | — | `login/page.tsx:88` | Baixa | “Autenticação administrativa” |
| `/dashboard` | Components | Badge KPI repete texto do label | Stitch: ícone/dot apenas | `kpi-card.tsx` | Baixa | Badge só quando agrega info (ex.: “12 abertos”) |
| `/nodes` | Responsividade | Tabela wide — OK com scroll | Stitch table container | `nodes-inventory-table.tsx` | Baixa | Manter; considerar sticky col status |
| `/nodes/[id]` | Components | Status hero em inglês cru | Stitch: “Online” capitalizado PT | `nodes/[id]/page.tsx` | Baixa | Mapear via `StatusBadge` label |
| `/nodes/[id]` | Components | Tab bar OK; conteúdo `space-y-6` | DS section-gap 2rem | `node-detail-tabs.tsx` | Baixa | Opcional: `space-y-8` |
| `/admin/clientes` | Layout | Cards empilhados sem labels visíveis | Stitch admin: labels explícitos | `admin/clientes/page.tsx` | Média | Adicionar `<label>` ou fieldset por coluna |
| `/admin/clientes` | Layout | `space-y-6` vs `space-y-8` | DS spacing | `admin/clientes/page.tsx` | Baixa | Alinhar gap de página |
| `/admin/clientes` | Components | Modal PT-BR sem acentos | Stitch modal | `client-delete-button.tsx` | Média | “Esta ação é irreversível…” |
| `/admin/clientes` | Components | Modal posicionamento | Stitch centered | `confirm-dialog.tsx` | — | **OK pós-hotfix 106 — preservar portal** |
| `/admin` | Text | “organizacao”, “usuario” sem acento | — | `admin/page.tsx`, `admin-cadastro-cards.tsx` | Baixa | Corrigir copy |
| `/admin/permissoes` | Typography | th `tracking-[0.2em]` | Variant refine | `permissions-matrix-table.tsx` | Média | `tracking-wider` |
| `/alerts` | Components | Summary cards OK; filtros `h-9` | Stitch filters h-11 | `alerts/page.tsx` | Média | Importar `formInputClassName` |
| `/bootstrap` | Layout | Alta densidade, múltiplas seções | Stitch dashboard spacing | `bootstrap/page.tsx` | Média | Revisar ritmo vertical e collapsibles |
| `/audit` | Components | Controles compactos | Stitch table toolbar | `audit/page.tsx` | Média | Padronizar altura botões |
| Shell | Layout | Sidebar + header alinhados ao Stitch | Dashboard Stitch | `app-shell-layout.tsx`, `app-sidebar.tsx`, `app-header.tsx` | — | Manter arquitetura atual |
| Shell | Color | Fontes reais Space Grotesk + IBM Plex vs Stitch Plus Jakarta + JetBrains | DS fonts | `layout.tsx`, `tailwind.config.ts` | Baixa | Aceitável; documentar mapping |

---

## 4. Inconsistências globais

1. **Duas escalas de altura:** spec/documento = `h-11` (2.75rem); implementação split entre `form-field-styles` (h-11) e `form-field-styles` compact + `Button size sm` (h-9) espalhados em admin, alerts, audit, permissoes.
2. **Duas escalas de tracking:** PageHero e KPIs usam `tracking-wider`; grupos sidebar e cabeçalhos de matriz usam `tracking-[0.2em]` (mais aberto que o token `--label-tracking: 0.08em`).
3. **Badges:** componente base `Badge` correto (`rounded-md`); exceções pontuais com `rounded-full` (delete, MFA, backup status pill, matrix toggles).
4. **Ritmo vertical:** rotas operacionais `space-y-8`; várias admin/bootstrap/conta/node-detail usam `space-y-6` ou `space-y-5`.
5. **PT-BR inconsistente:** UI majoritariamente PT, mas enums de status em EN, acentos faltando em strings estáticas e modais.
6. **Login autenticado vs anônimo:** layout público (header compacto + grid) vs shell sidebar — intencional e alinhado ao Stitch login sem sidebar.
7. **Tipografia Stitch vs produção:** Stitch consolidou Plus Jakarta/Inter/JetBrains; produção mantém Space Grotesk/IBM Plex — divergência estética leve, não funcional.

---

## 5. Design System — o que consolidar (mapping Tailwind)

| Token / regra (`SISTEMA-VISUAL-PAINEL.md`) | Tailwind / CSS atual | Ação |
|---------------------------------------------|----------------------|------|
| Container | `app-shell` + `--app-shell-width` | Documentado; OK |
| Section gap 2rem | `space-y-8` | Padronizar páginas admin |
| Card | `glass-panel rounded-xl p-6` via `Card` | OK |
| KPI | `min-h-28 p-6`, label mono xs | OK |
| Input/select/button | `h-11 rounded-lg border-slate-600/80` | Eliminar uso default de `formInputCompactClassName` |
| Nav item | sidebar `py-2.5` ≈ h-10 | OK |
| Label eyebrow | `font-mono text-xs uppercase tracking-wider text-cyan-400/90` | Corrigir sidebar groups |
| Badge | `rounded-md border px-2.5 py-0.5 font-mono text-xs` | Remover exceções rounded-full |
| Tabela head | `dataTableHeadClassName` | OK |
| Modal | `fixed inset-0 z-[100]`, portal body | **Preservar (106)** |
| Cores panel | `panel.bg/card/soft/line` | OK |
| Cores signal | `signal.*` + StatusBadge | OK |
| `--app-max-w` 80rem | `--app-max-w: 80rem` em globals | Doc diz 72rem — alinhar doc ou token |

**Stitch design system (referência ideal):** accent `#22d3ee`, glass `rgba(12,23,40,0.9)`, fonts label JetBrains Mono — mapear mentalmente para tokens Tailwind existentes sem trocar fontes em produção neste ciclo.

---

## 6. Quick wins (15 itens concretos)

1. Corrigir “Autenticacao” → “Autenticação” em `/login`.
2. Corrigir copy do modal excluir cliente (acentos + “é”).
3. Substituir `<option value="active">active</option>` por labels PT em `/admin/clientes`.
4. Trocar `tracking-[0.2em]` → `tracking-wider` em `app-sidebar.tsx` (grupos nav).
5. Trocar `tracking-[0.2em]` → `tracking-wider` em cabeçalhos de `permissions-matrix-table.tsx` e `permissions-matrix-editor.tsx`.
6. Migrar `delete-node-button.tsx` de `rounded-full` para `rounded-lg` + variant danger.
7. Migrar pill de status em `node-config-backups-section.tsx` para `rounded-md`.
8. MFA badge em `conta/mfa-section.tsx`: `rounded-md`.
9. Promover links admin de `h-9` para `h-10` mínimo (atalhos cadastro/usuarios/permissoes).
10. Usar `formInputClassName` (h-11) nos filtros de `/alerts` e `/audit`.
11. Hero stats em `/nodes/[id]`: exibir label PT do status, não raw enum.
12. Alinhar `/admin/clientes` para `space-y-8`.
13. Adicionar labels visíveis nos inputs inline de clientes (Nome, Código, Status).
14. Documentar exceções permitidas para `rounded-full` (status-dot, spinner) em `SISTEMA-VISUAL-PAINEL.md`.
15. Atualizar `--app-max-w` no doc para 80rem (match globals.css).

---

## 7. Backlog médio/prazo

| Item | Descrição | Esforço |
|------|-----------|---------|
| Unificação altura controles | Refatorar `Button` default para h-11 ou criar escala documentada sm/md/lg | M |
| Revisão PT-BR completa | Passar todas as strings user-facing + modais + placeholders | M |
| Admin clientes UX | Paginação ou virtualização; reduzir scroll antes de modais | G |
| Bootstrap simplificação | Reorganizar buckets pending/active/blocked com mesmo ritmo visual do dashboard | M |
| Matriz permissões | Redesign toggles quadrado/rounded-md alinhado a badges | M |
| Testes visuais Playwright | Pipeline de screenshots 16 rotas (HTTPS) em CI | M |
| Stitch ↔ código sync | Revisão trimestral re-executando design system Stitch | P |
| Responsividade mobile | Validar sidebar overlay <768px e tabelas card-mode | G |
| KPI dashboard | Remover redundância badge/label; opcional sparkline Stitch | P |

---

## 8. Referências Stitch

| Recurso | ID / valor |
|---------|------------|
| **projectId** | `12515890116329096918` |
| **assetId (design system)** | `8f979bca19ea4e97b43728f44b1612b9` |
| **DESIGN.md upload screen** | `947264803619784500` |

### screenIds (telas geradas — desktop + designSystem)

| Tela | screenId | Notas |
|------|----------|-------|
| Dashboard | `7812ec5532ef48c4921cbad8f10b55bf` | apply_design_system aplicado |
| Inventário | `36d9e4fd3e28412ba672180a297bfc45` | variant refine: `17e7e54ad7a6412ca62c96177875a016` |
| Detalhe nó | `e2eab48c46ce4c118acfb605073a5ff0` | variant refine: `434c54a3823547f48711ca73b3d4a56a` |
| Config nó | `07698bfdb8874cb6aae776223329af46` | apply_design_system aplicado |
| Admin clientes | `edf10a9293494c7cb441971257debb49` | variant refine: `50aa58ae6cba4d5da376dd13c900666f` |
| Login | `26ee217de7674169a83d529ed38bbd89` | apply_design system aplicado |

### Variantes consolidadas (REFINE — LAYOUT, COLOR_SCHEME, TEXT_FONT)

- **Inventário:** variante `17e7e54ad7a6412ca62c96177875a016` — melhor densidade de labels mono e spacing de tabela.
- **Detalhe nó:** variante `434c54a3823547f48711ca73b3d4a56a` — tabs e hero stats mais legíveis.
- **Admin clientes:** variante `50aa58ae6cba4d5da376dd13c900666f` — cards inline e modal mais equilibrados.

### Limitações encontradas

| Limitação | Impacto | Mitigação usada |
|-----------|---------|-----------------|
| `CallMcpTool` user-stitch → OAuth error | Subagente não invoca Stitch nativamente | HTTP curl com `STITCH_API_KEY` |
| Browser MCP indisponível | Sem snapshot interativo Cursor | Playwright headless |
| HTTP interno sem cookie persistente | Screens autenticados falharam em `192.168.100.221:3031` | HTTPS `pfs-monitor.systemup.inf.br` |
| `list_screens` retorna só DESIGN.md | IDs extraídos do log de geração | Parser em `/tmp/stitch-screens.log` |

---

## Apêndice A — Metodologia executada

1. Leitura `SISTEMA-VISUAL-PAINEL.md`, `globals.css`, rule `frontend-visual.mdc`, hotfix 106.
2. DESIGN.md montado em `/tmp/monitor-pfsense-DESIGN.md` → upload → `create_design_system_from_design_md` (DESKTOP).
3. Seis telas via `generate_screen_from_text` com `designSystem`.
4. `generate_variants` (REFINE ×2) em Inventário, Detalhe, Admin clientes.
5. `apply_design_system` nas telas consolidadas.
6. Comparação com Playwright (14 rotas + login + modal) e revisão de componentes em `apps/web/components/` e `app/**/page.tsx`.

## Apêndice B — Hotfix 106 (não regredir)

| Correção | Status auditoria |
|----------|------------------|
| `ConfirmDialog` → portal `document.body`, `z-[100]` | Modal centralizado confirmado |
| `admin/layout.tsx` + `key={pathname}` em `<main>` | Nav admin funcional (capturas multi-rota OK) |
| `DeleteNodeButton` → `ConfirmDialog` | Verificar na próxima passada visual em `/nodes/[id]` |

**Recomendação explícita:** não remover portal nem `key={pathname}`; qualquer refactor de modal deve manter containing block fora de `.glass-panel`.

---

*Relatório gerado por auditoria visual automatizada — análise only, sem alteração de código ou deploy.*
