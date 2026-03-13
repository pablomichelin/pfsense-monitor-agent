# Evolucao da logica de servicos e Fase B (catalogo de pacotes) — 2026-03-13

## Objetivo deste registro

Documentar as alteracoes feitas para:

- fazer a selecao de servicos refletir corretamente no painel e no status do node;
- preparar e avancar a Fase B (catalogo de pacotes monitoraveis por firewall) sem degradar por pacotes nao usados;
- manter compatibilidade com o que ja funciona no pfSense real (Fase A).

## Resumo das alteracoes

### 1. Backend (API)

- **Ingest**: apos processar os servicos e gateways do heartbeat, o backend **remove** da tabela `node_service_status` (e `node_gateway_status`) qualquer registro cujo nome nao conste no payload do ultimo heartbeat. Assim o painel exibe apenas o conjunto **atualmente** monitorado pelo firewall (reflete a selecao da GUI do package).
- **DTO**: em `HeartbeatServiceDto` foi adicionado o campo opcional `impact_on_status?: 'critical' | 'optional'`. Se omitido, trata-se como `critical` (comportamento atual da Fase A).
- **Calculo de status**: em `node-status.util.ts`, o node so passa a `degraded` por servico quando ha problema **e** o servico nao e `optional`. Servicos com `impact_on_status === 'optional'` continuam visiveis e podem gerar alerta, mas nao degradam o node.

### 2. Catalogo (`packages/pfsense-package/catalog/package-monitor-catalog.json`)

- Foi adicionado o campo **`service_name`** em todos os itens com `check_type: "service"`, indicando o nome do daemon/rc no FreeBSD/pfSense (ex.: `bind` -> `named`, `net-snmp` -> `snmpd`). Isso permite ao agente saber qual servico verificar quando o usuario seleciona um pacote do catalogo.

### 3. Package pfSense — agente

- **Fase B no runtime**: o agente passou a aceitar a variavel opcional `MONITOR_AGENT_PACKAGES`. Formato: lista separada por virgula de entradas `package_name` ou `package_name:impact` (impact = `critical` ou `optional`). Ex.: `haproxy,suricata,squid:optional`.
- Foi incorporado um mapeamento **package_name -> service_name** (rc) para os pacotes do catalogo com `check_type: service`, para que o script consiga chamar `service <name> status` corretamente.
- Os servicos de pacotes sao adicionados ao array `services` do heartbeat; quando ha `impact`, o payload inclui `impact_on_status` para o backend aplicar a regra de degradacao.

### 4. Package pfSense — GUI

- Novo campo **Pacotes adicionais (Fase B)** na tela de configuracao (`Services > SystemUp Monitor`): textarea `monitored_packages_csv`. O usuario informa a lista de pacotes (e opcionalmente `:critical` ou `:optional` por pacote). O valor e persistido no config do package e escrito em `MONITOR_AGENT_PACKAGES` no arquivo do agente (`/usr/local/etc/monitor-pfsense-agent.conf`).

## Regra de produto consolidada

- O node so fica **degraded** por itens **explicitamente selecionados** para aquele firewall (servicos nativos na Fase A + pacotes na Fase B).
- Servicos marcados como **optional** no heartbeat sao monitorados e podem gerar alerta, mas **nao** entram no calculo de `degraded`.
- O painel mostra apenas os servicos/gateways que constam no **ultimo** heartbeat (remocao de orfaos no ingest).

## Compatibilidade

- Agentes que nao enviam `impact_on_status` (Fase A ou package antigo): continuam tratados como `critical`; comportamento inalterado.
- Agentes que nao definem `MONITOR_AGENT_PACKAGES`: apenas os servicos nativos (Fase A) sao enviados; comportamento inalterado.
- Limite do payload de services no backend segue em 32 itens (nativos + pacotes).

## Proximos passos sugeridos

1. Reinstalar/atualizar o package no pfSense de teste e preencher `monitored_packages_csv` com um ou mais pacotes (ex.: `haproxy,squid:optional`) para validar Fase B fim a fim.
2. Executar a suite local `scripts/run-smoke-suite.sh` apos mudancas em ingest/status.
3. Manter o catalogo e o mapeamento package->service_name no agente alinhados ao `package-monitor-catalog.json` conforme novos pacotes forem homologados.
