# Diagnóstico — Cadastro de firewalls e geração de comandos (2026-03-14)

## Objetivo

Registro técnico do estado atual do módulo de cadastro (cliente, site, firewall), da geração do comando de instalação no pfSense e dos pontos que precisam de ajuste para acabamento operacional, sem regressão.

---

## 1. Onde está o cadastro de firewall

- **Frontend:** `apps/web/app/admin/page.tsx`
  - Seção "Novo firewall" (formulário com `createNodeAction`).
  - Campos enviados: `site_id`, `hostname`, `display_name`, `management_ip`, `wan_ip`, `pfsense_version`, `maintenance_mode` (checkbox).
- **Backend:** `apps/api/src/admin/admin.controller.ts` — `POST /api/v1/admin/clients`, `POST /api/v1/admin/sites`, `POST /api/v1/admin/nodes`.
- **Serviço:** `apps/api/src/admin/admin.service.ts` — `createClient`, `createSite`, `createNode`.
- **Após criar node:** o frontend redireciona para `/nodes/{id}?created=1` (detalhe do firewall).

---

## 2. Onde o sistema monta os dados do firewall

- **Criação:** `admin.service.ts` — `createNode`:
  - `node_uid`: gerado por `buildUniqueNodeUid(dto.node_uid || hostname || display_name || 'firewall')`. O formulário **não** envia `node_uid`, então na prática vem do **hostname** (slugificado).
  - Credencial ativa criada em seguida (secret, hint, hash).
- **Leitura:** `nodes.service.ts` — detalhe do node; `getNodeBootstrapCommand` no admin.service para bootstrap/comando.
- **Bootstrap command:** `admin.service.ts` — `getBootstrapCommand(nodeId, releaseBaseUrlOverride?, controllerUrlOverride?)`. Monta URLs do release, `command` (agente legado) e `package_command` (pacote pfSense one-shot) usando credencial ativa, `node.site.client.code` e config (packageRelease.version, packageRelease.sha256, packageRelease.repoRawBase).

---

## 3. Onde é feita a geração dos comandos

- **Backend:** `admin.service.ts` — `getBootstrapCommand`:
  - `command`: agente legado (artifactUrl/checksumUrl/installerUrl a partir de `releaseBaseUrl`); só preenchido se `releaseBaseUrl` estiver configurado.
  - `package_command`: quando `appConfig.packageRelease.version`, `packageRelease.sha256` e `packageRelease.repoRawBase` estão definidos (ex.: via `PACKAGE_RELEASE_VERSION`, `PACKAGE_RELEASE_SHA256`, `PACKAGE_RELEASE_REPO_RAW_BASE` no `.env.api`). Formato: `fetch` do script + `nohup /tmp/install-from-release.sh ... & echo '...'`.
- **Frontend:** `apps/web/app/nodes/[id]/page.tsx` chama `getNodeBootstrapCommand(id, releaseBaseUrl, controllerUrl)` (query params para override). Exibe `bootstrap.package_command ?? bootstrap.command` em um único bloco "Cole este comando em Diagnostics > Command Prompt".
- **Rota /bootstrap:** `apps/web/app/bootstrap/page.tsx` também consome bootstrap-command e exibe o mesmo comando para o node selecionado.

---

## 4. Campos/opções atuais no cadastro

### Novo cliente
- **name** (obrigatório). Código técnico gerado no backend a partir do nome (slug em maiúsculas, único).

### Novo site
- **client_id** (obrigatório), **name** (obrigatório), **city**, **state**, **timezone**, **status** (hidden active). Código técnico gerado no backend a partir do nome (por cliente, único).

### Novo firewall
- **site_id** (obrigatório), **hostname** (obrigatório), **display_name**, **management_ip**, **wan_ip**, **pfsense_version**, **maintenance_mode** (checkbox).
- **node_uid:** não aparece no formulário; gerado no backend a partir de hostname (slug único).

### Edição (clientes/sites)
- Em "Editar clientes": **name**, **code** (editável), **status**.
- Em "Editar sites": **name**, **code** (editável), **city**, **state**, **timezone**, **status**.

### Edição (node)
- Na página do firewall: **hostname**, **display_name**, **management_ip**, **wan_ip**, **pfsense_version**, **agent_version**, **ha_role**. Alterar hostname **não** altera `node_uid` (já persistido).

---

## 5. Redundâncias / duplicações identificadas

- **Cliente/Site:** no **create** o código é automático e não é exibido; na **edição** o campo **code** é editável. Risco: dois clientes/sites podem acabar com o mesmo código se alguém alterar manualmente, ou códigos podem divergir da convenção (ex.: nome "Amazon Xxe" → "AMAZON-XXE"; editar code para "AMAZON" pode colidir com outro).
- **Node:** não há campo `node_uid` no create nem na edição; é gerado uma vez. Sem redundância de identificador.
- **Node — muitos campos opcionais:** display_name, management_ip, wan_ip, pfsense_version, agent_version, ha_role podem deixar o formulário “pesado” ou confuso; a maioria é preenchida/atualizada pelo agente ou é apenas metadado. Não é duplicação de dado, mas possível poluição operacional.
- **Dois “comandos”:** a API retorna `command` (agente legado) e `package_command` (pacote). O frontend usa `package_command ?? command`. Se apenas um estiver configurado, não há duplicidade na tela; a prioridade está correta.

---

## 6. Documentação atual — lacunas

