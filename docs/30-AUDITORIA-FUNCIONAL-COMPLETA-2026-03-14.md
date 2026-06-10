# Auditoria Funcional Completa — Monitor-Pfsense

**Data:** 2026-03-14  
**Objetivo:** Avaliar o sistema como produto operacional para gestão de pfSense, identificar excessos, redundâncias e oportunidades de simplificação.

---

## 1. Resumo Executivo

O Monitor-Pfsense é um painel central para monitorar firewalls pfSense CE, com backend NestJS, frontend Next.js, SSE para tempo real, inventário, alertas, bootstrap do agente e cadastro administrativo. A auditoria mostra que:

- **Telas principais (6):** Dashboard, Firewalls, Alertas, Instalação, Minha conta, Cadastro (admin). Há também Login, Auditoria (sem link no menu) e detalhe do firewall.
- **Complexidade:** O sistema tende a **excesso**: muitos indicadores repetidos, filtros similares em várias telas, formulários longos e blocos avançados extensos. Há redundância entre Dashboard, Inventário e Bootstrap em relação a contagens e status.
- **Pontos fortes:** Fluxo de bootstrap é completo; RBAC bem definido; SSE funcionando; cadastro inicial simplificado (códigos gerados automaticamente).
- **Risco principal:** O operador pode se perder entre muitas telas, cards, filtros e opções avançadas. A prioridade declarada é "fácil, clara e útil"; a implementação atual é mais complexa do que necessário para essa meta.

**Recomendação:** Simplificar antes de ampliar. Reduzir indicadores duplicados, consolidar filtros e mover conteúdos técnicos para seções avançadas ou externas.

---

## 2. Inventário Completo do Sistema

### 2.1 Telas

| Tela | Rota | Função pretendida | Onde está | Dependências |
|------|------|-------------------|-----------|--------------|
| Raiz | `/` | Redireciona para dashboard ou login | `app/page.tsx` | - |
| Login | `/login` | Autenticação humana | `app/login/page.tsx` | - |
| Dashboard | `/dashboard` | Resumo operacional | `app/dashboard/page.tsx` | SSE, summary API, nodes API |
| Inventário | `/nodes` | Lista de firewalls | `app/nodes/page.tsx` | SSE, filters API, nodes API |
| Detalhe do firewall | `/nodes/[id]` | Dados completos do node | `app/nodes/[id]/page.tsx` | SSE, node API, bootstrap API |
| Alertas | `/alerts` | Central de alertas | `app/alerts/page.tsx` | SSE, alerts API, filters API |
| Instalação | `/bootstrap` | Operação em lote do bootstrap | `app/bootstrap/page.tsx` | SSE, nodes API, bootstrap API |
| Minha conta | `/sessions` | Governança das sessões da própria conta | `app/sessions/page.tsx` | sessions API |
| Cadastro | `/admin` | Criar cliente, site, node, usuário; editar; tokens | `app/admin/page.tsx` | filters, nodes, users, tokens, sessions APIs |
| Auditoria | `/audit` | Trilha administrativa | `app/audit/page.tsx` | Audit API, RBAC admin |

**Nota:** `/audit` existe mas **não aparece no menu**. Só é acessível via link no detalhe do node ("Ver eventos deste firewall") ou digitando a URL.

### 2.2 Menus

| Item | Rota | Visibilidade |
|------|------|--------------|
| Dashboard | `/dashboard` | Todos autenticados |
| Firewalls | `/nodes` | Todos autenticados |
| Alertas | `/alerts` | Todos autenticados |
| Instalação | `/bootstrap` | Todos autenticados |
| Minha conta | `/sessions` | Todos autenticados |
| Cadastro | `/admin` | Apenas admin e superadmin |

### 2.3 Cards e Indicadores

#### Dashboard
- PageHero: Nodes, Alertas abertos, Fora da matriz
- 7 SummaryCards: Nodes, Online, Degraded, Offline, Maintenance, Open Alerts, Fora da matriz
- Zona quente: até 6 firewalls offline/degraded
- Matriz de versão: contagem por versão pfSense + lista homologada

