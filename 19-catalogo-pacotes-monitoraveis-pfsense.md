# Catalogo de Pacotes Monitoraveis no pfSense

## Objetivo

Registrar a matriz inicial dos pacotes do pfSense que podem entrar no roadmap de monitoramento do Monitor-Pfsense.

Este arquivo separa:

- o que ja faz parte da selecao operacional atual por firewall
- o que pode virar monitoramento futuro
- o que nao deve impactar o status do node por padrao

## Regra central

O node so deve ficar `degraded` por itens explicitamente selecionados para aquele firewall.

Isso vale para:

- servicos nativos
- pacotes adicionais

Se o cliente nao usa um recurso:

- ele nao entra no heartbeat
- ele nao abre alerta
- ele nao degrada o node

## Fase A ja entregue

Selecao operacional por firewall, no package pfSense, para servicos nativos suportados:

- `unbound`
- `dhcpd`
- `dpinger`
- `openvpn`
- `ipsec`
- `wireguard`
- `ntpd`

Esses itens ja podem ser marcados ou desmarcados no package local em `Services > SystemUp Monitor`.

## Fase B definida neste arquivo

Pacotes adicionais passam a ser tratados por catalogo, com estes campos:

- `package_name`
- `display_name`
- `category`
- `check_type`
- `impact_on_node_status`
- `notes`

## Categorias adotadas

- `native-service`: servico nativo do pfSense ja suportado
- `package-service`: pacote com processo/servico claro para monitorar
- `package-feature`: pacote que exige check especifico alem de um daemon simples
- `inventory-only`: relevante para inventario, mas nao para saude critica do node
- `defer`: item conhecido, mas ainda sem mapeamento operacional confiavel

## Politica recomendada de impacto

- `critical`: pode degradar o node quando explicitamente selecionado
- `optional`: pode ser monitorado, mas nao deve degradar o node por padrao
- `inventory-only`: apenas inventario e visibilidade
- `none`: nao entra no calculo de saude

## Principios para a proxima iteracao

1. nao transformar toda a lista de packages em degradacao automatica
2. exigir mapeamento explicito `pacote -> check`
3. diferenciar saude do firewall de saude de funcionalidades opcionais
4. permitir selecao por firewall no package local antes de impactar o backend

## Fonte estruturada

O catalogo estruturado desta rodada fica em:

- `packages/pfsense-package/catalog/package-monitor-catalog.json`

## Exemplo de direcao pratica

Itens que tendem a fazer sentido como `critical` quando usados:

- `haproxy`
- `suricata`
- `snort`
- `Telegraf`
- `zabbix-agent5`
- `zabbix-agent6`
- `zabbix-agent7`
- `node_exporter`
- `syslog-ng`
- `Tailscale`

Itens que tendem a ser `optional`:

- `squid`
- `squidGuard`
- `pfBlockerNG`
- `pfBlockerNG-devel`
- `freeradius3`
- `bind`
- `Open-VM-Tools`

Itens que tendem a ser `inventory-only` ou `defer` ate haver mapeamento melhor:

- `Notes`
- `Backup`
- `RRD_Summary`
- `Status_Traffic_Totals`
- `Netgate_Firmware_Upgrade`
- `Cron`
- `System_Patches`

## Resultado esperado desta fase

O projeto passa a ter uma base oficial para crescer de:

- selecao de servicos nativos por firewall

para:

- selecao de pacotes monitoraveis por firewall, com regra clara de impacto

sem degradar nodes por recursos que o cliente nao usa.
