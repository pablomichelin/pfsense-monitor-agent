# Análise: Desmembramento da Interface Administrativa e Hierarquia de Telas

**Data:** 2026-03-15  
**Status:** Análise inicial — aguardando autorização para implementação  
**Versões de referência:** Painel 0.1.8, API 0.1.3, Package 0.2.0

---

## 1. Confirmação de leitura dos arquivos obrigatórios

Li e tratei como fonte de verdade:

- `00_inicio.md` — ponto de continuidade, trilhas encerradas, próximos blocos
- `LEITURA-INICIAL.md` — estado atual, últimas entregas, restrições
- `CORTEX.md` — regras de produto, painel (dashboard tem prioridade), ordem de desenvolvimento
- `00-README.md` — índice e status do projeto
- `docs/45-DASHBOARD-OPERACIONAL-LISTA-SERVIDORES-2026-03-15.md` — lista operacional no dashboard
- `docs/46-DESPOLUICAO-VISUAL-DASHBOARD-OPERACIONAL-2026-03-15.md` — remoção Host/Site da grade
- `docs/47-SIMPLIFICACAO-MODELO-CADASTRO-CLIENTE-FIREWALL-2026-03-15.md` — fluxo Cliente + Firewall, Novo site em avançado
- `apps/web/app/dashboard/page.tsx` — dashboard atual
- `apps/web/app/admin/page.tsx` — admin atual (telas reais)
- `apps/web/components/app-nav.tsx` — navegação
- `apps/web/app/layout.tsx` — layout, navItems, footer
- `apps/web/components/page-hero.tsx` — hero compartilhado
- `apps/web/app/nodes/page.tsx` — inventário (Firewalls)

Não existem docs 48+ anteriores; esta é a primeira análise da nova trilha.

---

## 2. Resumo executivo do estado atual das telas

| Rota        | Nome no menu | Conteúdo principal |
|------------|--------------|---------------------|
| `/dashboard` | Dashboard   | Resumo (5 cards), zona quente, matriz de versão, **lista operacional** (tabela 11 colunas), RealtimeRefresh |
| `/nodes`     | Firewalls   | Inventário com filtros (cliente, site, status, busca), tabela com exclusão (admin) |
| `/nodes/[id]`| —           | Detalhe do firewall (bootstrap, rekey, maintenance, tokens, etc.) |
| `/alerts`    | Alertas     | Lista de alertas, ack/resolve |
| `/bootstrap` | Instalação  | Filtros, buckets, pré-flight, comando one-shot, evidências |
| `/sessions`  | Minha conta | Sessões do usuário atual, revogar |
| `/admin`     | Cadastro    | **Tudo abaixo concentrado numa única página** |
| `/audit`     | Auditoria   | Leitura de eventos de auditoria |

**Admin hoje (uma única página longa):**

1. PageHero “Cadastro inicial” + 4 cards (Clientes, Sites, Nodes, Usuários)
2. Grid de 4 cards: **Novo cliente**, **Novo firewall**, **Novo usuário** (ou aviso RBAC), **Token do agente**
3. Seção **Cadastros avançados**: **Novo site**
4. Tabela **“Últimos nodes no inventário”** (5 primeiros)
5. Seção **“Tokens do agente por node recente”** (5 nodes, listar/revogar)
6. Seção **“Usuários e papéis”** (superadmin): lista de usuários, edição inline, **sessões humanas por usuário** (revogar)
7. Grid 2 colunas: **Editar clientes**, **Editar sites** (listas completas com formulários inline)

Ou seja: **cadastro**, **provisionamento**, **inventário parcial**, **tokens**, **gestão de usuários e sessões** e **edição de clientes/sites** estão na mesma superfície, com scroll longo e sem hierarquia clara por contexto.

---

## 3. Contextos misturados hoje

Na **mesma tela** `/admin` estão:

| Contexto                  | Onde está hoje | Problema |
|---------------------------|----------------|----------|
| **Dashboard/cadastro**    | 4 cards de resumo (Clientes, Sites, Nodes, Usuários) | Mistura “visão” com “ação” |
| **Provisionamento**       | Novo cliente, Novo firewall, Novo usuário, Novo site, Token do agente | Vários fluxos de criação no mesmo grid |
| **Inventário**            | Tabela “Últimos nodes” (5 itens) | Duplica conceito de `/nodes`; não é nem lista completa nem só atalho |
| **Gestão de tokens**      | Tokens por “node recente” (5 nodes) | Token é por node; mistura “cadastro” com “operação por firewall” |
| **Administração avançada**| Usuários e papéis, sessões de outros usuários, Editar clientes, Editar sites | Uso menos frequente; mesmo nível visual que “Novo cliente” |
| **Manutenção**            | Editar clientes/sites (listas longas com forms inline) | Muito conteúdo na mesma página que “criar” |

