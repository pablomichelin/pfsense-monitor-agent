# Prerequisitos de Infraestrutura

## Visao geral

O controlador central sera executado em Ubuntu 24 e precisara estar acessivel por HTTPS a partir dos pfSense clientes.

## Restricao obrigatoria de coexistencia

Este Ubuntu 24 ja opera como servidor Zabbix. Portanto:

- o Zabbix e servico prioritario do host
- nenhuma atividade deste projeto pode degradar, interromper ou reconfigurar o Zabbix sem aprovacao explicita
- qualquer deploy do Monitor-Pfsense deve coexistir com `zabbix-server`, `zabbix-agent`, `apache2` e `mysql`

Estado observado no host em `2026-03-12`:

- `zabbix-server.service`: ativo
- `zabbix-agent.service`: ativo
- `apache2.service`: ativo
- `mysql.service`: ativo

Portas observadas:

- `80/TCP`: Apache
- `10050/TCP`: Zabbix Agent
- `10051/TCP`: Zabbix Server
- `3306/TCP` em loopback: MySQL
- `8088/TCP`: gateway interno publicado pelo Monitor-Pfsense

Portas que devem ser tratadas como reservadas para o Zabbix:

- `80/TCP`
- `443/TCP`
- `10050/TCP`
- `10051/TCP`
- `10052/TCP`
- `10053/TCP`
- `3306/TCP`

## Requisitos minimos do host central

Ambiente de laboratorio ou MVP:

- 2 vCPU
- 4 GB RAM
- 40 GB de disco
- IP fixo

Ambiente de producao inicial:

- 4 vCPU
- 8 GB RAM
- 80 GB de disco
- armazenamento persistente para banco e logs
- snapshot ou backup agendado

## Requisitos de rede

- FQDN publico ou privado resolvivel pelos pfSense clientes
- nao assumir uso de `80/TCP` ou `443/TCP` neste host enquanto o impacto sobre o Zabbix nao for avaliado
- preferir portas altas dedicadas para o MVP se o deploy ocorrer no mesmo host do Zabbix
- se `443/TCP` vier a ser usado pelo projeto neste mesmo host, isso deve ser decidido explicitamente e sem alterar o frontend do Zabbix existente
- saida HTTPS liberada nos pfSense clientes para o controlador
- DNS funcional para o nome do controlador

## Requisitos de TLS

- certificado valido para o FQDN do controlador
- cadeia de certificados confiavel para o pfSense
- renovacao automatica documentada

## Requisitos de sistema

- Ubuntu 24 LTS minimal ou server
- usuario administrativo com `sudo`
- sincronizacao de horario ativa por `systemd-timesyncd` ou equivalente
- hostname consistente com o nome do servidor

## Requisitos de persistencia

Persistencia obrigatoria:

- banco PostgreSQL
- configuracoes da aplicacao
- logs de auditoria
- arquivos de proxy reverso

Persistencia recomendada:

- dump diario do banco
- retencao de logs
- snapshots antes de atualizacao relevante

## Requisitos de firewall local no Ubuntu

Permitir:

- `22/TCP` apenas para administracao
- portas do Monitor-Pfsense apenas se nao colidirem com o Zabbix do host
- `443/TCP` e `80/TCP` somente apos validacao de conflito com Apache/Zabbix

Negar:

- acesso administrativo irrestrito a banco e containers
- qualquer porta de debug exposta publicamente

## Requisitos do lado pfSense

- acesso ao `Diagnostics > Command Prompt` para bootstrap inicial
- conectividade HTTPS de saida para o controlador
- permissao para instalar componente local do projeto
- acesso do administrador para definir token e parametros do agente

## Ambientes recomendados

- `dev`: desenvolvimento local e simulacao
- `staging`: homologacao com 1 ou mais pfSense de teste
- `prod`: ambiente real com dominios, certificados e monitoramento ativo

## Dependencias externas recomendadas

- provedor DNS
- provedor de certificados ou ACME
- canal de notificacao para alertas futuros
- repositorio Git privado ou controlado para releases

## Requisitos operacionais

- processo de backup do host
- processo de atualizacao do controlador
- processo de rollback
- processo de emissao e revogacao de tokens
- checklist de impacto no Zabbix antes de qualquer mudanca local

## Regra de portas para este projeto no host atual

Se o Monitor-Pfsense for implantado neste mesmo host, usar por padrao:

- portas altas dedicadas
- containers sem `network_mode: host`
- bind explicito apenas nas portas do projeto

Proibido por padrao:

- publicar `80`, `443`, `10050`, `10051`, `10052`, `10053` ou `3306`
- alterar configuracao do `apache2`, `mysql`, `zabbix-server` ou `zabbix-agent`

## Referencias oficiais

- Zabbix 7.4 requirements e portas padrao:
  https://www.zabbix.com/documentation/7.4/en/manual/installation/requirements

## Matriz de compatibilidade

No inicio, a equipe deve homologar:

- uma linha de Ubuntu 24 para o controlador
- uma linha especifica de pfSense CE para o agente

O suporte a multiplas linhas de versao deve vir depois de testes reais.
