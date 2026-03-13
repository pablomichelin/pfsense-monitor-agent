# Plano de Implementacao - Monitoramento Centralizado de pfSense

## Objetivo

Criar um servidor central em Ubuntu 24 para receber status de multiplos pfSense e exibir um painel com:

- cliente
- hostname
- IP de gerenciamento
- versao do pfSense
- ultimo heartbeat
- status de servicos monitorados
- alertas ativos

Cada pfSense cliente deve ter um pacote proprio com pagina no menu da GUI para configurar o envio dos dados ao servidor central.

## Decisao Principal

O melhor desenho para esse caso e:

1. um pacote customizado no pfSense
2. um backend central no Ubuntu 24
3. um dashboard web consumindo esse backend

Evitar instalacao manual de arquivos soltos em `/usr/local/www` ou scripts ad hoc copiados por `curl`.
No pfSense, o caminho mais consistente e empacotar tudo como pacote (`pkg`) para ganhar:

- pagina no menu
- tela de configuracao
- hooks de instalacao/remocao
- organizacao dos arquivos
- comportamento previsivel

## Arquitetura Recomendada

### 1. Componente no pfSense

Pacote sugerido: `pfSense-pkg-MonitorFleet`

Responsabilidades:

- criar pagina de configuracao na GUI
- armazenar configuracao no XML do pfSense
- coletar status local
- enviar heartbeat para o servidor central
- exibir uma aba local de diagnostico do agente

Configuracoes da pagina:

- habilitar/desabilitar agente
- nome do cliente
- nome do site/unidade
- URL do servidor central
- porta
- token do agente
- intervalo de envio
- lista de servicos monitorados
- timeout de rede
- modo de TLS

Local de menu sugerido:

- `Services > Monitor Fleet` para configuracao
- `Status > Monitor Fleet` para diagnostico local

### 2. Servidor central no Ubuntu 24

Stack sugerida para o MVP:

- `FastAPI` para API
- `PostgreSQL` para persistencia
- `Redis` opcional para fila/cache
- `Nginx` como reverse proxy
- frontend simples em `React` ou tela server-rendered com atualizacao via SSE/WebSocket

Responsabilidades:

- receber heartbeats dos pfSense
- validar autenticacao dos agentes
- manter inventario dos firewalls
- calcular saude de cada no
- emitir alertas
- exibir dashboard em tempo real
- registrar historico de falhas

## Fluxo de Dados

1. O administrador executa um comando no `Diagnostics > Command Prompt`.
2. O comando instala o pacote a partir de uma URL HTTPS.
3. O pacote cria a pagina no menu do pfSense.
4. O administrador informa o endereco do servidor Ubuntu, porta e token.
5. O agente passa a enviar heartbeats periodicos via HTTPS.
6. O servidor central atualiza o dashboard e os alertas em tempo quase real.

## Instalacao no pfSense

Fluxo esperado:

```sh
pkg add https://github.com/SEU-USUARIO/SEU-REPO/releases/download/v1.0.0/pfSense-pkg-MonitorFleet-1.0.0.txz
/etc/rc.restart_webgui
```

Observacoes:

- o artefato precisa ser um pacote `.txz` valido
- o restart do `webgui` normalmente e necessario para a nova pagina aparecer
- o pacote deve ser construido para a linha de versao suportada do pfSense

## Dados Enviados pelo Agente

Payload minimo sugerido:

```json
{
  "agent_version": "1.0.0",
  "node_id": "uuid-do-firewall",
  "client_name": "Cliente A",
  "site_name": "Filial SP",
  "hostname": "fw-cliente-a",
  "management_ip": "10.0.0.1",
  "wan_ip": "200.10.10.10",
  "pfsense_version": "2.x/Plus x",
  "last_boot": "2026-03-11T12:00:00Z",
  "services": [
    {"name": "unbound", "status": "running"},
    {"name": "openvpn", "status": "stopped"}
  ],
  "health": {
    "cpu": 18,
    "memory": 43,
    "disk": 61
  },
  "alerts": [
    {"code": "service_down", "service": "openvpn"}
  ],
  "sent_at": "2026-03-11T14:00:00Z"
}
```

## O Que Monitorar no MVP

Escopo minimo:

- identificacao do cliente
- IP principal
- hostname
- versao do pfSense
- versao do agente
- ultimo heartbeat
- status de servicos principais
- uso basico de CPU, memoria e disco

Servicos iniciais recomendados:

- `unbound`
- `dhcpd`
- `openvpn`
- `ipsec`
- `wireguard`
- `ntpd`
- `dpinger` e estado de gateways

## O Que Nao Tentar no MVP

- controle remoto amplo do pfSense
- alteracao de configuracoes centrais a partir do painel
- execucao arbitraria de comandos enviados pelo servidor
- telemetria a cada 1 segundo

Esses itens aumentam muito o risco operacional e de seguranca.

## Tempo Real

"Tempo real" aqui deve significar:

- heartbeat a cada `30s`
- atualizacao instantanea do painel via SSE ou WebSocket

Se tentar fazer streaming continuo a partir do pfSense no inicio, o projeto fica mais complexo sem ganho pratico relevante.

## Push x Pull

### Push a partir do pfSense

Vantagens:

