# 125 - Plano pfREST: gerenciamento centralizado de pfSense

Data: `2026-07-02`

Status: **planejado**

Escopo: plano pos-117 para evoluir o Monitor-Pfsense de monitoramento para **gerenciamento centralizado e seguro de muitos firewalls pfSense** usando o pacote `pfrest/pfSense-pkg-RESTAPI`.

Base atual do produto: API `0.6.4`, painel `1.4.5`, package pfSense `0.4.7`.

Plano anterior obrigatorio: `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md`.

Fontes tecnicas consultadas:

- Site oficial da documentacao pfREST: https://pfrest.org/
- Repositorio: https://github.com/pfrest/pfSense-pkg-RESTAPI
- Autenticacao e autorizacao: https://pfrest.org/AUTHENTICATION_AND_AUTHORIZATION/
- Seguranca de acesso: https://pfrest.org/SECURING_API_ACCESS/
- Swagger/OpenAPI: https://pfrest.org/SWAGGER_AND_OPENAPI/
- Referencia API publica: https://pfrest.org/api-docs/
- OpenAPI publico consultado: https://pfrest.org/api-docs/openapi.json

## Resumo executivo

O Monitor-Pfsense ja tem uma boa base para inventario, autenticacao, RBAC, escopo por cliente, tags/grupos, criticidade, dashboard de frota, notificacoes, backup/diff/drift e package/agente. O pfREST abre uma trilha nova: ler e, depois, operar configuracoes reais dos firewalls de forma centralizada.

Essa evolucao deve ser tratada como **gerenciamento de infraestrutura critica**, nao como uma simples integracao HTTP. O plano abaixo prioriza:

- leitura antes de escrita;
- credenciais dedicadas e privilegios minimos por modulo;
- operacao por frota, cliente, grupo, tag e criticidade;
- preview, diff, backup, aprovacao, janela de mudanca e canario antes de aplicar;
- auditoria completa de quem mudou, onde, quando, o que era antes, o que foi proposto e qual foi o resultado;
- nenhuma mudanca ampla em regras, NAT, VPN, interfaces ou acesso remoto sem fundacao nova.

Este plano nao substitui o plano 117. Ele deve entrar **depois** das fundacoes do 117 estarem estaveis, especialmente jobs/comandos, capacidades/vault, backup avancado, RBAC e observabilidade.

## Verdades tecnicas sobre o pfREST

Pontos que devem guiar a implementacao:

- O pfREST e um pacote comunitario e nao oficial da Netgate/pfSense.
- A documentacao atual e aplicavel ao REST API v2 ou superior.
- O projeto expoe mais de 200 endpoints REST, alem de GraphQL.
- O OpenAPI publico consultado reporta a API como `v2.8.2`.
- A API cobre areas como autenticacao, diagnosticos, firewall, interfaces, roteamento, servicos, status, sistema, usuarios e VPN.
- A autenticacao pode usar Basic, API Key ou JWT.
- Para integracao de sistema, API Key e o caminho preferencial, desde que gerada por usuario dedicado e com privilegios minimos.
- As API keys herdam os privilegios do usuario que as gerou.
- O pfREST usa privilegios por endpoint/metodo, integrados ao modelo de privilegios do pfSense.
- Acesso deve ser restringido por interface, rede de gerencia/VPN, HTTPS e allowlist.
- A API mexe em configuracao critica. Chamadas de escrita precisam ser serializadas por firewall e protegidas contra concorrencia.
- A propria documentacao alerta que o `config.xml` do pfSense nao foi desenhado para concorrencia alta; portanto, o produto deve evitar operacoes paralelas no mesmo firewall.

## Objetivo de produto

Transformar o Monitor-Pfsense em uma central de trabalho para administradores que cuidam de muitos pfSense:

- saber quais firewalls possuem pfREST instalado;
- saber versao, autenticacao disponivel, endpoints permitidos e capacidade real por firewall;
- enxergar configuracoes importantes de muitos firewalls no mesmo lugar;
- comparar configuracao real contra padroes desejados;
- detectar drift e inconsistencias entre unidades;
- aplicar pequenas mudancas padronizadas com seguranca;
- operar por cliente, grupo, tag, criticidade, versao de pfSense, versao do package e janela de manutencao;
- manter historico e evidencias de cada mudanca.

## Relacao com o plano 117

Este plano depende, no minimo, das seguintes frentes do 117:

- Fase 3: organizacao da frota por tags, grupos e criticidade.
- Fase 5: backup avancado, diff e drift.
- Fase 7: jobs/comandos e controle de execucao.
- Fase 10: capacidades, vault e piloto pfREST read-only/aliases.
- Fase 11: auditoria final e documentacao de operacao.

Regra: qualquer fase deste plano que precise de escrita remota so pode iniciar depois de existir:

- backup recente e verificavel do firewall alvo;
- fila de jobs por firewall com trava de concorrencia;
- auditoria persistida;
- RBAC especifico da funcao;
- feature flag desligada por padrao;
- rollback assistido documentado.

## Principios de seguranca

