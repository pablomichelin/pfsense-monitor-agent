# Canal independente para reinício remoto — plano e contrato

Pedido: operador seleciona serviço autorizado, envia comando e acompanha resultado mesmo quando o dispatcher principal está travado. Não é apenas watchdog automático.

1. Processo supervisor rc.d separado, iniciado/desligado com o package. Poll HTTPS autenticado pela identidade individual do equipamento, sem abrir portas inbound. O loop principal, seus locks e seu journal não participam do transporte de recuperação.
2. Reutilizar permissões service.restart.run, escopo do node e histórico de NodeCommand. Canal supervisor_v1 no payload, excluído da entrega normal. Capacidade/último contato independentes no node. Exigir versão/canal ativos para oferecer a ação; não prometer suporte a instalações antigas.
3. Serviços inicialmente permitidos: monitor_pfsense_agent, unbound, dhcpd, ntpd e dpinger (lista já existente). Não aceitar comando de shell ou nomes arbitrários. Pacotes adicionais exigem adaptador e lista explícita; não equivale a reiniciar qualquer package instalado.
4. Persistir pedido antes de pickup, intenção antes de running e resultado antes de envio. Reutilizar CAS/fence por tentativa do backend. ACK perdido após intenção implica indeterminação, nunca repetir restart. Journal independente guarda somente metadados, sem segredos. Resultado confirma comando e estado posterior do serviço; falha de confirmação não pode ser anunciada como sucesso.
5. Reinícios limitados, lease compartilhado com instaladores mantido durante operação, serviço do supervisor fora da lista. Validade curta, auditoria, habilitação local e identidade de processo. Sem reboot de pfSense. Proteção automática local é complementar e não depende da disponibilidade do controlador.
6. Desenvolver blocos completos, testar uma vez o grupo de contrato/política/transporte; PostgreSQL real para roteamento/fence e LAB FreeBSD para daemon principal interrompido, comando remoto, ACK ambíguo e proteção de instalador. Publicar somente após esses gates, com versão nova e canário. Preservar oito excluídos. Os oito antigos pendentes não recebem código por uma fila que não funciona; bootstrap deles ainda requer canal existente independente.

## Ajuste de usabilidade solicitado durante implementação

Vincular a ação ao monitoramento existente: atalho na lista de serviços para diagnóstico/reinício, estado reportado do serviço selecionado, horário da telemetria principal e horário independente do supervisor. Dado antigo não equivale a serviço saudável. Exibir último resultado, incluindo falha/indeterminação. Não alterar critérios de saúde nem converter automaticamente catálogo de pacotes em autorização para reiniciar serviços arbitrários. Escopo confirmado pelo usuário: exclusivamente pfSense e seus pacotes/serviços; Windows/Linux externos estão fora.

Blocos iniciais: 16 casos de política local, 10 casos de protocolo PHP no FreeBSD isolado, oito casos PostgreSQL 17 e três de autenticação/replay aprovados. API e painel compilaram; somente o painel requer novo build após este ajuste de usabilidade solicitado. LAB operacional e publicação ainda pendentes.

## Correção encontrada no LAB

0.5.30 instalado somente no LAB. O primeiro reinício independente realmente iniciou o agente, mas pipes de stdout herdados mantiveram a confirmação presa; o timeout padrão também atingia descendentes. Supervisor LAB interrompido e agente recuperado por SSH, sem reboot. Não considerar esse caso sucesso operacional.

0.5.31 troca captura de saída por /dev/null na execução de serviços/daemons e usa timeout --foreground para restringir a interrupção ao worker. Dois casos nativos FreeBSD adicionais PASS: daemon destacado não retém a confirmação e timeout não mata serviço destacado. Grupos de política/protocolo/API anteriores não foram repetidos. Candidato privado 0.5.31 anterior à correção do timeout foi descartado antes de qualquer publicação/distribuição; apenas o artefato final foi publicado. O 0.5.30 publicado permanece imutável para auditoria. Nova prova operacional do LAB aprovada conforme registro abaixo.


## Evidência operacional do artefato final

API 0.14.2 e painel 1.15.3 em produção. Package 0.5.31 publicado com SHA-256 `e812b39e1af5c284982af9506c82000f73f3525e2bd39dea23cee05a634baf67`. A versão anunciada do protocolo independente é 0.5.30; não confundir com a versão instalada do package.

- 39 casos dirigidos aprovados: 16 política, dez protocolo PHP, oito PostgreSQL 17, três autenticação/replay e dois processos nativos FreeBSD. Sem repetição das suítes antigas.
- LAB CE 2.9: agente principal interrompido, supervisor PID 94835 mantido. Comando `9743ad76-d412-4b12-9296-7ae4f436ac69` iniciou novo agente PID 84387 e concluiu succeeded às 19:15:14Z. Demonstra transporte independente do dispatcher principal.
- Proteção de instalação: lease real de update mantido durante 90 segundos; supervisor registrou operation_active às 19:16:14Z, sem mudar PID principal. Comando `b5a93619-3f25-4a29-af62-3b8c683ac676` concluiu succeeded após liberação. Não houve reinício concorrente com o instalador.
- Canário CE 2.8.1: atualização `424b85c4-e83f-441a-9222-2c11910f394f` succeeded em 0.5.31. Reinício independente `deac5a66-6472-44b5-843e-17b7cb022daf` succeeded às 19:22:17Z.

Somente o agente Monitor foi reiniciado nas provas reais. Os outros quatro adaptadores permitidos não tiveram reinício operacional validado nesta rodada. Não houve reboot, alteração de rede ou inclusão de servidores Windows/Linux. Interface validada por typecheck/build; não alegar teste visual autenticado nesta rodada.


LAB: backup posterior `ae37c473-0884-4edd-ab9c-bbae41445e77` succeeded às 19:21:56Z, confirmando retorno do fluxo principal. Lote novo `ef786355-a543-4649-97b3-f768a91dc2b6` com 56 solicitações, estritamente os mesmos IDs do lote autorizado original; nenhuma solicitação aos oito excluídos. Não ressuscitados comandos antigos.

Recursos QA removidos: contêiner/rede PostgreSQL isolado, diretório LAB temporário, checkout de build e logs temporários do 221, tags auxiliares de build. Imagens de produção e artefatos imutáveis necessários preservados. Imagens exatas API/web/nginx/db cifradas no 220 em `runtime-recovery210-5aeb6ff.tar.gpg`; checksum e importação por decriptação aprovados. Recuperação integral do conjunto final será registrada após o ensaio.