#### Inventário (/nodes)
- PageHero: Itens filtrados, Agente ativo, Bloqueados
- 3 cards: Bootstrap (aguardando), Agente ativo (em operação), Bloqueados (exigem ajuste)
- Tabela: Status, Firewall, Local, Versão, Último contato, Instalação

#### Alertas
- PageHero: Abertos, Reconhecidos, Críticos
- 6 SummaryCards: Open, Acknowledged, Resolved, Critical, Warning, Info
- Lista de alertas com detalhes e ações

#### Instalação (/bootstrap)
- PageHero: Prontos, Ativos, Bloqueados
- Filtros: cliente, site, bucket, busca
- Bloco "Escolha o firewall" com select + overrides
- Bloco "Instalação" com comando principal
- Seção avançada: verify-bootstrap-release, run-bootstrap-preflight
- Seção "Resumo" (firewall selecionado): Node UID, Hostname, Release, etc.
- Seção "Detalhes técnicos": pre-check pfSense, evidências
- 3 cards: Prontos, Ativos, Bloqueados (repetidos)
- Fila de bootstrap (lista prontos)
- Agentes ativos (até 6)
- Bloqueios (até 6)

#### Minha conta (/sessions)
- PageHero: Total, Ativas, Revogadas
- 3 cards: Total, Ativas, Revogadas (repetem PageHero)
- Lista de sessões

#### Cadastro (/admin)
- PageHero: Clientes, Nodes, Usuários
- 4 cards: Clientes, Sites, Nodes, Usuários
- Formulários: Novo cliente, Novo site, Novo firewall, Novo usuário, Token do agente
- Tabela "Últimos nodes"
- Seção "Tokens do agente por node recente"
- Seção "Usuários e papeis" (superadmin)
- Seção "Editar clientes"
- Seção "Editar sites"

#### Auditoria
- PageHero: Eventos, Ações, Targets
- Lista de eventos de auditoria

#### Detalhe do firewall
- PageHero: Status, Último contato, pfSense, Agente
- Resumo do equipamento: Uptime, CPU, Memória, Disco
- Serviços
- Dados principais + botão Maintenance
- Editar cadastro (admin): hostname, display_name, management_ip, wan_ip, pfsense_version, agent_version, ha_role
- Alertas recentes
- Instalar agente: Node UID, Secret, Comando principal, Comandos de teste
- AdvancedSection "Mais opções": URLs, overrides, pre-check, evidências, atalhos

### 2.4 Filtros

| Tela | Filtros |
|------|---------|
| Inventário | client_id, site_id, status, search |
| Alertas | client_id, site_id, node_id, status, severity, type, search |
| Bootstrap | client_id, site_id, bucket, search |
| Auditoria | action, target_type, target_id |

### 2.5 Botões de Ação

| Local | Ação |
|-------|------|
| Dashboard | Ver inventário (link) |
| Inventário | Aplicar filtros |
| Alertas | Aplicar filtros, Limpar, Acknowledge, Resolver |
| Bootstrap | Filtrar, Limpar, Abrir, Limpar preflight |
| Sessions | Revogar sessão |
| Admin | Criar cliente/site/firewall/usuário, Emitir token, Salvar cliente/site, Revogar token/sessão |
| Detalhe node | Voltar, Maintenance on/off, Salvar metadados, Rotacionar secret, Aplicar override |

### 2.6 Blocos Informativos

- RealtimeRefresh (último evento SSE, status da conexão)
- AdvancedSection (detalhes técnicos recolhíveis)
- Blocos de evidências (YAML para homologação)
- Comandos copiáveis (pre-check, pós-instalação)
- Avisos de sucesso/erro via query params

### 2.7 Tabelas/Listas

- Inventário: tabela de firewalls
- Admin: última tabela de nodes, lista de tokens por node, lista de usuários com sessões
- Alertas: lista de alertas
- Sessions: lista de sessões
- Audit: lista de eventos

### 2.8 Campos de Cadastro

