# pfSense Agent Skeleton

Esqueleto inicial do agente leve para a fase anterior ao pacote nativo do pfSense.

Arquivos principais:

- `bin/monitor-pfsense-agent.sh`
- `monitor-pfsense-agent.conf.example`
- `bootstrap/install.sh`
- `bootstrap/install-from-release.sh`
- `bootstrap/uninstall.sh`

Comandos suportados:

```sh
./bin/monitor-pfsense-agent.sh test-connection
./bin/monitor-pfsense-agent.sh heartbeat
./bin/monitor-pfsense-agent.sh print-config
```

Variaveis minimas:

- `CONTROLLER_URL`
- `NODE_UID`
- `NODE_SECRET`
- `CUSTOMER_CODE`

Variaveis operacionais relevantes:

- `MONITOR_AGENT_SERVICES` com lista CSV dos servicos a observar
- `MGMT_IP` e `WAN_IP_REPORTED` quando quiser fixar IPs manualmente
- `CPU_PERCENT_OVERRIDE`, `MEMORY_PERCENT_OVERRIDE` e `DISK_PERCENT_OVERRIDE` para bootstrap assistido

Comportamento atual:

- `test-connection` chama `POST /api/v1/ingest/test-connection`
- `heartbeat` envia um payload minimo assinado para `POST /api/v1/ingest/heartbeat`
- o script detecta `hostname`, `pfsense_version`, `uptime`, `disk`, `memoria` e IPs LAN/WAN quando possivel
- o script tenta observar servicos locais via `service` e gera a lista no heartbeat
- overrides opcionais podem ser definidos no arquivo de configuracao
- o bootstrap instala config, loop de heartbeat e servico `rc.d`

Empacotamento inicial:

```sh
./scripts/build-pfsense-agent-artifact.sh 0.1.0
```

Validacao local do fluxo de release antes de ir ao pfSense real:

```sh
./scripts/smoke-agent-release.sh
```

Verificacao operacional do node e dos URLs publicados antes da rodada manual:

```sh
BASE_URL="https://pfs-monitor.systemup.inf.br" \
  ./scripts/verify-bootstrap-release.sh <node_id>
```

Atalho para rodar o preflight completo:

```sh
BASE_URL="https://pfs-monitor.systemup.inf.br" \
  ./scripts/run-bootstrap-preflight.sh <node_id>
```

Roteiro da homologacao manual em firewall real:

- `17-checklist-homologacao-bootstrap-pfsense-real.md`
- alvo inicial: `pfSense CE 2.8.1`

Exemplo de estrutura esperada para bootstrap one-shot:

```sh
fetch https://repo-ou-release/monitor-pfsense-agent-v0.1.0.tar.gz
tar -xzf monitor-pfsense-agent-v0.1.0.tar.gz
cd pfsense-agent
./bootstrap/install.sh --controller-url ... --node-uid ... --node-secret ... --customer-code ...
```

Exemplo mais proximo do fluxo final:

```sh
fetch https://repo-ou-release/monitor-pfsense-agent-v0.1.0.tar.gz
fetch https://repo-ou-release/monitor-pfsense-agent-v0.1.0.tar.gz.sha256
fetch https://repo-ou-release/install-from-release.sh
sh install-from-release.sh \
  --release-url https://repo-ou-release/monitor-pfsense-agent-v0.1.0.tar.gz \
  --sha256 <sha256> \
  --controller-url https://pfs-monitor.systemup.inf.br \
  --node-uid ... \
  --node-secret ... \
  --customer-code ...
```

Limites desta iteracao:

- instala persistencia simples por `rc.d`, mas ainda sem pacote nativo
- ainda nao coleta servicos e gateways reais do pfSense
- ainda nao cria GUI local no pfSense
