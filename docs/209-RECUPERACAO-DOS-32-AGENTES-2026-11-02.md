# Recuperação dos 32 agentes — 02/11/2026

## Estado da rodada

Dos 32 agentes inicialmente pendentes, 24 receberam a versão 0.5.29. A frota está em 50 agentes 0.5.29, oito pendentes em 0.5.27 e oito expressamente excluídos em 0.5.26. Estes últimos permaneceram intocados. API 0.14.1 e web 1.15.2 não mudaram.

As 24 atualizações concluíram com status succeeded. Os 24 backups novos pós-transição concluíram com status succeeded. Evidências anteriores dos 26 agentes não foram repetidas.

## Procedimento efetivamente executado

Acesso pelos painéis existentes, com credenciais das páginas autorizadas Senhas novas firewall, documentos específicos e Controle de Acesso. Identidade do agente conferida antes do restart. Reinício restrito a monitor_pfsense_agent; transição do processo antigo concluída após atualização. Avisos de certificado foram liberados pelo próprio usuário. Não foram alteradas credenciais, permissões, firmware, rede, VPN, DNS, HA/CARP, Zabbix ou Theo. Nenhum reboot foi enviado.

Comandos antigos expirados foram preservados como terminais. Após recuperar o serviço, novas solicitações de upgrade foram feitas pelo PackageUpgradeService, com preflight e auditoria normais. Não houve ressurreição de expired, alteração direta de estados nem remoção de locks. O artefato imutável 0.5.29 permanece SHA-256 1987d70d37bac7f13d8ba73156e8b10b1621a619650f8e2afd59faac2314ed7d.

## Evidências por equipamento

Cada linha representa atualização concluída e um único pedido de backup posterior. Identificadores permitem consulta auditável, sem guardar conteúdo de configuração ou credenciais.

| Equipamento | Comando de backup posterior |
|---|---|
| Ortoclin/Carzia | a79bff23-d0d4-4a28-9459-67b9e79db5a9 |
| Voltaic/N1 | 8395af20-df48-4b4a-ad5e-1743f0f2aa63 |
| Gentil | 13338fc0-8fdf-41b0-9319-d1e026d33669 |
| Laboratório Xanxerê | f2beb395-674b-4442-8b6b-f2c88b9315bd |
| Ronnau | 3b308909-40f1-4814-8d10-5cc79c4cb150 |
| FM | 5cd88a47-ab1b-44a8-83f9-49ac6b9299d6 |
| Enerview | de45da16-543b-4fc1-8dcd-9ec9dac08585 |
| Contacenter | eef31d72-af64-4627-971b-7fb76b35eea6 |
| Hile/Chamais | 18a01dfe-d4bd-4cba-805e-cee89fbb0a7e |
| Inova | acad2601-7631-46f2-9e09-02b5c2113715 |
| Solaris | 83b39004-4f5a-4915-b040-3e627956ecc4 |
| Melyta | 6ed64630-0b1d-4d0d-90d7-8d85e5481364 |
| Compasi Concórdia | ba57e9f3-d022-4a34-a019-8ce8fd390082 |
| Compasi Lages | 087d1ca1-68d5-464a-b6dd-d63c9160b29e |
| AlaForte | 8ced6694-7eb1-47b0-8792-cd7ef6f0ff8a |
| TCA | 2f2fc758-454e-4c7c-86dd-0a9e897bc23a |
| Compasi Locado | 199c1ead-7f6c-4155-8076-fd826afe1fd5 |
| Compasi Videira | cd5f2790-825e-4fda-9c98-0c9803d815ee |
| Compasi Maravilha | 73f0f18b-8f3c-4bc9-931f-59ddb213a030 |
| Vemat | 61af83bf-976f-48e7-86a0-682c913684de |
| Acrel Lageado | 79a96d30-5dfd-4f7d-90d7-bfd069ad3004 |
| CGH Lageado | 21d7e552-48f3-4d7c-94cb-5fa034f4d6e5 |
| ADML/Wolff | c55f3c84-b834-476b-b43a-fa33d3768cd7 |
| Compasi Matriz | 36b79805-e5db-40d2-bcb3-6e08ca8d2345 |

## Oito pendentes adicionais aos oito excluídos

| Equipamento | Bloqueio observado |
|---|---|
| RCA | Painel acessível após liberação de certificado; credencial da lista nova rejeitada. |
| Hacker | Credencial disponível rejeitada pelo painel e por SSH. Correspondência com backup anterior não comprova acesso atual. Não insistir na mesma combinação. |
| Laticínio Oliveira | Painel voltou a responder; credencial disponível rejeitada. |
| CGH Arabutã | Documento Enerview contém dados PPPoE e campos de roteador vazios, sem credencial administrativa pfSense identificada. Não reutilizar senha PPPoE para login. |
| Amorin | Documentos consultados descrevem servidores; credencial do firewall não localizada. |
| Ferrazo | Busca pelo nome sem resultado e sem entrada identificada na lista nova. |
| Amazon Xanxerê | Endereço corresponde à documentação central; não localizada senha específica de firewall. Não reutilizar credenciais Unifi/VMware. |
| Imepar | Documento aponta endereço privado da operadora 100.70.50.167, sem caminho administrativo externo alternativo localizado. |

Foi solicitada ao usuário somente a localização de documentação complementar ou caminho administrativo existente. Não abrir acesso inbound geral nem criar rede/túnel novo para contornar esses limites. Esses oito não devem ser confundidos com os oito excluídos pelo usuário.

## Limites e próximo passo

A versão 0.5.29 corrige herança de descritores de lock. Supervisor independente permanece proposta do relatório 208, não implementado nesta rodada. Recuperação via painel existente não equivale a capacidade autônoma universal do produto.

Concluir os oito acessos restantes mediante fonte válida e seguir o mesmo ciclo restrito, sem reexecutar backups dos aprovados. Nenhum build, migration ou suíte global foi necessário nesta operação. Painéis tratados fechados continuamente conforme pedido; arquivos temporários de credenciais e scripts removidos ao finalizar a rodada. A aba de erro de navegação do Laticínio não pôde ser fechada pela ferramenta e pode ser fechada pelo usuário.

## Tentativa solicitada pelo pacote — 02/11/2026, 15:33 BRT

Após nova autorização do usuário, foi invocado requestServiceRestart pelo serviço oficial para os oito pendentes, exclusivamente com service=monitor_pfsense_agent. Os oito tinham heartbeat recente. Todas as oito solicitações retornaram service restart is disabled antes de enqueue: nenhum comando criado e nenhum reinício executado. Não foi enviado reboot de firewall nem alterado o estado dos comandos.

A configuração SERVICE_RESTART_ENABLED do controlador impede a operação. O agente também exige MONITOR_AGENT_OPERATIONAL_ACTIONS_ENABLED e MONITOR_AGENT_SERVICE_RESTART_ENABLED, ambos desabilitados por padrão. Os valores efetivos locais desses oito não foram lidos nesta tentativa. Mesmo habilitar somente o controlador não fornece canal independente: service_restart passa pelo dispatcher/fila do pacote. Não afirmar que heartbeat recente comprova execução de comandos. A recuperação autônoma independente continua não implementada; o acesso administrativo existente permanece necessário quando o dispatcher está bloqueado.