**Cliente:** name (código automático)  
**Site:** client_id, name, city, state, timezone (código automático)  
**Node:** site_id, hostname, display_name, management_ip, wan_ip, pfsense_version, maintenance_mode (node_uid automático)  
**Usuário:** email, display_name, password, role, status  
**Token agente:** node_id, expires_at  
**Editar node:** hostname, display_name, management_ip, wan_ip, pfsense_version, agent_version, ha_role  

### 2.9 Fluxos Principais

1. **Login → Dashboard** — ver resumo
2. **Dashboard → Inventário** — ver lista de firewalls
3. **Inventário → Detalhe** — abrir firewall
4. **Detalhe → Bootstrap** — copiar comando e instalar
5. **Admin → Criar cliente/site/node** — cadastro inicial
6. **Admin → Criar node** → redireciona para Detalhe
7. **Alertas → Acknowledge/Resolver**
8. **Bootstrap → Selecionar node → Copiar comando**

---

## 3. Avaliação de Utilidade por Item

### 3.1 Telas

| Tela | Classificação | Justificativa |
|------|---------------|---------------|
| Login | **Essencial** | Obrigatório para acesso |
| Dashboard | **Útil** | Resumo rápido; mas 7 cards podem ser excessivos |
| Inventário | **Essencial** | Core do produto |
| Detalhe do firewall | **Essencial** | Indispensável para operação |
| Alertas | **Essencial** | Central de problemas |
| Bootstrap | **Útil** | Foco em instalação; muito conteúdo técnico na mesma tela |
| Sessions | **Útil** | Segurança; uso esporádico |
| Admin | **Útil** | Necessário; muito denso |
| Audit | **Opcional** | Útil para troubleshooting; deveria estar no menu para admin |

### 3.2 Cards e Indicadores

| Item | Classificação | Problema |
|------|---------------|----------|
| Nodes total (Dashboard) | **Útil** | Ok |
| Online, Degraded, Offline, Maintenance (Dashboard) | **Útil** | Semáforo operacional |
| Open Alerts (Dashboard) | **Redundante** | Já está no PageHero e na Zona quente |
| Fora da matriz (Dashboard) | **Útil** | Importante para governança |
| Zona quente (6 firewalls) | **Essencial** | Ação imediata |
| Matriz de versão | **Útil** | Pode ser simplificada |
| Cards Bootstrap (Inventário) | **Redundante** | Mesmos totais já no PageHero e em Bootstrap |
| 6 cards de alertas (Open, Ack, Resolved, Critical, Warning, Info) | **Excesso** | 3 (Open, Ack, Resolved) bastariam; severity pode vir nos itens |
| Cards Total/Ativas/Revogadas (Sessions) | **Redundante** | Repetem PageHero |
| 4 cards Admin (Clientes, Sites, Nodes, Usuários) | **Opcional** | Contexto; não essencial |
| Cards Prontos/Ativos/Bloqueados em Bootstrap | **Redundante** | Repetem PageHero e estão em 2 blocos |

### 3.3 Filtros

| Filtro | Tela | Classificação |
|--------|------|---------------|
| client_id, site_id | Inventário, Alertas, Bootstrap | **Útil** — padrão do produto |
| status | Inventário, Alertas | **Útil** |
| search | Inventário, Alertas, Bootstrap | **Útil** |
| node_id | Alertas | **Útil** |
| severity, type | Alertas | **Opcional** — tipo técnico, severity nos itens |
| bucket | Bootstrap | **Útil** |
| action, target_type, target_id | Audit | **Útil** para diagnóstico |

### 3.4 Blocos Avançados

| Bloco | Onde | Classificação |
|-------|------|---------------|
| AdvancedSection "Mais opções" (Detalhe) | nodes/[id] | **Opcional** — correto estar recolhido |
| AdvancedSection "Diagnóstico e preflight" (Bootstrap) | bootstrap | **Opcional** — correto |
| Overrides release_base_url, controller_url | Detalhe e Bootstrap | **Opcional** — homologação |
| Evidências, pre-check pfSense | Detalhe e Bootstrap | **Opcional** — documentação/homologação |

### 3.5 Formulários e Campos