1. **Read-only primeiro**
   Toda area pfREST comeca lendo estado real. A escrita so entra depois de inventario, diff, UI, logs e testes.

2. **Sem credencial compartilhada**
   Cada firewall deve ter credencial/API key propria. Evitar chave unica de frota.

3. **Usuario dedicado por perfil**
   Usar usuario pfSense especifico para a API. Criar perfis por capacidade quando fizer sentido: leitura, aliases, regras, NAT, DNS/DHCP, VPN, certificados.

4. **Privilegio minimo**
   Nao usar `WebCfg - All pages` para operacao normal. Usar privilegios especificos por endpoint/metodo.

5. **API nao publica**
   pfREST deve ficar acessivel apenas por rede de gerencia, VPN, tunnel confiavel ou agente intermediario. Nao expor pfREST diretamente na internet.

6. **Agente intermediario quando necessario**
   Se o controlador nao alcanca o pfSense diretamente, usar o agente/package como executor controlado, mantendo modelo pull/poll quando possivel.

7. **Serializacao por firewall**
   Nunca executar duas escritas pfREST ao mesmo tempo no mesmo firewall.

8. **Backup antes de escrita**
   Antes de qualquer alteracao, exigir backup `config.xml` recente ou gerar um novo backup.

9. **Preview obrigatorio**
   Toda mudanca deve exibir diff e impacto esperado antes da aplicacao.

10. **Aplicacao explicita**
    Criar objetos pode nao bastar. Quando a area exigir apply/reload, a UI deve deixar claro se a mudanca esta pendente ou aplicada.

11. **Canario antes de lote**
    Mudancas em lote comecam em 1 firewall, depois pequena amostra, depois grupo completo.

12. **Gerenciar objetos adotados**
    O sistema deve priorizar objetos que ele criou ou adotou explicitamente. Evitar reescrever configuracao manual existente sem confirmacao.

13. **Auditoria imutavel**
    Registrar solicitante, aprovador, executor, payload sanitizado, diff, resultado, erro, horario e firewalls afetados.

## Modos de acesso suportados

### Modo A - Direto por rede de gerencia

O controlador acessa `https://firewall/api/v2/...` via rede interna, VPN ou rota de gerencia.

Uso indicado:

- ambientes onde a central tem acesso IP aos firewalls;
- inventario read-only;
- consultas de status e configuracao;
- escrita controlada em horarios de manutencao.

Requisitos:

- TLS valido ou politica explicita de CA interna;
- allowlist de origem no pfREST;
- secrets em vault;
- timeouts e retries conservadores;
- trava por firewall.

### Modo B - Mediado pelo agente/package

O controlador cria um job. O package no pfSense executa localmente chamadas pfREST ou operacoes equivalentes e retorna resultado.

Uso indicado:

- firewalls atras de NAT;
- cenarios sem acesso inbound ao pfSense;
- padrao atual de agente com heartbeats;
- operacoes que precisam manter a central isolada da rede do cliente.

Requisitos:

- fila de jobs assinada/validada;
- allowlist de comandos;
- payload pequeno e validado;
- execucao idempotente;
- logs locais e remotos.

### Modo C - Assistido/manual

O sistema gera checklist, comandos, exportacao ou patch, mas o operador aplica manualmente no pfSense.

Uso indicado:

- firewalls muito criticos;
- mudancas de interfaces, WAN/LAN, VPN principal ou acesso de gerencia;
- locais sem pfREST instalado;
- fase inicial de adocao.

## Novas areas de interface

Tudo que for novo precisa aparecer e funcionar no painel. A recomendacao e criar uma area principal:

- rota: `/gerenciamento` ou `/pfrest`;
- menu: **Gerenciamento pfSense**;
- tab no detalhe do firewall: **Gestao pfREST**.

Subareas sugeridas:

- `/gerenciamento/capacidades`
- `/gerenciamento/inventario`
- `/gerenciamento/aliases`
- `/gerenciamento/regras`
- `/gerenciamento/nat`
- `/gerenciamento/dns-dhcp`
- `/gerenciamento/vpn`
- `/gerenciamento/certificados`
- `/gerenciamento/templates`
- `/gerenciamento/mudancas`
- `/gerenciamento/auditoria`

O detalhe do firewall deve mostrar:

- pfREST instalado: sim/nao/desconhecido;
- versao pfREST;
- modo de acesso: direto, agente ou manual;
- autenticacao configurada;
- ultima leitura bem-sucedida;
- endpoints permitidos;
- privilegios insuficientes;
- pendencias de apply;
- ultima mudanca feita pelo sistema;
- ultimo backup antes de mudanca.

## Modelo conceitual de dados

Tabelas ou colecoes sugeridas. Os nomes podem ser ajustados ao padrao real do projeto.

### `pfrest_capabilities`

Mapa por node/firewall:

- `node_id`
- `pfrest_enabled`
- `pfrest_version`
- `api_base_url`
- `access_mode`
- `auth_method`
- `last_probe_at`
- `last_success_at`
- `last_error`
- `supported_tags`
- `allowed_endpoints`
- `denied_endpoints`
- `write_enabled`
- `managed_modules`

### `pfrest_credentials`