- **INSTALACAO-AGENTE-PFSENSE.md:** descreve procedimento e geração do comando no painel; está alinhado ao fluxo real. Poderia ser reforçado com: onde exatamente copiar (URL da página), que o comando aparece após criar firewall e após rotacionar secret, e referência aos comandos de teste.
- **COMANDO-ATUALIZAR-PACKAGE-PFSENSE.md:** foca no servidor (`generate-install-command.sh`) e formato do comando; não descreve o fluxo “novo firewall → painel → comando na tela”.
- **Cadastro:** não existe um único doc que descreva objetivo do módulo, fluxo completo (cliente → site → firewall), finalidade de cada campo e como isso alimenta o comando. Falta também: “comandos de teste no pfSense” centralizados e “cuidados para evitar duplicidade” (ex.: não editar code sem necessidade; não cadastrar o mesmo firewall duas vezes).

---

## 7. Fluxo atual de cadastro (resumido)

1. Admin acessa `/admin`.
2. (Opcional) Criar cliente → nome → backend gera `code` → cliente criado.
3. (Opcional) Criar site → cliente + nome (+ city, state, timezone) → backend gera `code` → site criado.
4. Criar firewall → site + hostname (+ display_name, IPs, versão, maintenance) → backend gera `node_uid` (do hostname), cria credencial → redirect para `/nodes/{id}?created=1`.
5. Na página do firewall: seção “Instalar agente” com node_uid, secret (ou hint), e **comando único** (package_command ou command). Instruções curtas já existem (Diagnostics > Command Prompt; 1–2 min; tail -f /tmp/monitor-install.log).
6. Bloco “Verificação rápida” mostra `verification.command_block`: comandos pós-instalação (status, print-config, test-connection, heartbeat, tail do log).

---

## 8. Fluxo atual de geração de comando

1. Frontend (detalhe do node ou /bootstrap) chama `GET /api/v1/admin/nodes/:id/bootstrap-command` (opcional: `?release_base_url=...&controller_url=...`).
2. Backend carrega node + site + client + credencial ativa; lê `appConfig.packageRelease` e `appConfig.agentBootstrap.releaseBaseUrl`.
3. Se packageRelease (version, sha256, repoRawBase) estiver configurado: monta `package_command` (fetch do install-from-release.sh + nohup com --release-url, --sha256, --controller-url, --node-uid, --node-secret, --customer-code). Caso contrário, `package_command` é null.
4. Se houver `releaseBaseUrl` (override ou config): monta `command` (agente legado). Caso contrário, `command` é null.
5. Resposta inclui também `verification.post_install_steps` (lista) e `verification.command_block` (mesmos comandos em texto, um por linha).
6. Frontend exibe o comando em um único bloco; instruções abaixo; “Verificação rápida” com o command_block. Comandos de “Pre-check no pfSense” (versão, drill, fetch) estão na seção avançada.

---

## 9. Riscos de alteração

- **Backend:** alterar contrato de `getBootstrapCommand` ou formato do comando pode quebrar o painel ou scripts que consomem a API. Manter compatibilidade: mesmo conjunto de campos e mesma forma do comando one-shot.
- **Frontend:** alterar estrutura da página do node ou da rota /bootstrap pode afetar fluxo operacional. Mudanças apenas na **organização** dos blocos (comando principal vs comandos de teste vs instruções) e na **texto** das labels são de baixo risco.
- **Cadastro:** remover ou tornar read-only campos de edição (ex.: code em cliente/site) pode impactar quem já depende da edição manual. Qualquer mudança deve ser documentada e, se possível, feita em etapa posterior com plano de migração.

---

## 10. Pontos que precisam de ajuste

1. **Documentação:** um único documento operacional que cubra: objetivo do cadastro, fluxo cliente → site → firewall, campos e finalidade, como o comando é gerado, onde copiar/colar no pfSense, comandos de teste/validação, limitações, segurança, como evitar duplicidade.
2. **Tela do firewall:** separar claramente na UI: (a) comando principal de instalação, (b) comandos de teste/validação no pfSense (pré-instalação, pós-instalação, diagnóstico), (c) instruções curtas por bloco (onde colar, o que validar).
3. **Comandos de teste:** hoje “Verificação rápida” mostra apenas os passos pós-instalação (status, print-config, test-connection, heartbeat, tail). Incluir também: pré-check (versão, DNS, fetch healthz/installer) em bloco nomeado; descrição e interpretação esperada por comando.
4. **Copiar comando:** considerar botão “Copiar” ao lado do comando principal para reduzir erro operacional.
5. **Duplicação de cadastro:** documentar plano para: (a) códigos cliente/site (edição vs auto); (b) simplificação de campos do node (quais são essenciais no create vs apenas exibição/edição avançada). Implementar apenas o que for seguro nesta rodada; o restante fica como análise e plano.

---

## 11. Conclusão do diagnóstico

- O fluxo de cadastro e a geração do comando estão corretos e em uso; o comando one-shot (package_command) é exibido na página do firewall e após rotacionar secret.
- Principais melhorias sem regressão: (1) documentação única e alinhada ao comportamento real; (2) organização da tela em “comando principal”, “comandos de teste” e “instruções”; (3) comandos de teste explícitos com descrição/interpretação; (4) plano seguro para duplicação/redundância de campos, com implementação conservadora.

Este arquivo serve como base para as etapas seguintes (documentação, ajustes de tela, análise de duplicação e plano de correção).