| Formulário | Campos | Classificação |
|------------|--------|---------------|
| Novo site | city, state, timezone | **Opcional** — maioria pode ficar em branco no início |
| Novo node | management_ip, wan_ip, pfsense_version | **Opcional** no cadastro — podem ser preenchidos depois |
| Editar node | 8 campos | **Útil** — ha_role pode ficar só em avançado |
| Editar site | city, state, timezone, code | **Útil** — code raramente alterado |
| Token agente | expires_at | **Opcional** — uso avançado |

---

## 4. Problemas de Excessão, Duplicidade e Complexidade

### 4.1 Indicadores em excesso

- **Dashboard:** 7 SummaryCards + PageHero com 3 stats. "Nodes" e "Open Alerts" aparecem 2 vezes.
- **Inventário:** PageHero + 3 cards de bootstrap. Os totais de bootstrap aparecem no PageHero e nos cards.
- **Bootstrap:** PageHero com Prontos/Ativos/Bloqueados + 3 cards idênticos + seção "Escopo atual" com atalhos.
- **Alertas:** 6 cards (Open, Ack, Resolved, Critical, Warning, Info) + PageHero. Muitos ângulos para a mesma informação.
- **Sessions:** PageHero + 3 cards repetindo Total/Ativas/Revogadas.

### 4.2 Filtros em excesso

- **Alertas:** 7 filtros (client, site, node, status, severity, type, search). Severity e type são técnicos; para operação diária, status e busca costumam bastar.
- **Bootstrap:** Filtros + overrides de URL no mesmo formulário. Overrides são para homologação e poderiam ficar em avançado.

### 4.3 Conteúdo técnico exposto

- Detalhe do node: URLs (Artifact, Checksum, Installer), overrides, pre-check, evidências, atalhos para Audit. Tudo útil, mas volumoso.
- Bootstrap: verify-bootstrap-release, run-bootstrap-preflight, evidências. Bom ter, mas em avançado.
- Login: 3 cards (Sessão, Cookie, Autoridade) explicando a arquitetura. Pouco valor para o operador.

### 4.4 Duplicação entre telas

- Status/bootstrap: Dashboard (zona quente), Inventário (tabela + cards), Bootstrap (filas + cards). O mesmo "quem precisa de atenção" aparece em vários lugares.
- Comandos: Detalhe do node e Bootstrap mostram o mesmo comando de instalação e verificações.

### 4.5 Auditoria escondida

- `/audit` não está no menu. Só é alcançável por link no detalhe do node ou URL direta. Para admin, faz sentido ter acesso direto.

### 4.6 Nomenclatura inconsistente

- "Nodes" vs "Firewalls" — menu diz "Firewalls", alguns textos dizem "nodes".
- "Open" vs "Abertos" — mistura de inglês e português.
- "Acknowledge" — termo em inglês em botão.

---

## 5. Proposta de Simplificação

### 5.1 MANTER

- Login, Dashboard (resumo), Inventário, Detalhe do firewall, Alertas, Bootstrap, Sessions, Admin, Audit
- Filtros cliente/site/status/busca no Inventário e Alertas
- Zona quente no Dashboard
- Comando de bootstrap no Detalhe
- Botões Maintenance, Rekey, Salvar metadados
- RealtimeRefresh
- AdvancedSection para conteúdo técnico
- RBAC e fluxo de cadastro (cliente → site → node)

### 5.2 AJUSTAR

| Item | Ajuste sugerido |
|------|-----------------|
| Dashboard | Reduzir para 5 cards: Online, Degraded, Offline, Alertas abertos, Fora da matriz. Remover "Nodes" e "Maintenance" como card principal (manter na matriz se fizer sentido). |
| PageHero stats | Evitar repetir no hero o que já está nos cards. |
| Alertas | Manter 3 cards: Abertos, Reconhecidos, Resolvidos. Severity nos itens; remover cards Critical/Warning/Info. |
| Bootstrap | Manter PageHero com 3 stats; remover os 3 cards repetidos. |
| Sessions | Remover os 3 cards; manter só PageHero + lista. |
| Login | Remover os 3 cards técnicos (Sessão, Cookie, Autoridade). |
| Detalhe node | Simplificar "Editar cadastro": ha_role em seção avançada. |
| Nomenclatura | Padronizar "Firewalls", "Abertos", "Reconhecer" em português. |
| Menu | Adicionar "Auditoria" para admin/superadmin. |