O **dashboard** (`/dashboard`) está relativamente focado: resumo operacional + zona quente + matriz + lista de servidores. A despoluição (doc 46) já removeu Host/Site da grade. O problema de “grande e poluído” está **principalmente em `/admin`**.

---

## 4. Por que a interface ficou grande e poluída

- **Acúmulo por função, não por contexto:** Cada nova função (criar usuário, tokens, editar clientes/sites, sessões) foi acrescentada em `/admin` sem separar “cadastro inicial” de “inventário/gestão” e “administração avançada”.
- **Uma única página para “tudo que é admin”:** Quem tem role admin/superadmin cai numa única tela que serve ao mesmo tempo para:
  - começar rápido (criar cliente/firewall),
  - operar inventário (ver últimos nodes),
  - emitir/revogar tokens,
  - governar usuários e sessões,
  - manter clientes e sites.
- **Inventário duplicado:** “Últimos nodes” no admin e lista completa em `/nodes` geram redundância e ambiguidade (“cadastro” vs “inventário”).
- **Sem hierarquia por frequência:** Ações raras (editar todos os clientes/sites, revogar sessões de outros) têm o mesmo peso visual que “Novo firewall”.
- **Doc 47 já simplificou o fluxo de dados (Cliente + Firewall, Novo site em avançado), mas a organização das telas continuou uma só.**

---

## 5. Arquitetura de telas proposta (separação de responsabilidades)

Objetivo: **menos coisas por tela**, **mais separação por contexto**, **fluxo operacional claro**.

| Área                      | Responsabilidade | Onde fica / para onde vai |
|---------------------------|------------------|---------------------------|
| **1. Dashboard**         | Visão operacional, status, tabela de servidores, alertas, abrir detalhe | Manter em `/dashboard`; já alinhado aos docs 45 e 46. |
| **2. Cadastro / Provisionamento** | Criar cliente, criar firewall, criar usuário; fluxo simples, sem “muralha” de formulários | **Nova tela dedicada** (ex.: `/admin/cadastro` ou `/cadastro`) ou **primeira seção enxuta** de `/admin` com só isso. |
| **3. Inventário**         | Lista e gestão de firewalls/nodes, filtros, detalhe, edição/exclusão | Já existe em `/nodes` (+ `/nodes/[id]`). **Remover** do admin a tabela “Últimos nodes”; substituir por link “Ver inventário” ou “Firewalls”. |
| **4. Administração avançada** | Sites, tokens, usuários/sessões, edição de clientes/sites, configurações técnicas | **Telas próprias** ou sub-rotas: ex. `/admin/usuarios`, `/admin/tokens`, `/admin/clientes-sites` ou agrupadas em “Administração” com submenu. |

Proposta concreta de divisão:

- **Dashboard** (`/dashboard`): mantém resumo, zona quente, matriz, lista operacional; sem alteração de escopo nesta trilha (apenas eventual pequeno refinamento).
- **Cadastro** (foco “começar a operar”): **uma tela** com só:
  - Novo cliente
  - Novo firewall (Cliente + opcional Site quando 2+)
  - Novo usuário (superadmin) ou card informativo RBAC
  - Link “Novo site” para cadastros avançados
  - Sem cards de resumo gigantes; no máximo um resumo mínimo (ex.: X clientes, Y firewalls).
- **Inventário**: permanece em `/nodes` (e detalhe em `/nodes/[id]`). No admin, **remover** a tabela “Últimos nodes” e colocar um único link “Ver firewalls” → `/nodes`.
- **Administração avançada** (separar do cadastro):
  - **Sites:** “Novo site” + lista/edição de sites (pode ser mesma tela ou sub-rota `/admin/sites`).
  - **Tokens:** emissão por firewall + listagem/revogação; tela dedicada (ex. `/admin/tokens`) ou aprofundar no detalhe do node (já existe contexto de tokens lá).
  - **Usuários e sessões:** tela dedicada (ex. `/admin/usuarios`) para lista de usuários, papéis, sessões por usuário, revogação.
  - **Clientes e sites (edição):** tela dedicada (ex. `/admin/clientes-sites`) para editar clientes e sites, em vez de duas colunas de listas longas no mesmo admin.

