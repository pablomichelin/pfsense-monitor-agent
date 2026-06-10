# Diagnóstico — Fluxos, telas e layout visual (2026-03-14)

## Objetivo

Registro do estado atual dos fluxos funcionais, localização das telas, estrutura de layout e problemas visuais identificados, para guiar ajustes conservadores sem regressão.

---

## 1. Fluxo de login e autenticação

- **Entrada:** `apps/web/app/login/page.tsx` — formulário com email e senha; `loginAction` (server action em `lib/auth.ts`) chama API `POST /api/v1/auth/login` e redireciona com cookie de sessão.
- **Backend:** NestJS em `apps/api` — sessão persistida em banco, cookie HttpOnly/SameSite, CSRF para rotas mutáveis.
- **Proteção de rotas:** páginas que exigem autenticação chamam `getSession()` (ou `getOptionalSession()`); em 401 redirecionam para `/login`.
- **Logout:** `logoutAction` em `lib/auth.ts`; botão "Sair" no header do `layout.tsx`.
- **RBAC:** `hasRole(session.user.role, ADMIN_ROLES)` controla visibilidade do item "Cadastro" no menu e acesso a rotas administrativas.

---

## 2. Onde estão as telas

| Tela | Rota | Arquivo | Observação |
|------|------|---------|------------|
| Raiz | `/` | `app/page.tsx` | Redireciona ou landing; pode redirecionar para dashboard. |
| Login | `/login` | `app/login/page.tsx` | Formulário + bloco institucional (sessão, cookie, autoridade). |
| Dashboard | `/dashboard` | `app/dashboard/page.tsx` | Resumo (totais), zona quente, tabela de versões. |
| Firewalls | `/nodes` | `app/nodes/page.tsx` | Filtros, cards de bootstrap, tabela de nodes. |
| Detalhe firewall | `/nodes/[id]` | `app/nodes/[id]/page.tsx` | Métricas, serviços, alertas, **instalação/comandos**, edição. |
| Instalação (bootstrap) | `/bootstrap` | `app/bootstrap/page.tsx` | Seleção de node, comando principal, preflight, comandos de teste. |
| Minha conta | `/sessions` | `app/sessions/page.tsx` | Lista de sessões da conta, revogar. |
| Cadastro | `/admin` | `app/admin/page.tsx` | Novo cliente/site/firewall, editar cliente/site, usuários, tokens, últimos nodes. |
| Alertas | `/alerts` | `app/alerts/page.tsx` | Lista de alertas. |
| Auditoria | `/audit` | `app/audit/page.tsx` | Logs de auditoria. |

---

## 3. Fluxo de cadastro de firewall

- **Onde:** `/admin` — card "Novo firewall" (site_id, hostname, display_name, management_ip, wan_ip, pfsense_version, maintenance_mode).
- **Ação:** `createNodeAction` → API `POST /api/v1/admin/nodes` → redireciona para `/nodes/{id}?created=1`.
- **Dados:** persistidos no PostgreSQL via Prisma; node_uid gerado no backend a partir do hostname (slug único).
- **Documentação:** `docs/22-diagnostico-cadastro-e-comandos-2026-03-14.md` e `docs/CADASTRO-E-COMANDOS-PFSENSE.md`.

---

## 4. Onde os dados de firewall são armazenados e exibidos

- **Backend:** PostgreSQL; modelos Node, NodeCredential, Site, Client; leitura via `GET /api/v1/nodes`, `GET /api/v1/nodes/:id`, `GET /api/v1/dashboard/summary`.
- **Exibição:** lista em `/nodes` (tabela com status, firewall, local, versão, último contato, instalação); detalhe em `/nodes/[id]` (métricas, serviços, alertas, credencial, comando de instalação, comandos de teste).

---

## 5. Onde o sistema gera e exibe os comandos operacionais

- **Geração:** API `GET /api/v1/admin/nodes/:id/bootstrap-command` (admin.service.getBootstrapCommand). Retorna `package_command` (one-shot pacote) e/ou `command` (agente legado), mais `verification.command_block` (comandos pós-instalação).
- **Exibição:** em `/nodes/[id]` (seção "Instalar agente": Comando principal + Copiar, Comandos de teste pré/pós); em `/bootstrap` (comando principal + Copiar, comandos de teste pós-instalação).
- **Componente:** `CopyButton` em `components/copy-button.tsx`; blocos de código com `CommandBlock` (pre com estilos).

---

## 6. Estrutura do layout atual

### Container principal
- **layout.tsx:** `min-h-screen`, `max-w-7xl`, `mx-auto`, `px-4 py-6 sm:px-6 lg:px-8`; `flex flex-col`.
- **Header:** `glass-panel`, `rounded-3xl`, `px-5 py-4`, `mb-6`; em `lg` vira linha (flex-row) com título à esquerda e (email + nav + sair) à direita.
- **Main:** `flex-1` para ocupar espaço.
- **Footer:** `mt-6`, borda superior, texto pequeno.