### 5.3 CONSOLIDAR

| Itens | Proposta |
|-------|----------|
| Cards de status/bootstrap | Manter um único bloco de totais por tela (PageHero ou cards, não ambos). |
| Comandos bootstrap | Detalhe do node como referência principal; Bootstrap apenas seleção + comando, com link "Ver detalhe completo". |
| Filtros Alertas | Unificar em menos controles: Status + Busca obrigatórios; Cliente/Site/Node opcionais; Severity e Type em "Filtros avançados" ou dropdown. |
| Overrides de URL | Só em AdvancedSection, tanto no Detalhe quanto no Bootstrap. |

### 5.4 REMOVER (ou esconder em avançado)

| Item | Ação |
|------|------|
| Cards duplicados (Bootstrap, Sessions) | Remover cards que repetem PageHero. |
| Cards Critical/Warning/Info em Alertas | Remover; usar badges nos itens. |
| Cards Total/Ativas/Revogadas em Sessions | Remover (PageHero já informa). |
| Cards Clientes/Sites/Nodes/Usuários em Admin | Avaliar remoção ou simplificação; não são críticos. |
| Cards técnicos no Login | Remover. |
| Campo ha_role visível no cadastro básico | Mover para avançado. |
| Campo city, state, timezone em Novo site | Manter como opcionais, com placeholder "Opcional". |

---

## 6. Plano Seguro de Execução

### 6.1 Baixo risco (pode alterar agora)

- Adicionar Auditoria ao menu para admin
- Padronizar nomenclatura (Firewalls, Abertos, Reconhecer)
- Remover cards técnicos do Login
- Remover cards duplicados em Sessions (Total/Ativas/Revogadas)
- Traduzir "Acknowledge" para "Reconhecer"

### 6.2 Risco médio (cuidado)

- Reduzir cards no Dashboard — validar com uso real
- Simplificar cards em Alertas — verificar se alguém usa Critical/Warning/Info
- Remover cards duplicados em Bootstrap — garantir que PageHero basta
- Mover overrides para AdvancedSection — não quebrar fluxo de homologação

### 6.3 Depende de migração

- Nenhuma alteração estrutural de dados identificada. Simplificações são de UI/UX.

### 6.4 Não mexer ainda

- Fluxo de bootstrap (comando, verificação, evidências)
- RBAC e permissões
- APIs e modelo de dados
- SSE e tempo real

### 6.5 Testes antes de remoção

- Smoke suite: `scripts/run-smoke-suite.sh`
- Verificar: login, dashboard, inventário, detalhe, bootstrap, admin, alertas, sessions
- Testar filtros após simplificação
- Validar que comando de bootstrap continua acessível

---

## 7. Próxima Etapa Recomendada

1. **Implementar alterações de baixo risco** (menu Audit, nomenclatura, cards do Login e Sessions).
2. **Medir impacto** — se ninguém reclamar, seguir com remoção de cards duplicados no Dashboard, Alertas e Bootstrap.
3. **Revisar filtros de Alertas** — colocar severity/type em "Avançado" ou removê-los, conforme uso real.
4. **Documentar** as mudanças em um CHANGELOG ou doc de simplificação.
5. **Não adicionar novas funcionalidades** até a simplificação estar concluída e validada.

---

## Conclusão

O sistema cumpre o papel de monitorar e gerenciar pfSense, mas está mais complexo do que o objetivo de "fácil, clara e útil". Há redundância de indicadores, filtros em excesso em algumas telas e conteúdo técnico espalhado. A simplificação proposta preserva o que é essencial e reduz ruído, sem quebrar fluxos operacionais. A prioridade deve ser executar as alterações de baixo risco e depois avaliar o impacto antes de simplificações mais profundas.