- nao exige acesso de entrada ao firewall
- funciona melhor atras de NAT
- reduz exposicao de credenciais administrativas
- combina com o fluxo que voce descreveu

Desvantagens:

- precisa de um agente local

### Pull a partir do servidor central

Vantagens:

- sem agente local, em teoria

Desvantagens:

- exige acesso do servidor a todos os pfSense
- exige credenciais armazenadas centralmente
- aumenta superficie de ataque

Para este projeto, `push` e a melhor escolha.

## Como Implementar o Pacote do pfSense

Estrutura esperada:

- `info.xml` para metadados do pacote
- `*.xml` do pacote para os campos da GUI e entrada de menu
- arquivos PHP em `/usr/local/pkg/`
- paginas web em `/usr/local/www/packages/monitorfleet/`
- script ou servico local para enviar heartbeat

Arquivos principais do pacote:

- tela de configuracao
- include PHP com funcoes de coleta
- pagina de diagnostico do agente
- script de envio
- hooks de install/remove/resync

## Coleta Local no pfSense

O agente deve consultar:

- versao do sistema
- hostname
- interfaces e IPs relevantes
- status dos servicos selecionados
- saude basica do sistema

Importante:

- "servico em erro" precisa ser definido com clareza
- no MVP, trate erro como `servico parado` ou `heartbeat ausente`
- numa fase 2, implemente health checks especificos por servico

## Modelo de Banco no Servidor Central

Tabelas iniciais:

- `nodes`
- `node_heartbeats`
- `node_services`
- `alerts`
- `agent_tokens`
- `audit_logs`

Campos uteis em `nodes`:

- `node_id`
- `client_name`
- `site_name`
- `hostname`
- `management_ip`
- `wan_ip`
- `pfsense_version`
- `agent_version`
- `last_seen_at`
- `status`

## Seguranca

Minimo aceitavel:

- trafego somente por `HTTPS`
- token unico por firewall
- rotacao de token
- validacao de timestamp para evitar replay
- logs de auditoria
- rate limit no endpoint de ingestao

Recomendado:

- `mTLS` entre pfSense e servidor central
- HMAC assinado no payload
- allowlist de IP de origem quando possivel

## Riscos Reais do Projeto

### 1. Upgrade do pfSense

Pacotes de repositorio alternativo podem ser removidos em upgrades e podem causar problemas se forem tratados de forma improvisada.

Mitigacao:

- empacotar corretamente
- manter matriz de compatibilidade por versao do pfSense
- ter rotina de reinstalacao pos-upgrade
- considerar um repositorio proprio de pacotes numa fase posterior

### 2. Diferencas entre pfSense CE e Plus

Nem sempre um mesmo build serve para todas as linhas.

Mitigacao:

- definir suporte inicial para uma linha especifica
- depois ampliar compatibilidade

### 3. "Erro de servico" mal definido

Processo ativo nao significa servico saudavel.

Mitigacao:

- no MVP usar `running/stopped`
- na fase 2 criar verificacoes por servico

## Roadmap

### Fase 1 - Prova de conceito

- backend com endpoint `/api/v1/heartbeat`
- dashboard simples listando firewalls
- agente pfSense por script local ou pagina PHP de teste
- cadastro manual de token

### Fase 2 - Pacote pfSense

- pacote `.txz`
- pagina no menu
- configuracao persistente
- servico/cron de heartbeat
- pagina local de diagnostico

### Fase 3 - Alertas

- regras de offline
- servico parado
- mudanca de versao
- envio por email, Telegram ou Slack

### Fase 4 - Controle remoto limitado

- reiniciar servico especifico
- renovar processo
- coletar diagnostico remoto

Somente com:

- autenticacao forte
- acoes permitidas por allowlist
- trilha de auditoria completa

## Recomendacao de Inicio

Comece assim:

1. subir o servidor central no Ubuntu 24
2. criar a API de heartbeat
3. criar dashboard com status online/offline
4. fazer um agente simples no pfSense enviando JSON
5. depois transformar isso em pacote oficial do projeto

Isso reduz risco e acelera a validacao.

## Alternativa se o Objetivo For So Monitoramento

Se o foco for apenas visualizar metricas e alertas, sem criar pagina propria no pfSense, voce pode considerar:

- `Zabbix-Agent`
- `Telegraf`
- `Node Exporter`

Esses caminhos encurtam o tempo de entrega, mas nao resolvem seu requisito de menu proprio no pfSense nem o fluxo de instalacao GitHub + pagina customizada.

## Referencias

- pfSense Command Prompt:
  https://docs.netgate.com/pfsense/en/latest/diagnostics/command-prompt.html
- pfSense Developing Packages:
  https://docs.netgate.com/pfsense/en/latest/development/develop-packages.html
- pfSense Package Port Directory Structure:
  https://docs.netgate.com/pfsense/en/latest/development/package-directories.html
- pfSense Package List / ports usados:
  https://docs.netgate.com/pfsense/en/latest/development/package-port-list.html
- pfSense warnings sobre pacotes de repositorio alternativo:
  https://docs.netgate.com/pfsense/en/latest/install/upgrade-guide-prepare.html
  https://docs.netgate.com/pfsense/en/latest/releases/2-4-4.html