Secrets nao devem ficar em texto puro no banco comum. Esta entidade deve guardar somente metadados e referencia ao vault:

- `node_id`
- `secret_ref`
- `auth_method`
- `created_by`
- `rotated_at`
- `expires_at`
- `status`
- `scope_description`

### `pfrest_inventory_snapshots`

Snapshots de leitura:

- `node_id`
- `snapshot_type`
- `collected_at`
- `source_version`
- `hash`
- `summary_json`
- `raw_ref`

Tipos iniciais:

- `system_status`
- `interfaces`
- `gateways`
- `aliases`
- `firewall_rules`
- `nat_rules`
- `dns_resolver`
- `dns_forwarder`
- `dhcp_server`
- `certificates`
- `vpn_ipsec`
- `vpn_openvpn`
- `vpn_wireguard`
- `services`

### `pfrest_managed_objects`

Objetos criados ou adotados pelo sistema:

- `node_id`
- `module`
- `object_type`
- `remote_id`
- `name`
- `description`
- `managed_state`
- `desired_hash`
- `last_seen_hash`
- `drift_status`
- `adopted_at`
- `created_by_change_id`

### `pfrest_change_batches`

Mudancas em lote:

- `batch_id`
- `title`
- `module`
- `target_selector`
- `status`
- `requested_by`
- `approved_by`
- `created_at`
- `scheduled_window`
- `canary_policy`
- `backup_policy`
- `rollback_notes`

### `pfrest_change_items`

Uma linha por firewall afetado:

- `batch_id`
- `node_id`
- `status`
- `preview_diff_ref`
- `backup_id`
- `started_at`
- `finished_at`
- `result_summary`
- `error_message`
- `apply_required`
- `apply_result`

## RBAC sugerido

Permissoes novas a mapear no RBAC existente:

- `pfrest.view`
- `pfrest.credentials.manage`
- `pfrest.capabilities.refresh`
- `pfrest.inventory.view`
- `pfrest.inventory.refresh`
- `pfrest.alias.view`
- `pfrest.alias.manage`
- `pfrest.alias.apply`
- `pfrest.firewall_rules.view`
- `pfrest.firewall_rules.manage`
- `pfrest.firewall_rules.apply`
- `pfrest.nat.view`
- `pfrest.nat.manage`
- `pfrest.nat.apply`
- `pfrest.dns_dhcp.view`
- `pfrest.dns_dhcp.manage`
- `pfrest.dns_dhcp.apply`
- `pfrest.vpn.view`
- `pfrest.vpn.manage_assisted`
- `pfrest.certificates.view`
- `pfrest.certificates.manage`
- `pfrest.services.view`
- `pfrest.services.restart_assisted`
- `pfrest.change.request`
- `pfrest.change.approve`
- `pfrest.change.execute`
- `pfrest.change.cancel`
- `pfrest.change.rollback_assist`
- `pfrest.audit.view`

Regra operacional:

- operadores comuns podem ler inventario e solicitar mudancas;
- administradores de cliente podem aprovar dentro do proprio escopo;
- operadores globais podem executar lotes multi-cliente somente com RBAC global;
- mudancas criticas exigem segunda aprovacao.

## Feature flags

Todas desligadas por padrao em producao:

- `PFREST_ENABLED=false`
- `PFREST_DIRECT_ACCESS_ENABLED=false`
- `PFREST_AGENT_MEDIATED_ENABLED=false`
- `PFREST_WRITE_ENABLED=false`
- `PFREST_ALIAS_WRITE_ENABLED=false`
- `PFREST_FIREWALL_RULE_WRITE_ENABLED=false`
- `PFREST_NAT_WRITE_ENABLED=false`
- `PFREST_DNS_DHCP_WRITE_ENABLED=false`
- `PFREST_VPN_WRITE_ENABLED=false`
- `PFREST_CERTIFICATE_WRITE_ENABLED=false`
- `PFREST_CRITICAL_WRITE_ENABLED=false`
- `PFREST_BULK_CHANGE_ENABLED=false`
- `PFREST_REQUIRE_BACKUP_BEFORE_WRITE=true`
- `PFREST_REQUIRE_APPROVAL=true`
- `PFREST_MAX_CONCURRENT_FIREWALL_WRITES=1`
- `PFREST_MAX_BATCH_SIZE=10`

## Fase 0 - Laboratorio pfREST e matriz de suporte

Status: [ ] nao iniciada

Objetivo: validar pfREST em ambiente controlado antes de modelar produto.

Entregas:

- lab com pelo menos 1 pfSense CE e, se existir na frota, 1 pfSense Plus;
- instalar pfREST pelo caminho oficial;
- confirmar versao pfREST e endpoints disponiveis;
- testar API Key com usuario dedicado;
- testar usuario read-only com privilegio de negacao de escrita;
- testar endpoints de status, sistema, aliases e regras em read-only;
- validar comportamento de erros: 401, 403, 404, timeout, TLS invalido, endpoint sem privilegio;
- documentar matriz de versoes suportadas.

Frontend:

- nenhum painel definitivo ainda;
- pode existir tela interna experimental atras de feature flag.