Assim, **o que deve ficar no dashboard** = tudo que já está; **o que deve sair do dashboard** = nada obrigatório (dashboard já focado). **O que deve sair do admin** = tabela “Últimos nodes”, bloco “Tokens por node recente” (mover para tela tokens ou detalhe do node), lista completa “Editar clientes” e “Editar sites” (mover para tela dedicada), lista “Usuários e papéis” (mover para tela usuários). **O que deve ficar no admin** = cadastro inicial (Novo cliente, Novo firewall, Novo usuário, atalho Novo site) em formato enxuto; ou redirecionar “Cadastro” para uma rota dedicada e deixar em `/admin` apenas um “hub” com links para Cadastro, Inventário (link), Usuários, Tokens, Clientes e sites.

---

## 6. O que fica / sai / vira tela própria (resumo)

| Item | Fica no dashboard? | Fica no admin? | Vira tela própria / outro lugar? |
|------|---------------------|----------------|-----------------------------------|
| Resumo (cards), zona quente, matriz, lista operacional | Sim | — | — |
| Novo cliente, Novo firewall, Novo usuário | — | Sim (como “Cadastro” enxuto) | Opcional: `/cadastro` só para isso |
| Novo site | — | Sim (link “Cadastros avançados”) | Pode ir para `/admin/sites` ou equivalente |
| Token do agente (emitir) | — | Pode ficar atalho | Preferível: tela `/admin/tokens` ou no detalhe do node |
| Tabela “Últimos nodes” | Não | **Sair** | Substituir por link “Ver firewalls” → `/nodes` |
| Tokens por node recente (listar/revogar) | — | **Sair** | Tela tokens ou aprofundar em `/nodes/[id]` |
| Usuários e papéis + sessões por usuário | — | **Sair** (da página única) | Tela `/admin/usuarios` (ou nome equivalente) |
| Editar clientes / Editar sites | — | **Sair** (da página única) | Tela `/admin/clientes-sites` (ou “Cadastros avançados” com abas/subrotas) |
| Auditoria | — | — | Já é `/audit` |

---

## 7. Trilha em fases (enxuta)

### Fase 1 — Menor corte de risco

- **Objetivo:** Reduzir poluição do admin sem criar novas rotas ainda.
- **Ações:**
  1. Remover do `/admin` a tabela “Últimos nodes no inventário” e substituir por um card/link “Ver firewalls” → `/nodes`.
  2. Remover do `/admin` a seção “Tokens do agente por node recente”; manter apenas o card “Token do agente” (emitir). Quem quiser listar/revogar tokens usa o detalhe do node (`/nodes/[id]`) onde já existe contexto de tokens.
  3. Reorganizar a página em blocos claros: (A) Cadastro inicial — Novo cliente, Novo firewall, Novo usuário, Token (emitir), atalho Novo site; (B) Avançado — um único link “Usuários, clientes e sites” que leva a uma segunda tela ou, na Fase 1, manter “Editar clientes” e “Editar sites” e “Usuários” na mesma página mas abaixo de um título “Administração avançada” e, se possível, colapsável ou em abas internas (menos scroll).
- **Entrega:** Admin com menos conteúdo “inventário/tokens”, foco em cadastro + um bloco avançado identificável.
- **Risco:** Baixo; só remove/move blocos e um link.

### Fase 2 — Limpeza adicional

- **Objetivo:** Separar administração avançada em telas dedicadas.
- **Ações:**
  1. Criar rota `/admin/usuarios`: lista de usuários, papéis, sessões por usuário, revogação (conteúdo hoje em “Usuários e papéis”).
  2. Criar rota `/admin/clientes-sites`: edição de clientes e edição de sites (conteúdo hoje em “Editar clientes” e “Editar sites”).
  3. No `/admin` principal: manter só “Cadastro inicial” (Novo cliente, Novo firewall, Novo usuário, emitir token, atalho Novo site) e **links** para “Usuários”, “Clientes e sites”, “Auditoria”, “Firewalls”.
  4. Opcional: criar `/admin/tokens` para emitir + listar/revogar tokens por node (ou manter emissão no admin e listar/revogar só no detalhe do node).
