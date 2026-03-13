# ISPConfig Proxy

Este diretorio guarda a referencia versionada do proxy reverso externo usado pelo MVP.

Topologia oficial desta fase:

- dominio publico: `https://pfs-monitor.systemup.inf.br`
- Cloudflare na frente
- `ISPConfig` em `192.168.100.253` como termino TLS e proxy reverso
- origem interna do Monitor-Pfsense em `http://192.168.100.244:8088`

## Arquivo de referencia atual

- `nginx.monitor-pfsense.conf`

Este arquivo representa a configuracao alvo quando o vhost do `ISPConfig` estiver usando `nginx` como motor HTTP efetivo ou como camada final de proxy.

## Objetivos do proxy externo

- manter painel, API e ingestao no mesmo dominio
- preservar `Host`, `Cookie`, `CF-Connecting-IP` e cadeia `X-Forwarded-*`
- desabilitar buffering no caminho do stream `SSE`
- limitar payloads de ingestao a `64k`
- nao introduzir cache no stream

## Validacao operacional minima

Depois de aplicar o snippet no `ISPConfig`, validar:

1. `curl -skI https://pfs-monitor.systemup.inf.br/login`
2. `curl -skI https://pfs-monitor.systemup.inf.br/healthz`
3. `BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-origin-contract.sh`
4. `BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/verify-sse-stream.sh`
5. `BASE_URL="https://pfs-monitor.systemup.inf.br" ./scripts/smoke-realtime-refresh.sh`

## Observacoes

- este diretorio nao altera `apache2`, `mysql`, `zabbix-server` ou `zabbix-agent`
- o arquivo e referencia versionada; a aplicacao final no `ISPConfig` deve respeitar o mecanismo real do host
- se o site no `ISPConfig` usar `Apache` como proxy final, manter este arquivo como contrato de comportamento e traduzir diretivas equivalentes