Back-end:

- cliente pfREST isolado, sem acoplamento direto ao fluxo de heartbeat;
- timeouts baixos;
- retries conservadores;
- mascaramento de secrets em logs.

Guardrails:

- proibido escrita em producao;
- proibido armazenar API key em texto puro;
- proibido executar endpoint arbitrario pela UI.

Criterios de saida:

- documento de laboratorio criado;
- endpoint read-only testado;
- riscos conhecidos registrados;
- decisao sobre acesso direto, mediado por agente ou ambos.

## Fase 1 - Cadastro de capacidades pfREST por firewall

Status: [ ] nao iniciada

Objetivo: descobrir e registrar quais firewalls podem ser gerenciados via pfREST.

Entregas:

- modelo `pfrest_capabilities`;
- job `probe_pfrest_capabilities`;
- cadastro do modo de acesso por firewall;
- validacao de URL/base path;
- teste de conectividade;
- teste de autenticacao;
- leitura de versao pfREST;
- leitura de settings do pfREST quando permitido;
- classificacao de capacidades por modulo.

Frontend:

- em `/nodes`, indicar status pfREST: `nao configurado`, `ok`, `falha`, `sem privilegio`, `versao nao suportada`;
- no detalhe do firewall, tab **Gestao pfREST** com dados da capacidade;
- em `/gerenciamento/capacidades`, tabela de frota com filtros por cliente, grupo, tag, criticidade, versao e status.

Back-end:

- API para listar capacidades;
- API para disparar probe em 1 firewall;
- API para disparar probe em grupo com limite de concorrencia;
- logs de resultado por tentativa.

Guardrails:

- probe nao pode escrever configuracao;
- nao executar em massa sem limite;
- nao considerar falha transitoria como remocao de capacidade.

Criterios de saida:

- operador consegue ver quais firewalls estao prontos para pfREST;
- erros de credencial, rede e privilegio ficam claros;
- nenhum fluxo de monitoramento existente foi alterado.

## Fase 2 - Vault, credenciais e rotacao

Status: [ ] nao iniciada

Objetivo: permitir credenciais pfREST seguras por firewall.

Entregas:

- integracao com mecanismo de vault definido no 117;
- cadastro de API key por node;
- metadados de segredo sem expor o valor;
- teste de credencial;
- rotacao assistida;
- revogacao assistida;
- trilha de auditoria de quem cadastrou, testou, rotacionou ou removeu.

Frontend:

- formulario de credencial na tab **Gestao pfREST**;
- botao **Testar acesso**;
- botao **Rotacionar** somente quando houver fluxo seguro;
- exibicao de `secret_ref`, status, validade e ultima verificacao;
- nunca mostrar secret completo depois de salvo.

Back-end:

- API de cadastro usando secret write-only;
- API de teste com resposta sanitizada;
- mascaramento em logs e auditoria;
- permissao `pfrest.credentials.manage`.

Guardrails:

- bloquear credencial global unica;
- bloquear Basic em producao salvo excecao documentada;
- preferir API key;
- nao logar headers `X-API-Key` ou `Authorization`.

Criterios de saida:

- credenciais podem ser salvas, testadas e removidas sem vazamento;
- usuario sem permissao nao ve nem altera credenciais;
- smoke de seguranca cobre mascaramento.

## Fase 3 - Inventario read-only de configuracao

Status: [ ] nao iniciada

Objetivo: trazer para a central uma visao pesquisavel da configuracao real da frota.

Entregas iniciais:

- status do sistema;
- interfaces;
- gateways;
- servicos;
- aliases;
- regras de firewall;
- NAT;
- DNS resolver/forwarder;
- DHCP server e static mappings;
- certificados;
- VPN IPsec/OpenVPN/WireGuard em leitura;
- logs/status essenciais quando seguro.

Frontend:

- `/gerenciamento/inventario` com busca global por IP, host, alias, regra, porta, interface, gateway e certificado;
- filtros por cliente, tag, grupo, criticidade e modulo;
- detalhe por firewall com abas de configuracao;
- comparacao lado a lado entre firewalls selecionados;
- exportacao CSV/JSON de inventario filtrado.

Back-end:

- jobs de coleta por modulo;
- snapshots versionados;
- hashes para detectar mudanca;
- normalizacao de campos principais;
- retencao configuravel.

Guardrails:

- coletar somente campos necessarios para operacao;
- mascarar secrets, chaves privadas, tokens e senhas;
- nao armazenar dumps brutos sensiveis sem criptografia;
- limitar coleta de logs para evitar dados pessoais ou volumetria excessiva.

Criterios de saida:

- operador consegue responder rapidamente: "onde esta este IP?", "qual firewall usa esta porta?", "quais regras existem para este destino?";
- snapshot nao afeta o desempenho dos firewalls;
- inventario funciona mesmo quando alguns nodes falham.

## Fase 4 - Diff, drift e compliance operacional

Status: [ ] nao iniciada

Objetivo: mostrar diferencas entre configuracao real, ultima leitura e padroes desejados.

Entregas:

- diff entre snapshots do mesmo firewall;
- diff entre firewalls semelhantes;
- templates/padroes por cliente/grupo;
- regras de compliance:
  - pfREST habilitado somente em interfaces permitidas;
  - autenticacao forte;
  - login protection ativo;
  - DNS/NTP padrao;
  - gateways esperados;
  - aliases obrigatorios;
  - certificados proximos do vencimento;
  - servicos inesperados habilitados;
- alertas/notificacoes para drift critico.

Frontend:

- `/gerenciamento/templates`;
- `/gerenciamento/inventario/drift`;
- badges de compliance em `/nodes`;
- detalhe com diff legivel e historico.

Back-end:

- motor de politicas simples e auditable;
- regras versionadas;
- execucao agendada;
- associacao de politica a cliente/grupo/tag.

Guardrails:

- compliance inicialmente apenas informativo;
- nao corrigir drift automaticamente;
- permitir justificativa/aceite de excecao com vencimento.

Criterios de saida:

- sistema aponta divergencias sem alterar firewall;
- operador consegue aceitar excecao ou abrir mudanca assistida;
- alertas nao geram ruido excessivo.

## Fase 5 - Aliases centralizados

Status: [ ] nao iniciada

Objetivo: primeira escrita segura via pfREST, usando um modulo de baixo risco relativo e alto valor operacional.

Capacidades:

- listar aliases por firewall;
- criar alias gerenciado;
- editar alias gerenciado;
- remover alias gerenciado;
- adotar alias existente;
- aplicar alteracoes quando necessario;
- replicar alias para grupo de firewalls;
- detectar drift em alias gerenciado.

Frontend:

- `/gerenciamento/aliases`;
- lista por nome, tipo, conteudo, firewalls, cliente, tags e drift;
- editor com preview de impacto;
- assistente de replicacao;
- status por firewall no lote.

Back-end:

- suporte aos endpoints pfREST de firewall aliases;
- apply explicito quando exigido;
- change batch;
- canario obrigatorio para lote;
- backup antes de escrita.

Guardrails:

- nao editar alias nao gerenciado sem adocao explicita;
- validar IPs, redes, portas e FQDNs;
- bloquear alias com tamanho ou tipo nao suportado;
- exigir aprovacao para lote multi-firewall;
- serializar escrita por firewall.

Criterios de saida:

- alias pode ser criado em 1 firewall de teste;
- alias pode ser replicado em lote pequeno;
- drift aparece no painel;
- auditoria mostra diff antes/depois;
- rollback assistido documentado.

## Fase 6 - Central de mudancas em lote

Status: [ ] nao iniciada

Objetivo: criar a fundacao comum para qualquer mudanca multi-firewall.

Entregas:

- change batch com estados:
  - rascunho;
  - preview;
  - aguardando aprovacao;
  - agendado;
  - executando canario;
  - aguardando continuidade;
  - executando lote;
  - concluido;
  - parcial;
  - falhou;
  - cancelado;
- seletores por cliente, grupo, tag, criticidade, versao e capacidade;
- politica de canario;
- janela de manutencao;
- pausa automatica apos erro;
- relatorio final por firewall.

Frontend:

- `/gerenciamento/mudancas`;
- wizard de criacao;
- tela de aprovacao;
- timeline de execucao;
- painel de resultados;
- botao de cancelar antes da execucao;
- botao de pausar lote.

Back-end:

- fila de jobs;
- travas por node;
- idempotencia;
- scheduler;
- auditoria;
- notificacoes integradas.

Guardrails:

- mudanca em lote nunca pula preview;
- lote grande exige canario;
- falha no canario bloqueia o restante;
- aplicar em firewall critico exige aprovacao adicional.

Criterios de saida:

- aliases usam a central de mudancas;
- operador consegue acompanhar execucao sem olhar logs;
- falhas parciais ficam claras e recuperaveis.

## Fase 7 - Regras de firewall e NAT

Status: [ ] nao iniciada

Objetivo: permitir administracao assistida de regras e NAT, sem reescrever politica inteira do firewall.

Capacidades seguras iniciais:

- inventario e busca de regras;
- detectar regra duplicada ou inconsistente;
- criar regra nova gerenciada em posicao controlada;
- desabilitar regra gerenciada;
- alterar descricao de regra gerenciada;
- criar NAT gerenciado simples;
- aplicar alteracao com preview e backup.

Capacidades adiadas:

- reorder amplo de regras;
- edicao de regras legadas nao gerenciadas;
- remocao em massa;
- NAT complexo sem modelo claro;
- alteracao automatica em WAN/LAN critica.

Frontend:

- `/gerenciamento/regras`;
- `/gerenciamento/nat`;
- visualizacao por firewall e por frota;
- filtros por interface, origem, destino, porta, protocolo, acao e descricao;
- editor de regra com validacao;
- diff antes/depois;
- aviso de impacto.

Back-end:

- endpoints pfREST de firewall rules, NAT e apply;
- modelo de objeto gerenciado;
- validadores fortes;
- execucao por change batch.

Guardrails:

- criar regra apenas em ancora definida;
- exigir descricao padronizada;
- exigir tag/metadata de gerencia quando possivel;
- bloquear edicao de regra nao gerenciada sem adocao;
- bloquear qualquer mudanca que possa cortar acesso de gerencia sem aprovacao critica.

Criterios de saida:

- regra simples gerenciada criada e aplicada em ambiente piloto;
- NAT simples gerenciado criado e aplicado em ambiente piloto;
- falha de apply nao deixa UI em estado falso;
- rollback assistido validado.

## Fase 8 - DNS e DHCP

Status: [ ] nao iniciada

Objetivo: organizar servicos recorrentes de DNS/DHCP em muitas unidades.

Capacidades:

- inventario de DNS resolver/forwarder;
- inventario de DHCP server;
- inventario de static mappings;
- busca global de MAC/IP/hostname;
- criacao assistida de static mapping gerenciado;
- padronizacao de DNS/NTP/domain por grupo;
- detectar conflitos de IP/MAC entre unidades.

Frontend:

- `/gerenciamento/dns-dhcp`;
- busca por hostname, IP e MAC;
- tabela de leases e mappings quando permitido;
- editor de static mapping gerenciado;
- painel de conflitos.

Back-end:

- endpoints pfREST de DHCP, DNS resolver/forwarder e apply;
- normalizacao de leases/mappings;
- validacao de escopo e conflitos.

Guardrails:

- escrita inicialmente somente em static mappings gerenciados;
- nao alterar range DHCP em lote sem decisao futura;
- nao reiniciar servico em horario comercial sem janela.

Criterios de saida:

- busca global funciona;
- static mapping piloto funciona com auditoria;
- conflitos aparecem com baixa taxa de falso positivo.

## Fase 9 - VPN em leitura e operacao assistida

Status: [ ] nao iniciada

Objetivo: dar visibilidade de VPNs e permitir acoes assistidas muito controladas.

Capacidades read-only:

- IPsec status e configuracao resumida;
- OpenVPN status e configuracao resumida;
- WireGuard status e configuracao resumida;
- peers/tunnels por cliente e firewall;
- status conectado/desconectado quando endpoint suportar;
- alerta de tunnel down por criticidade.

Capacidades assistidas futuras:

- reiniciar servico especifico em janela;
- aplicar configuracao ja pendente;
- gerar checklist de nova VPN;
- validar padrao de proposta/crypto.

Frontend:

- `/gerenciamento/vpn`;
- mapa/tabela de tunnels;
- filtros por cliente, firewall, tecnologia e status;
- detalhe com historico de queda;
- acoes assistidas somente com RBAC elevado.

Guardrails:

- nao criar VPN automaticamente na primeira fase;
- nao alterar tunnel principal de gerencia;
- nao mexer em peers de alta criticidade sem aprovacao dupla;
- qualquer apply de VPN exige backup recente.

Criterios de saida:

- operador enxerga VPNs da frota;
- alertas de status sao uteis;
- nenhuma configuracao VPN e alterada automaticamente.

## Fase 10 - Certificados, ACME e servicos

Status: [ ] nao iniciada

Objetivo: reduzir risco operacional por certificado vencido e servico inesperado.

Capacidades:

- inventario de certificados, CAs e CRLs;
- alerta de vencimento;
- associar certificado a servico quando possivel;
- inventario ACME quando pacote/endpoints existirem;
- inventario de servicos ativos;
- restart assistido de servico allowlistado.

Frontend:

- `/gerenciamento/certificados`;
- lista de certificados por vencimento;
- painel de servicos por firewall;
- acoes assistidas: restart de servico allowlistado.

Back-end:

- endpoints pfREST de system certs/CAs/CRLs;
- endpoints de servicos/status;
- politica de restart por allowlist.

Guardrails:

- nao exportar chave privada pela UI;
- nao renovar certificado automaticamente sem desenho especifico;
- restart de servico critico exige janela;
- nao reiniciar pfSense automaticamente por padrao.

Criterios de saida:

- certificados vencendo aparecem com antecedencia;
- servicos inesperados aparecem no compliance;
- restart assistido gera auditoria completa.

## Fase 11 - Relatorios e governanca

Status: [ ] nao iniciada

Objetivo: transformar dados pfREST em rotina de administracao.

Relatorios:

- firewalls sem pfREST;
- firewalls com pfREST sem API key dedicada;
- firewalls com pfREST exposto em interface indevida;
- firewalls com drift critico;
- regras/NAT criados no periodo;
- aliases replicados e divergentes;
- certificados vencendo;
- VPNs instaveis;
- mudancas por operador;
- falhas por cliente/grupo.

Frontend:

- dashboards em `/dashboard` ou nova aba **Governanca pfSense**;
- exportacao CSV/PDF quando ja houver padrao no projeto;
- filtros por periodo, cliente, grupo, tag e criticidade.

Back-end:

- agregacoes periodicas;
- armazenamento de metricas historicas;
- notificacoes de relatorio.

Guardrails:

- relatorios nao devem expor secrets;
- exportacoes respeitam escopo RBAC;
- dados sensiveis devem ser minimizados.

Criterios de saida:

- administrador consegue planejar manutencao da frota pelo painel;
- relatorios ajudam a priorizar trabalho real;
- dados batem com inventario read-only.

## Fase 12 - Consolidacao como gerenciador

Status: [ ] nao iniciada

Objetivo: revisar o produto depois das fases piloto e decidir ate onde avancar.

Entregas:

- auditoria de seguranca;
- revisao de RBAC;
- revisao de performance;
- revisao de UX;
- revisao de incidentes/falhas;
- decisao sobre modulos que podem sair de piloto;
- decisao sobre modulos que devem continuar read-only;
- documentacao operacional final;
- matriz de suporte por versao pfSense/pfREST.

Criterios de saida:

- produto tem trilha clara de suporte;
- operadores sabem o que pode e nao pode ser feito;
- riscos remanescentes estao documentados;
- proximas evolucoes tem plano proprio.

## Matriz inicial de modulos pfREST

| Modulo | Inicio recomendado | Escrita recomendada? | Observacao |
|--------|--------------------|----------------------|------------|
| Capacidades/versionamento | Fase 1 | Nao | Base para tudo |
| Status sistema/servicos | Fase 3 | Nao | Baixo risco, alto valor |
| Interfaces/gateways | Fase 3 | Nao | Escrever e critico, manter leitura |
| Aliases | Fase 5 | Sim, gradual | Melhor primeiro modulo de escrita |
| Regras firewall | Fase 7 | Sim, restrito | Apenas objetos gerenciados/adotados |
| NAT | Fase 7 | Sim, restrito | Evitar lote amplo no inicio |
| DNS/DHCP | Fase 8 | Sim, parcial | Comecar com static mappings |
| VPN | Fase 9 | Leitura primeiro | Escrita so assistida e futura |
| Certificados | Fase 10 | Parcial | Sem expor chaves privadas |
| Servicos/restart | Fase 10 | Assistido | Allowlist e janela |
| Usuarios/grupos pfSense | Futuro | Nao inicial | Alto risco e governanca propria |
| Sistema/update/package | Futuro | Nao inicial | Pode quebrar firewall, exige plano proprio |
| Command prompt | Nunca por produto | Nao | Endpoint arbitrario nao deve virar UI |

## Fluxo padrao de mudanca

Toda mudanca pfREST deve seguir o mesmo funil:

1. Operador escolhe modulo.
2. Operador escolhe alvo por firewall, cliente, grupo, tag ou criticidade.
3. Sistema filtra apenas firewalls com capacidade e privilegio suficientes.
4. Sistema gera preview.
5. Sistema valida risco e dependencias.
6. Sistema exige backup recente ou agenda backup.
7. Sistema mostra diff.
8. Operador solicita mudanca.
9. Aprovador aprova quando necessario.
10. Sistema executa canario.
11. Operador confirma continuidade quando politica exigir.
12. Sistema executa lote com limite de concorrencia.
13. Sistema aplica/recarrega quando necessario.
14. Sistema coleta estado final.
15. Sistema registra auditoria e relatorio.
16. Sistema alerta falhas e proximos passos.

## Experiencia minima de UI

Toda tela de funcao pfREST precisa responder:

- este firewall suporta a funcao?
- a credencial tem privilegio suficiente?
- qual e o estado atual?
- o que vai mudar?
- qual e o diff?
- ha backup recente?
- precisa de apply/reload?
- quem aprovou?
- qual firewall e canario?
- qual foi o resultado?
- qual e a acao de recuperacao?

Nao criar botoes de acao que apenas disparam chamadas sem explicar estado, impacto e resultado.

## Testes obrigatorios por fase

Cada fase deve incluir:

- unit tests para validadores e normalizadores;
- integration tests com cliente pfREST mockado;
- testes de RBAC;
- testes de escopo por cliente;
- testes de mascaramento de secrets;
- testes de erro e timeout;
- smoke do painel;
- smoke de API;
- teste manual documentado em homolog;
- evidencia em documento de entrega.

Para fases com escrita:

- teste de backup obrigatorio;
- teste de preview/diff;
- teste de aprovacao;
- teste de canario;
- teste de falha parcial;
- teste de idempotencia;
- teste de concorrencia por firewall;
- teste de auditoria completa.

## Go/no-go para escrita em producao

Antes de liberar qualquer escrita pfREST em producao:

- [ ] feature flag especifica ativada somente no ambiente alvo;
- [ ] RBAC validado;
- [ ] credencial dedicada por firewall;
- [ ] pfREST nao exposto publicamente;
- [ ] backup recente obrigatorio funcionando;
- [ ] diff/preview funcionando;
- [ ] apply/reload entendido por modulo;
- [ ] auditoria persistida;
- [ ] job serializado por firewall;
- [ ] rollback assistido documentado;
- [ ] piloto em firewall nao critico concluido;
- [ ] canario em pequeno grupo concluido;
- [ ] documentacao operacional atualizada.

## O que nao fazer

Mesmo com pfREST disponivel, nao implementar:

- explorador generico de endpoints pfREST pela UI;
- campo livre para operador enviar path/metodo/payload arbitrario;
- command prompt remoto;
- uso rotineiro de usuario admin com acesso total;
- API key unica para toda a frota;
- exposicao publica da API pfREST;
- alteracao automatica de interfaces WAN/LAN;
- reorder automatico amplo de regras;
- restore automatico de `config.xml`;
- mudanca automatica de VPN principal;
- reinicio/reboot automatico sem plano especifico;
- update de sistema pfSense em massa nesta trilha;
- edicao de usuarios/grupos pfSense sem plano proprio;
- aplicacao em lote sem canario;
- aplicar mudanca sem backup e sem diff.

## Ordem recomendada de execucao

1. Fase 0 em laboratorio.
2. Fase 1 capacidades.
3. Fase 2 vault/credenciais.
4. Fase 3 inventario read-only.
5. Fase 4 diff/drift/compliance.
6. Fase 5 aliases centralizados.
7. Fase 6 central de mudancas.
8. Fase 7 regras/NAT.
9. Fase 8 DNS/DHCP.
10. Fase 9 VPN read-only.
11. Fase 10 certificados/servicos.
12. Fase 11 governanca.
13. Fase 12 consolidacao.

## Prompt base para executar em chat limpo

Use este prompt para Composer 2.5, Claude ou outro agente de implementacao:

```text
Voce esta no projeto /Dados/Monitor-Pfsense.

Leia obrigatoriamente:
- AGENTS.md do workspace /Dados, se disponivel no contexto
- CORTEX.md
- LEITURA-INICIAL.md
- docs/00-INDICE-OPERACIONAL.md
- docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md
- docs/125-PLANO-PFREST-GERENCIAMENTO-CENTRALIZADO-2026-07-02.md

Objetivo desta sessao:
- executar somente a fase [INFORMAR FASE] do plano 118.

Regras obrigatorias:
- nao alterar o plano 117;
- nao implementar fases futuras;
- preservar todos os fluxos existentes do Monitor-Pfsense;
- manter feature flags desligadas por default;
- leitura pfREST antes de escrita;
- nenhuma escrita pfREST sem backup, preview, RBAC, auditoria e job serializado;
- nao criar explorador generico de endpoints;
- nao armazenar secrets em texto puro;
- nao expor API keys em logs, respostas, auditoria ou frontend;
- toda informacao nova precisa aparecer no painel em local coerente;
- toda API nova precisa ter validacao, RBAC e testes;
- todo frontend novo precisa ter estado de loading, vazio, erro e sucesso;
- documentar tudo que foi feito em novo arquivo docs/NNN-ENTREGA-...md;
- atualizar LEITURA-INICIAL.md, docs/00-INDICE-OPERACIONAL.md e 00_inicio.md apenas se a fase entregue mudar o estado operacional.

Antes de editar:
- confira git status;
- identifique mudancas existentes que nao sao suas;
- nao reverta trabalho de terceiros;
- leia os padroes existentes de API, painel, migrations, testes e docs.

Depois de editar:
- rode os testes/smokes cabiveis;
- registre comandos executados;
- documente gaps, flags e proximos passos;
- entregue resumo com arquivos alterados, testes e risco residual.
```

## Template de entrega por fase

Cada fase concluida deve gerar documento novo em `docs/`:

```md
# NNN - Entrega pfREST fase X - [titulo] - AAAA-MM-DD

## Resumo

## Escopo entregue

## Arquivos alterados

## Feature flags

## Rotas/API

## Telas/UX

## RBAC

## Auditoria

## Testes executados

## Evidencias

## Riscos e limitacoes

## Proximos passos
```

## Checklist de acompanhamento

- [ ] Fase 0 - laboratorio e matriz de suporte
- [ ] Fase 1 - capacidades pfREST por firewall
- [ ] Fase 2 - vault, credenciais e rotacao
- [ ] Fase 3 - inventario read-only
- [ ] Fase 4 - diff, drift e compliance
- [ ] Fase 5 - aliases centralizados
- [ ] Fase 6 - central de mudancas em lote
- [ ] Fase 7 - regras firewall e NAT
- [ ] Fase 8 - DNS e DHCP
- [ ] Fase 9 - VPN read-only e operacao assistida
- [ ] Fase 10 - certificados, ACME e servicos
- [ ] Fase 11 - relatorios e governanca
- [ ] Fase 12 - consolidacao como gerenciador

## Conclusao

O pfREST torna viavel transformar o Monitor-Pfsense em um gerenciador centralizado real para muitos firewalls. O caminho seguro nao e comecar escrevendo regras ou VPNs em massa, mas construir uma base progressiva: capacidades, credenciais, inventario, diff, compliance, aliases e so depois mudancas mais criticas.

O maior ganho operacional deve vir de:

- busca global de configuracoes;
- visao de frota por capacidade;
- padronizacao de aliases;
- drift/compliance por cliente;
- mudancas em lote com canario;
- relatorios de governanca;
- reducao de trabalho manual repetitivo.

O limite de seguranca e claro: qualquer funcao que possa derrubar acesso, rede, VPN, NAT ou regras criticas precisa de fundacao propria, aprovacao, backup, janela e rollback assistido.
