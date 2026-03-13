# Objetivo e Escopo

## Objetivo do produto

Construir uma plataforma central para monitorar multiplos firewalls pfSense CE a partir de um servidor Ubuntu 24, consolidando inventario, saude operacional e alertas em um unico painel.

## Problema que o projeto resolve

Hoje, acompanhar muitos pfSense manualmente exige:

- acessar cada firewall separadamente
- descobrir versao e estado de servicos caso a caso
- depender de verificacao manual para identificar falhas
- perder tempo com contexto disperso por cliente e por unidade

O projeto busca reduzir esse custo operacional.

## Resultado esperado

Ao final do MVP, o operador deve conseguir:

- abrir um painel unico
- localizar cada firewall por cliente e site
- ver status online, offline ou degradado
- visualizar versao do pfSense, uptime e ultimo heartbeat
- saber se servicos criticos estao executando

## Personas principais

- operador NOC
- administrador de redes
- tecnico de implantacao
- responsavel por suporte de clientes multi-site

## Escopo da solucao

### Escopo funcional alvo

- servidor central com API e banco
- painel web para inventario e status
- ingestao de heartbeat via HTTPS
- modelo de clientes, sites e firewalls
- identificacao de offline por ausencia de heartbeat
- status de servicos criticos
- historico minimo de eventos
- agente local no pfSense
- evolucao para pacote com pagina no menu do pfSense

### Escopo do MVP

- cadastro manual de token por firewall
- envio de heartbeat do pfSense para o controlador
- painel com lista de firewalls e status
- tela de detalhe do firewall
- alerta de offline
- alerta de servico parado
- logs tecnicos basicos

### Escopo da fase seguinte

- pagina de configuracao dentro do pfSense
- widget de saude no dashboard do pfSense
- botao de testar conexao
- botao de enviar heartbeat agora
- pagina local de logs e status do agente

## Fora de escopo no inicio

- controle remoto amplo do firewall
- execucao arbitraria de comandos a partir do controlador
- alteracao centralizada de configuracoes do pfSense
- sincronizacao automatica de HA entre pacotes
- auto discovery irrestrito de firewalls
- multi-cloud complexa no primeiro ciclo

## Premissas

- cada pfSense consegue abrir conexao de saida para o controlador
- o controlador tera DNS e TLS validos
- o heartbeat sera `push` do cliente para o servidor
- o produto nascera com suporte inicial a uma linha homologada de pfSense CE

## Criterios de sucesso do MVP

- o controlador recebe heartbeat de pelo menos 1 pfSense real
- o painel mostra status em menos de 5 segundos apos novo heartbeat
- offline e detectado conforme janela configurada
- servicos criticos aparecem como `running`, `stopped` ou `unknown`
- o operador consegue identificar cliente, site e firewall sem acessar a GUI do pfSense

## Criterios de nao sucesso

- depender de shell manual no pfSense para operacao rotineira
- exigir acesso inbound do controlador ate os clientes
- misturar monitoramento com automacao destrutiva cedo demais
- criar agente sem caminho claro de empacotamento no pfSense