- **Entrega:** Admin = hub de cadastro + links; usuários e clientes/sites em telas próprias.
- **Risco:** Baixo a médio (novas rotas e movimentação de componentes).

### Fase 3 — Refinamento

- **Objetivo:** Hierarquia visual e navegação clara.
- **Ações:**
  1. Ajustar navegação (layout/sidebar): item “Cadastro” pode virar “Cadastro” (admin principal) + subitens ou segundo nível “Usuários”, “Clientes e sites”, “Tokens” (conforme decisão da Fase 2).
  2. Reduzir ou simplificar os 4 cards do admin (Clientes, Sites, Nodes, Usuários) para um resumo mais compacto ou removê-los e deixar só o hero com um número cada.
  3. Garantir que a tela inicial após login (dashboard) e a primeira experiência em “Cadastro” sejam claras e com menos ruído.
- **Entrega:** Navegação e hierarquia alinhadas à nova divisão; menos elementos por tela.
- **Risco:** Baixo.

---

## 8. Classificação de risco

- **Fase 1:** **Baixo** — remoção de blocos e um link; sem novas rotas.
- **Fase 2:** **Baixo a médio** — novas rotas e movimentação de lógica; back-end inalterado; apenas frontend e rotas.
- **Fase 3:** **Muito baixo** — ajustes de layout e navegação.

**Risco global da trilha:** **Baixo**, desde que não se alterem contratos de API, RBAC ou fluxos já homologados (docs 44–47).

---

## 9. Arquivos que provavelmente serão alterados

- `apps/web/app/admin/page.tsx` — remoção/relocação de seções; possível quebra em subpáginas.
- `apps/web/app/layout.tsx` — possíveis novos itens de navegação ou submenu para admin.
- `apps/web/components/app-nav.tsx` — se houver submenu ou estrutura de “Admin” expandida.
- Novos arquivos possíveis:
  - `apps/web/app/admin/usuarios/page.tsx` (ou `app/admin/usuarios/page.tsx`)
  - `apps/web/app/admin/clientes-sites/page.tsx`
  - `apps/web/app/admin/tokens/page.tsx` (opcional)
  - `apps/web/app/cadastro/page.tsx` (opcional, se cadastro for rota separada).
- Componentes que hoje vivem dentro de `admin/page.tsx` podem ser extraídos para:
  - `apps/web/components/admin-create-*.tsx` ou
  - seções reutilizáveis em `admin/usuarios`, `admin/clientes-sites`, etc.

Nenhuma alteração prevista em: `apps/api`, package pfSense, docs 44–47, fluxos de bootstrap ou exclusão de hosts.

---

## 10. Documentos a criar ou atualizar

- **Criar:** `docs/48-ANALISE-DESMEMBRAMENTO-INTERFACE-ADMIN-2026-03-15.md` (este arquivo).
- **Criar (após aprovação):** doc de **entrega da trilha** (ex.: `docs/49-ENTREGA-DESMEMBRAMENTO-INTERFACE-ADMIN-2026-03-15.md`) com:
  - escopo implementado (Fase 1, 2 e/ou 3),
  - nova divisão de telas,
  - arquivos alterados,
  - versões (painel, API),
  - evidências de validação e riscos remanescentes.
- **Atualizar (após implementação):** `00_inicio.md` — registrar nova trilha e, ao encerrar, “Trilha de desmembramento da interface admin (doc 48/49)”; `LEITURA-INICIAL.md` — última entrega; `00-README.md` — índice do doc 48/49 se necessário.

---

## 11. Aguardando autorização

Nenhuma implementação foi feita. Esta análise serve como base para você autorizar:

- a direção geral (separação Dashboard / Cadastro / Inventário / Administração avançada);
- a adoção das Fases 1, 2 e 3 como acima ou com ajustes;
- e a prioridade (ex.: só Fase 1 primeiro).

Após sua autorização, a implementação pode seguir em fases, com documentação e validação em cada entrega.

---

## Referências

- `00_inicio.md` — trilhas encerradas 1–8
- `CORTEX.md` — dashboard tem prioridade; regras de painel
- `docs/45-DASHBOARD-OPERACIONAL-LISTA-SERVIDORES-2026-03-15.md`
- `docs/46-DESPOLUICAO-VISUAL-DASHBOARD-OPERACIONAL-2026-03-15.md`
- `docs/47-SIMPLIFICACAO-MODELO-CADASTRO-CLIENTE-FIREWALL-2026-03-15.md`