### Navbar / menu
- **AppNav:** itens são `Link` com `rounded-full border px-4 py-2 text-sm`; ativo: `border-cyan-300/60 bg-cyan-400/15`; inativo: `border-slate-700/80 bg-panel-soft`. Fragmento sem wrapper; no layout o nav é `flex flex-wrap gap-2`. Não há `min-width` nos links — em telas estreitas os rótulos podem quebrar ou ficar apertados.
- **Ordem no header:** email (badge) + itens do menu + botão Sair. Em mobile tudo pode ficar em coluna.

### Componentes recorrentes
- **PageHero:** `glass-panel`, `rounded-[2rem]`, `px-6 py-6 sm:px-7`; eyebrow com `tracking-[0.32em]`; título `text-3xl sm:text-4xl`; stats em `flex flex-wrap gap-3` com cards `rounded-2xl border px-4 py-3`.
- **Cards de resumo (dashboard, nodes, admin):** `glass-panel rounded-3xl p-5`; label `font-mono text-xs uppercase tracking-[0.28em]`; valor grande `font-display text-4xl`; badge `rounded-full border px-3 py-1 font-mono text-xs`.
- **Seções:** `glass-panel rounded-[2rem] p-5` ou `rounded-3xl p-5` — **inconsistência** entre `2rem` e `3xl` (≈1.5rem).
- **Tabelas:** `min-w-full`, thead `border-b border-slate-800 bg-slate-950/40`, th/td `px-5 py-4`.
- **Formulários:** inputs `rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm`; botões primários `rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium`.

### Grids
- Dashboard: `grid gap-4 sm:grid-cols-2 xl:grid-cols-7` (cards); `grid gap-6 xl:grid-cols-[1.4fr_0.9fr]` (zona quente + versões).
- Nodes: `grid gap-4 lg:grid-cols-3` (bootstrap summary); tabela em seção única.
- Admin: `grid gap-6 xl:grid-cols-4` (cards de novo cliente/site/firewall/usuário).
- Login: `grid min-h-[52vh] max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]` — duas colunas assimétricas.

### Espaçamentos
- Entre seções: `space-y-6` no container da página.
- Dentro de cards: `mt-3`, `mt-4`, `mt-5`, `space-y-3`, `space-y-4` — **variável** (3, 4, 5, 6).
- Gaps de grid: `gap-4` ou `gap-6` — não padronizado.

### Responsividade
- Breakpoints Tailwind: sm, lg, xl. Não há `max-w` em muitos blocos internos; tabelas usam `overflow-x-auto`.
- Header: `flex-col` até `lg`, depois `flex-row`; nav com `flex-wrap` pode gerar múltiplas linhas de links.

---

## 7. Pontos corretos já existentes

- Autenticação server-side e cookie seguro; RBAC refletido no menu.
- Comando principal e comandos de teste exibidos na página do firewall e em /bootstrap; botão Copiar presente.
- Documentação operacional em `docs/CADASTRO-E-COMANDOS-PFSENSE.md` e diagnóstico em `docs/22-diagnostico-cadastro-e-comandos-2026-03-14.md`.
- Tema escuro consistente (glass-panel, cyan/slate, signal colors); fontes Space Grotesk (display) e IBM Plex Mono.
- Tabelas com padding uniforme (px-5 py-4); badges de status coerentes.

---

## 8. Pontos técnicos que precisam de ajuste

- **Comandos:** já ajustados (Comando principal, Pré/Pós-instalação, CopyButton). Manter e evitar quebra.
- **Duplicação de cadastro:** análise e plano em docs 23 e 24; implementar apenas validação de unicidade no update quando for seguro.
- **Variáveis de ambiente:** comando pacote depende de PACKAGE_RELEASE_* no .env.api; documentado.

---

## 9. Problemas visuais identificados

1. **Navbar / menu**
   - Itens sem `min-width`: em telas médias os links podem ficar apertados ou quebrar em várias linhas de forma desordenada.
   - Altura do header e alinhamento vertical do email + nav + botão Sair podem ficar desiguais quando há wrap.
   - Espaçamento entre itens apenas `gap-2`; pode parecer apertado com muitos itens.

2. **Cards e blocos**
   - Mistura de `rounded-3xl` e `rounded-[2rem]` (≈24px vs 32px) sem critério único.
   - Padding interno variando entre `p-5` e `p-6`; `px-4 py-3` vs `px-5 py-4` em blocos similares.
   - Alguns cards de resumo sem `min-height`, podendo ficar desalinhados quando o conteúdo tem alturas diferentes (ex.: labels longas vs curtas).

