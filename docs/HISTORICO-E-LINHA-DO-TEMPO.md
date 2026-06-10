# Histórico e linha do tempo — Monitor-Pfsense

Documento de referência do **que foi feito**, **por quê** e **o que não repetir**. Use para retomada do projeto e para evitar os mesmos erros.

**Última atualização:** 2026-06-09

---

## 1. Objetivo deste documento

- Manter uma **linha do tempo** das alterações relevantes (agente, API, painel, UX).
- Registrar **decisões** e **comportamentos esperados** para não reabrir questões já fechadas.
- Listar **erros cometidos e correções** para não repeti-los em novos chats ou refatorações.

---

## 2. Linha do tempo por tema

### 2.0 Trilha RBAC — usuários, permissões e escopo (2026-06-09)

- **Objetivo:** reestruturar RBAC humano com escopo por cliente, permissões granulares, perfil `client`, UX administrativa e auditoria — sem alterar ingest do agente.
- **Plano mestre:** `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
- **Encerramento:** `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md`
- **Versões finais da trilha:** API `0.2.4`, painel `0.2.3` (Fase E)
- **Fases:** A (correções UX) → B (escopo) → C (permissões) → D (perfil client) → E (UX admin + middleware) → F (auditoria + endurecimento)
- **Lições:**
  - Cache global de `/nodes/filters` precisa invalidação após mutações de inventário (Fase D/E).
  - `middleware.ts` no Next.js complementa guards da API para rotas do painel.
  - `AUTH_BOOTSTRAP_LOGIN_ENABLED=false` em produção após criar usuários locais.
  - Download de `config.xml` exige `backups.download` + auditoria com `actor_role` e `client_id`.
- **Não reabrir** fases A–F sem decisão explícita; Fase G (opcional) em trilha separada.

### 2.0.10 Encerramento roadmap UX front-end Fases 0–8 (**2026-06-09**)

- **Encerramento formal:** `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`
- **Versões finais:** painel `1.0.0`, API `0.2.7`
- **Trilhas consolidadas:** `docs/79`–`docs/87` (entregas `docs/80`–`docs/87`); contexto pré-roadmap em `docs/77`–`docs/78`
- **Não reabrir** fases 0–8 sem novo plano mestre

### 2.0.9 UX front-end — Fase 8 design system pages restantes (**concluída**, 2026-06-09) — **roadmap plano 24 encerrado**

- **Plano:** `31-plano-fase8-design-system-pages-restantes-2026-06-09.md`
- **Trilha:** `docs/87-TRILHA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md`
- **Entrega:** `docs/87-ENTREGA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md` — adoção design system em alerts, bootstrap, admin, sessions, login
- **Versão:** painel `1.0.0` (minor — fechamento roadmap UX); API `0.2.7` (sem alteração)
- **Componente novo:** `DataTable` em `components/ui/data-table.tsx`
- **Lição:** `nodes-table-with-delete.tsx` permanece órfão (Fase 3 usa `NodesInventoryTable`); atualizado por consistência

### 2.0.8 UX front-end — Fase 7 auditoria filtros amigáveis (**concluída**, 2026-06-09)

- **Plano:** `30-plano-fase7-auditoria-filtros-amigaveis-2026-06-09.md`
- **Trilha:** `docs/86-TRILHA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md`
- **Entrega:** `docs/86-ENTREGA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md` — filtros PT-BR em `/audit`
- **Versão:** painel `0.8.0` (minor); API `0.2.7` (patch — query params opcionais `result`, `from`, `to`, `actor_email`, `offset`)
- **Decisões:** escopo RBAC e `audit.view` inalterados; labels em `audit-labels.ts`

### 2.0.7 UX front-end — Fase 6 conta separada + polimento PT-BR (**concluída**, 2026-06-09)

- **Plano:** `29-plano-fase6-conta-separada-polimento-ptbr-2026-06-09.md`
- **Trilha:** `docs/85-TRILHA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md`
- **Entrega:** `docs/85-ENTREGA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md` — `/conta` perfil + `/sessions` dedicada
- **Versão:** painel `0.7.0` (minor); API `0.2.6` (sem alteração — sem endpoint troca de senha)
- **Decisões:** menu Conta sem duplicata; senha via administrador; polimento PT-BR pontual

### 2.0.6 UX front-end — Fase 5 backups frota + menu (**concluída**, 2026-06-09)

- **Plano:** `28-plano-fase5-backups-frota-menu-2026-06-09.md`
- **Trilha:** `docs/84-TRILHA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md`
- **Entrega:** `docs/84-ENTREGA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md` — `/backups` frota + item menu Operação
- **Versão:** painel `0.6.0` (minor); API `0.2.6` (sem alteração — estratégia front com `GET /nodes`)
- **Decisões:** permissão `backups.view`; KPIs/filtros backup no front; link para `/nodes/[id]?tab=backup`

### 2.0.5 UX front-end — Fase 4 detalhe firewall em abas (**concluída**, 2026-06-09)

- **Plano:** `27-plano-fase4-detalhe-firewall-abas-2026-06-09.md`
- **Trilha:** `docs/83-TRILHA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md`
- **Entrega:** `docs/83-ENTREGA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md` — `/nodes/[id]` em abas (visão geral, métricas, alertas, backup, configuração)
- **Versão:** painel `0.5.0` (minor); API `0.2.6` (sem alteração)
- **Decisões:** `?tab=` na URL; perfil `client` sem aba Alertas; features existentes preservadas

### 2.0.4 UX front-end — Fase 3 firewalls inventário (**concluída**, 2026-06-09)

- **Plano:** `26-plano-fase3-firewalls-inventario-backup-alertas-2026-06-09.md`
- **Trilha:** `docs/82-TRILHA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md`
- **Entrega:** `docs/82-ENTREGA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md` — inventário `/nodes` com colunas backup e alertas, design system, ordenação
- **Versão:** painel `0.4.0` (minor); API `0.2.6` (patch — campos opcionais em `GET /nodes`)
- **Decisões:** extensão mínima API para backup na listagem; coluna alertas oculta para perfil `client`

### 2.0.3 UX front-end — Fase 2 dashboard enxuto (**concluída**, 2026-06-09)

- **Plano:** `25-plano-fase2-dashboard-enxuto-kpis-zona-quente-2026-06-09.md`
- **Trilha:** `docs/81-TRILHA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md`
- **Entrega:** `docs/81-ENTREGA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md` — KPIs com design system, zona quente polida, tabela operacional removida, CTA para `/nodes`
- **Versão:** painel `0.3.0` (minor); API inalterada `0.2.5`
- **Decisões:** stats redundantes removidos do PageHero; inventário completo só em Firewalls (`/nodes`)

### 2.0.2 UX front-end — Fase 0 + Fase 1 layout (**concluída**, 2026-06-09)

- **Plano:** `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md`
- **Trilha:** `docs/79-TRILHA-FRONTEND-FASE0-FASE1-LAYOUT-NAVEGACAO-2026-06-09.md`
- **Entrega:** `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md` — sidebar 240/64px, header, breadcrumbs, `components/ui/`
- **Versão:** painel `0.2.8` (patch); API inalterada `0.2.5`
- **Hotfix `0.2.9`:** `.glass-panel { width:100% }` sobrescrevia `.app-sidebar` — coluna principal (header, breadcrumbs, páginas) ficava fora do viewport; reordenado CSS em `globals.css`
- **Decisões mantidas:** Backups fora do menu; permissões de `buildNavGroups` inalteradas; páginas de negócio intactas

### 2.0.1 Pós-RBAC — UX escopo e layout responsivo (2026-06-09)

- **Doc:** `docs/77-ENTREGA-POS-RBAC-UX-LAYOUT-2026-06-09.md`
- **Versões atuais do produto:** API `0.2.4`, painel `0.2.5`
- **Painel `0.2.4`:** lista multi-coluna em Clientes permitidos; purge smoke (`scripts/purge-smoke-test-data.sh`)
- **Painel `0.2.5`:** shell fluido `.app-shell` (breakpoints 1440/1800/2200px); cards e hero em largura total
- **Lição:** toda entrega em `apps/web` ou `apps/api` exige bump em `package.json` + índices (regra `.cursor/rules/versioning.mdc`)

---

### 2.1 Modo manutenção e redirect (frontend)

- **Problema:** Ao ativar/desativar "maintenance mode" no painel, a ação era concluída com sucesso no backend, mas o frontend exibia erro: *"Falha ao atualizar maintenance mode: NEXT_REDIRECT"*.
- **Causa:** Em Server Actions do Next.js, `redirect()` lança um valor especial (`NEXT_REDIRECT`) que não é erro; o `catch` do formulário tratava como erro e mostrava a mensagem ao usuário.
- **Correção:** Em `apps/web/lib/admin.ts`, no `catch` de `setNodeMaintenanceAction`, chamar `rethrowIfRedirectError(error)` antes de tratar como falha, para que o redirect seja propagado e a navegação ocorra normalmente.
- **Lição:** Em Server Actions que usam `redirect()`, sempre re-lançar o “erro” de redirect em vez de exibi-lo ao usuário.

---

### 2.2 Comandos servidor → agente (ideia futura)

- **Contexto:** Foi avaliada a possibilidade de o servidor enviar comandos ou atualizações aos agentes nos firewalls (ex.: atualizar o agente).
- **Segurança:** Documentado em `docs/SEGURANCA-E-MODELO-DE-AMEACAS.md` (riscos de invasão/comprometimento dos clientes).
- **Ideia registrada:** `docs/IDEIAS-DE-FUNCOES.md` — comandos assinados entregues via GitHub (ou canal controlado), para implementação futura, sem expor os firewalls a comandos arbitrários do servidor.
- **Estado:** Apenas documentado; não implementado.

---

### 2.3 Serviços: “sem clientes” e “desativados” (falsos positivos)

- **Problema 1:** OpenVPN (e similares) em funcionamento, mas **sem clientes conectados**, eram reportados como erro pelo agente.
- **Problema 2:** Serviços **intencionalmente desativados** pelo cliente apareciam como erro.
- **Solução:**
  - **Sem clientes:** No backend (`node-status.util.ts`), serviços do tipo `openvpn` cuja mensagem indica “no clients” / “0 clients” **não** degradam o node nem geram alerta (`isNoClientsOnly`).
  - **Desativados:** O agente passa a reportar status `not_installed` quando o serviço está desativado no rc/config; o backend não considera `not_installed` como problema. Para IPsec Phase 1 com checkbox “Disabled” no pfSense, o agente lê `<disabled/>` no `config.xml` e envia `not_installed` + mensagem “(desativado)”.
- **Lição:** Distinguir sempre: **running** (ok), **stopped** (problema quando esperado rodar), **not_installed** (não instalado/desativado = não é alerta).

---

### 2.4 Monitoramento por túnel (OpenVPN, IPsec, WireGuard)

- **Objetivo:** Saber **qual** túnel/conexão está off, não só se o daemon está no ar.
- **Convenção:** Serviços no formato `{tipo}:{identificador}` (ex.: `openvpn:server1`, `ipsec:con1_2`, `wireguard:wg0`).
- **Agente:**
  - OpenVPN: lista instâncias (ex.: server1, client1) e reporta um item por túnel.
  - IPsec: usa `swanctl --list-sas` e config.xml (Phase 1) para listar túneis; descrição (ex.: “Matriz-Mecanica”) vem do config e vai no `message`.
  - WireGuard: usa `wg show interfaces` e reporta uma entrada por interface.
- **PATH no agente:** O script do agente roda com PATH mínimo; `swanctl` fica em `/usr/local/sbin`. Foi adicionado `/usr/local/sbin` ao PATH em `monitor-pfsense-agent-loop.sh` e no script `rc.d`, para o agente encontrar `swanctl`.
- **IPsec:**
  - **Descrições:** O agente lê o campo Description (Phase 1) do `config.xml` e envia no `message`; o painel exibe essa descrição em vez de “con1”, “con2”.
  - **Degradação:** O agente reporta **todas** as Phase 1 configuradas (não só as que aparecem em `swanctl --list-sas`). Se uma Phase 1 configurada não estiver ESTABLISHED → status `stopped`; o node é degradado e pode gerar alerta (o túnel não “some” da lista).
  - **Phase 1 desativada (checkbox Disabled):** Se existir `<disabled/>` no config, o agente envia `not_installed` e mensagem “(desativado)”; o backend não degrada e o painel exibe em **cinza**.
- **Documentação:** `docs/MONITORAMENTO-POR-TUNEL-VPN.md`.

---

### 2.5 Múltiplas interfaces de rede (nome e IP)

- **Objetivo:** Exibir no painel as interfaces como no pfSense (nome visual + IP), e não apenas um “IP interno” e um “IP WAN”.
- **Agente (0.2.19/0.2.20+):**
  - Envia no heartbeat o array **`interfaces`**: `[{ "name": "WAN1GB", "ip": "10.200.201.2" }, ...]`.
  - O **nome** é a descrição da interface no pfSense (ex.: WAN1GB, LAN, CAMERAS); quando não há IP (link down), envia `"ip": "n/a"`.
  - Mantém `mgmt_ip` e `wan_ip_reported` em string (virgula-separada) para compatibilidade.
- **Backend:** O payload do heartbeat é guardado em `payload_json`; o endpoint de detalhe do node devolve **`network_interfaces`** a partir do último heartbeat (`payloadJson.interfaces`).
- **Frontend:** Se existir `network_interfaces`, a página do node mostra a secção **“Interfaces (como no pfSense)”** com chips **Nome: IP**. Caso contrário, usa “IP(s) interno(s)” e “IP(s) público(s) / WAN”.
- **Fallback quando lista vazia (agente 0.2.21):** Se `list_pfsense_interface_roles` não retornar linhas (config inacessível, PHP, etc.), o agente monta um array mínimo com **LAN** (IP de gerenciamento) e **WAN** (IP WAN). Assim o painel sempre recebe pelo menos duas entradas e não fica com chips vazios.
- **Lição:** Em firewalls onde o config não é lido pelo agente, o fallback LAN/WAN evita tela sem informações; para lista completa com nomes customizados, o agente precisa conseguir ler o config (permissões, PATH, etc.).

---

### 2.6 Cadastro de firewall: só cliente obrigatório

- **Objetivo:** Permitir cadastrar um node com o mínimo de dados; nome, hostname e IPs vêm do próprio firewall no primeiro heartbeat.
- **Alterações:**
  - **API/Admin:** `hostname` (e campos de IP) opcionais no DTO de criação de node; se `hostname` vazio, o backend gera um `node_uid` (ex.: `fw-abc12def`) e usa como hostname até o agente reportar.
  - **Ingest:** No primeiro heartbeat, se `displayName` do node for null, o backend preenche com `request.body.hostname`.
  - **Formulário (painel):** Hostname e IPs opcionais; texto explicando que o sistema gera um ID e que, após o bootstrap no pfSense, nome e IPs são preenchidos pelo agente.
- **Lição:** Manter o formulário de criação alinhado ao contrato da API (opcional onde a API aceita opcional).

---

### 2.7 Exibição das interfaces no painel (chips vazios e botão)

- **Problema 1:** A secção “Interfaces (como no pfSense)” mostrava **chips vazios** (sem texto) quando o backend enviava itens com `name` ou `ip` vazios/undefined.
- **Correção (frontend):**
  - **Valores padrão:** Se `name` vazio → exibir **"—"**; se `ip` vazio → exibir **"n/a"**, para o chip nunca ficar em branco.
  - **Filtro:** Só exibir interfaces que tenham pelo menos `name` ou `ip` preenchidos.
  - **Mensagem:** Se todas as interfaces estiverem vazias, exibir *“Nenhuma interface com nome ou IP preenchido.”*
  - Mesma lógica defensiva na secção **“Editar cadastro”**.
- **Problema 2:** O botão **“Ativar maintenance mode”** era grande demais.
- **Correção:** Botão reduzido: `rounded-lg`, `px-3 py-1.5`, `text-xs` (em vez de `rounded-xl`, `px-4 py-3`, `text-sm`).
- **Lição:** Sempre tratar dados opcionais ou vindos de payload externo com fallbacks de exibição (—, n/a) e filtrar entradas vazias para não mostrar blocos sem informação útil.

---

### 2.8 Versões

- **Agente (package pfSense):** Definida em `packages/pfsense-package/Makefile` (`PORTVERSION`) e em `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc` (`SYSTEMUP_MONITOR_AGENT_VERSION`). Alterar **os dois** em conjunto. Versão atual relevante para interfaces e fallback: **0.2.21**.
- **Frontend (painel):** `apps/web/package.json` → campo `version`; exibido no rodapé. Após alterações de build, fazer rebuild e `docker compose up -d --build` para o usuário ver a versão correta (ex.: 0.1.19).
- **Documentação de versões e release:** `docs/DIRETRIZES-E-FUNCIONAMENTO.md`, `docs/RELEASE-PACKAGE-PFSENSE-AUTOMATICO.md`.

---

## 3. Erros a não repetir (resumo)

| Situação | O que evitar | O que fazer |
|----------|-----------------------------|-------------|
| Redirect em Server Action | Tratar `redirect()` como erro e mostrar "NEXT_REDIRECT" ao usuário | Usar `rethrowIfRedirectError(error)` no catch |
| Serviço “sem clientes” (ex.: OpenVPN) | Considerar como falha e degradar o node | Tratar como ok quando mensagem indicar “no clients” / “0 clients” |
| Serviço desativado pelo cliente | Alertar como se fosse falha | Usar status `not_installed` e não degradar |
| IPsec Phase 1 desativada na UI | Mostrar como erro (vermelho) | Ler `<disabled/>` no config e enviar `not_installed`; exibir cinza |
| Agente sem `swanctl` no PATH | Assumir que comando existe no PATH padrão | Incluir `/usr/local/sbin` no PATH do agente (loop e rc.d) |
| Lista de interfaces vazia no config | Enviar `interfaces: []` e deixar chips vazios no painel | Fallback no agente: LAN + WAN a partir de mgmt_ip/wan_ip (0.2.21) |
| Chips de interface no frontend | Renderizar `name`/`ip` sem fallback | Usar "—" e "n/a", e filtrar itens totalmente vazios |
| Cadastro de node | Exigir hostname/IPs no formulário | Deixar opcionais; gerar node_uid e preencher no primeiro heartbeat |
| Versão do frontend desatualizada | Esquecer de dar build/deploy após mudança | Bump em `package.json` + `npm run build` + `docker compose up -d --build` |

---

## 4. Referências cruzadas

- **Monitoramento por túnel e interfaces:** `docs/MONITORAMENTO-POR-TUNEL-VPN.md`
- **Versões, release e config do agente:** `docs/DIRETRIZES-E-FUNCIONAMENTO.md`
- **Segurança e comandos servidor→agente:** `docs/SEGURANCA-E-MODELO-DE-AMEACAS.md`, `docs/IDEIAS-DE-FUNCOES.md`
- **Estado do projeto e retomada:** `LEITURA-INICIAL.md`, `00_inicio.md`, `00-README.md`
- **RBAC (encerrado):** `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md`, `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md`