3. **Tipografia**
   - Eyebrow/labels com `tracking-[0.28em]` ou `tracking-[0.32em]`: em labels curtas pode parecer exagerado e prejudicar legibilidade.
   - Line-height nem sempre explícito; em blocos de código pode ficar apertado.

4. **Login**
   - Proporção 1.1fr / 0.9fr pode deixar a coluna esquerda dominante; em telas estreitas as duas colunas empilham mas o bloco institucional é grande.
   - Cards de benefício (Sessão, Cookie, Autoridade) com mesmo estilo; alinhamento vertical pode falhar se textos tiverem alturas diferentes.

5. **Minha conta (sessions)**
   - Cards de sessão com `flex-col` até lg; botão "Revogar" ao lado do texto. User-agent com `break-all` está correto, mas o bloco pode ficar muito alto e desbalanceado.
   - Espaçamento interno `p-4`; alinhamento com outros painéis (p-5) inconsistente.

6. **Tabelas**
   - Colunas sem `width` ou `min-width` definidos; distribuição depende do conteúdo. Colunas com badges (Status, Versão, Instalação) podem ficar mais largas e desproporcionais.
   - Badges dentro de células podem aumentar altura da linha de forma irregular.

7. **Formulários (admin, filtros)**
   - Inputs e selects com `rounded-2xl` e `py-3`; botões com `px-5 py-3`. Consistente entre si, mas em filtros com muitos campos a linha pode ficar apertada e quebrar de forma pouco limpa.
   - Blocos de aviso (ex.: "O codigo sera gerado automaticamente") com `rounded-2xl border border-slate-800 bg-panel-soft/50` — contraste fraco com o restante.

8. **Área de comandos (instalação)**
   - Blocos de código com `rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 font-mono text-xs`; pode faltar `line-height` e `overflow-x-auto` em comandos longos.
   - Títulos de seção (Comando principal, Comandos de teste) alinhados com CopyButton; em mobile o botão pode ficar abaixo e desalinhado.

9. **Espaçamento geral**
   - `space-y-6` entre seções é bom; dentro de seções há mistura de `gap-3`, `gap-4`, `gap-6` e `mt-3`/`mt-4`/`mt-5`. Falta padronização fina.
   - Container principal `max-w-7xl`; em monitores grandes pode haver muito espaço vazio nas laterais (aceitável para legibilidade).

10. **Responsividade**
    - Em viewports médios, grid de cards (ex.: 7 colunas no dashboard) pode comprimir demais os cards; 4 colunas em admin pode gerar cards estreitos.
    - Overflow de texto: alguns lugares usam `break-all` (user-agent); outros não tratam (ex.: hostname longo na tabela).

---

## 10. Padrões visuais a preservar

- **Tema:** escuro (slate, cyan, glass-panel); sem mudar paleta.
- **Fontes:** Space Grotesk (títulos), IBM Plex Mono (labels, código, dados técnicos).
- **Glass-panel:** gradiente e borda atuais; sombra e backdrop-filter.
- **Status/signal:** cores existentes (online, degraded, offline, maintenance, unknown).
- **Badges:** `rounded-full border px-3 py-1 font-mono text-xs` com tons cyan/emerald/amber/rose.
- **Botões primários:** cyan (`bg-cyan-400`), texto escuro; secundários: borda slate, hover cyan.
- **Inputs:** `rounded-2xl`, `border-slate-700`, `bg-panel-soft`.
- **Cards de resumo:** label pequena uppercase, número grande, badge opcional — estrutura mantida.

---

## 11. Riscos de regressão

- Alterar classes do layout/header pode deslocar o menu ou o botão Sair em certos breakpoints.
- Unificar border-radius ou padding em muitos arquivos pode introducer erros de digitação; preferir ajustes incrementais e testar após cada grupo de mudanças.
- Alterar `tracking` em muitos lugares pode mudar a “cara” do produto; fazer com moderação (ex.: reduzir de 0.32em para 0.24em apenas em eyebrows).
- Não remover ou renomear classes usadas por testes ou scripts (ex.: seletores em smoke tests).

---

## 12. Conclusão

- Fluxos de login, cadastro, instalação e exibição de comandos estão identificados e documentados; comandos principais e de teste já estão na tela com CopyButton.
- Principais problemas visuais: inconsistência de radius/padding entre cards, navbar sem min-width nos links, possíveis desalinhamentos na login e em sessões, tabelas sem larguras de coluna definidas, e espaçamentos internos variados.
- Ajustes recomendados: padronizar radius e padding (via variáveis ou classes únicas), dar min-width aos links do menu, pequenos ajustes de tracking/line-height, e alinhar padding das seções de sessões e comandos com o restante do painel, preservando identidade visual e comportamento funcional.
