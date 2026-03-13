# Homologacao Real do Pacote pfSense em 2026-03-13

## Objetivo deste registro

Registrar, sem suprimir contexto, a rodada real de homologacao do pacote nativo do pfSense, os comandos executados, os erros encontrados, as correcoes aplicadas no repositorio e o estado operacional final validado.

Este documento existe para permitir continuidade em novo chat sem depender da memoria desta conversa.

## Escopo desta rodada

Nesta rodada foi validado em `pfSense CE 2.8.1` real:

- instalacao one-shot do pacote via `Diagnostics > Command Prompt`
- registro do menu do pacote em `Services > SystemUp Monitor`
- exposicao do servico em `Status > Services`
- instalacao do runtime do agente
- configuracao local em `/usr/local/etc/monitor-pfsense-agent.conf`
- servico `monitor_pfsense_agent`
- autenticacao HMAC com o backend
- `test-connection` e `heartbeat`
- primeiro heartbeat real aceito pelo controlador

## Ambiente e premissas operacionais

- dominio publico do controlador: `https://pfs-monitor.systemup.inf.br`
- topologia publica informada pelo usuario:
  - `Cloudflare -> ISPConfig -> 192.168.100.244`
- `ISPConfig` faz proxy para:
  - `/api/` -> `http://192.168.100.244:8088`
  - `/_next/` -> `http://192.168.100.244:3001`
  - `/` -> `http://192.168.100.244:3001`
- stack local deste repositorio:
  - `nginx` do projeto em `:8088`
  - `api` exposta por esse gateway
  - `web` separada internamente

## Repositorio Git e artefato usados

Repositorio GitHub publicado:

- `https://github.com/pablomichelin/pfsense-monitor-agent`

Remote configurado:

- `git@github.com:pablomichelin/pfsense-monitor-agent.git`

Artefato final validado nesta rodada:

- release URL:
  - `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/dist/pfsense-package/monitor-pfsense-package-v0.1.0.tar.gz`
- checksum final:
  - `7aa9c08ee906b3b4a7e130fdbff2db0b0f190dd6000ec0126b532e846bfb1b46`

Commit final relevante do fluxo do agente:

- `39766ea` `Fix agent request signing for ingest API`

Sequencia completa de commits relevantes desta rodada:

- `8d2e067` `Fix pfSense agent runtime on base install`
- `4f43780` `Register pfSense package menu on manual install`
- `b974bb6` `Expose monitor agent in pfSense service status`
- `74c078a` `Register monitor service explicitly in pfSense config`
- `6a42c49` `Allow manual start from pfSense services page`
- `5b62478` `Simplify pfSense agent rc start flow`
- `1bdc656` `Align agent payloads with ingest API`
- `39766ea` `Fix agent request signing for ingest API`

## Cadastros usados no painel

### Firewall Amazon Xxe

Usado em rodadas anteriores de teste.

- `node_uid`: `fw-amazon-matriz`
- `customer_code`: `amazon`

### Firewall Lasalle Agro

Usado na rodada que fechou a homologacao funcional.

- nome exibido: `Lasalle Agro`
- `node_uid`: `lasalle-agro`
- `customer_code`: `lasalle-agro`
- `node_secret`: `9w84RwWO9M6Pmf5VAKKWxxZaAdShj7D-ZWReDhO5cZk`
- `mgmt_ip` cadastrado: `192.168.4.3`
- `wan_ip` cadastrado: `177.38.13.156`
- `pfsense_version`: `2.8.1`

## Comando final de instalacao que funcionou

Observacao importante:

- o fluxo mais seguro foi instalar sem `--enable`
- o runtime foi validado sem depender de auto-start durante a instalacao

Comando final usado:

```sh
fetch -o - https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/packages/pfsense-package/bootstrap/install-from-release.sh | sh -s -- \
  --release-url https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/dist/pfsense-package/monitor-pfsense-package-v0.1.0.tar.gz \
  --sha256 7aa9c08ee906b3b4a7e130fdbff2db0b0f190dd6000ec0126b532e846bfb1b46 \
  --controller-url https://pfs-monitor.systemup.inf.br \
  --node-uid lasalle-agro \
  --node-secret 9w84RwWO9M6Pmf5VAKKWxxZaAdShj7D-ZWReDhO5cZk \
  --customer-code lasalle-agro
```

## Fluxo correto validado no pfSense

### 1. Limpeza completa quando necessario

Quando o pfSense ficou com lixo de menu, servico e package registrados sem os arquivos fisicos, o comando abaixo foi o que funcionou de forma consistente para limpeza total:

```sh
sh -c 'service monitor_pfsense_agent stop >/dev/null 2>&1 || true; sysrc -x monitor_pfsense_agent_enable >/dev/null 2>&1 || true; php -r '\''
require_once("/etc/inc/config.inc");
$targets = [
  "package" => ["name" => ["systemup-monitor"]],
  "menu" => ["name" => ["SystemUp Monitor"], "configfile" => ["systemup_monitor.xml"], "url" => ["/pkg.php?xml=systemup_monitor.xml", "/status_systemup_monitor.php"]],
  "service" => ["name" => ["monitor_pfsense_agent"]],
];
foreach ($targets as $section => $rules) {
  $items = $config["installedpackages"][$section] ?? [];
  if (!is_array($items)) {
    continue;
  }
  $config["installedpackages"][$section] = array_values(array_filter($items, function ($item) use ($rules) {
    if (!is_array($item)) {
      return true;
    }
    foreach ($rules as $field => $values) {
      $value = $item[$field] ?? "";
      if (in_array($value, $values, true)) {
        return false;
      }
    }
    return true;
  }));
}
unset($config["installedpackages"]["systemupmonitor"]);
write_config("Remove SystemUp Monitor completely");
echo "config cleaned\n";
'\''; rm -f /usr/local/etc/rc.d/monitor_pfsense_agent /usr/local/etc/monitor-pfsense-agent.conf /usr/local/pkg/systemup_monitor.xml /usr/local/pkg/systemup_monitor.inc /usr/local/www/status_systemup_monitor.php /var/log/monitor-pfsense-agent.log; rm -rf /usr/local/libexec/monitor-pfsense-agent /usr/local/share/pfSense-pkg-systemup-monitor; echo "files removed"; php -r '\''require_once("/etc/inc/config.inc"); echo "package=" . count(array_values(array_filter($config["installedpackages"]["package"] ?? [], fn($x) => is_array($x) && (($x["name"] ?? "") === "systemup-monitor")))) . PHP_EOL; echo "menu=" . count(array_values(array_filter($config["installedpackages"]["menu"] ?? [], fn($x) => is_array($x) && ((($x["name"] ?? "") === "SystemUp Monitor") || (($x["configfile"] ?? "") === "systemup_monitor.xml"))))) . PHP_EOL; echo "service=" . count(array_values(array_filter($config["installedpackages"]["service"] ?? [], fn($x) => is_array($x) && (($x["name"] ?? "") === "monitor_pfsense_agent")))) . PHP_EOL;'\''; ls -ld /usr/local/pkg/systemup_monitor.xml /usr/local/etc/rc.d/monitor_pfsense_agent /usr/local/share/pfSense-pkg-systemup-monitor /usr/local/libexec/monitor-pfsense-agent 2>/dev/null || true'
```

Resultado esperado e confirmado:

- `package=0`
- `menu=0`
- `service=0`

### 2. Instalacao limpa

Comando validado:

```sh
fetch -o - https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/packages/pfsense-package/bootstrap/install-from-release.sh | sh -s -- \
  --release-url https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/dist/pfsense-package/monitor-pfsense-package-v0.1.0.tar.gz \
  --sha256 7aa9c08ee906b3b4a7e130fdbff2db0b0f190dd6000ec0126b532e846bfb1b46 \
  --controller-url https://pfs-monitor.systemup.inf.br \
  --node-uid lasalle-agro \
  --node-secret 9w84RwWO9M6Pmf5VAKKWxxZaAdShj7D-ZWReDhO5cZk \
  --customer-code lasalle-agro
```

### 3. Confirmacoes locais apos instalar

Comandos usados:

```sh
php -r 'require_once("/etc/inc/config.inc"); echo "package=" . count(array_values(array_filter($config["installedpackages"]["package"] ?? [], fn($x) => is_array($x) && (($x["name"] ?? "") === "systemup-monitor")))) . PHP_EOL; echo "menu=" . count(array_values(array_filter($config["installedpackages"]["menu"] ?? [], fn($x) => is_array($x) && (($x["name"] ?? "") === "SystemUp Monitor")))) . PHP_EOL; echo "service=" . count(array_values(array_filter($config["installedpackages"]["service"] ?? [], fn($x) => is_array($x) && (($x["name"] ?? "") === "monitor_pfsense_agent")))) . PHP_EOL;'
```

```sh
ls -l /usr/local/pkg/systemup_monitor.xml /usr/local/etc/rc.d/monitor_pfsense_agent /usr/local/etc/monitor-pfsense-agent.conf
```

```sh
service monitor_pfsense_agent status
```

```sh
/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh print-config
```

### 4. Confirmacoes visuais do package no pfSense

Estado final validado:

- menu apareceu em `Services > SystemUp Monitor`
- GUI local abriu com configuracao e diagnostico
- servico apareceu em `Status > Services` como `monitor_pfsense_agent`

## Erros reais encontrados e causa raiz

### 1. `NEXT_REDIRECT` no painel ao criar cliente

Sintoma:

- tela `Admin` mostrava `NEXT_REDIRECT`

Causa:

- `redirect()` do Next.js estava sendo capturado no `catch` da server action

Correcao:

- `apps/web/lib/admin.ts`
- commit: `9bfb8e4`

### 2. Banco com lixo de testes e smoke

Sintoma:

- painel vinha preenchido com clientes, sites e nodes de testes

Acao:

- reset completo do banco local do projeto
- backup gerado antes da limpeza

### 3. UI administrativa burocratica demais

Sintoma:

- formularios pediam nome tecnico e nome humano em excesso

Correcao:

- gerar automaticamente `client code`, `site code` e `node_uid`
- commit: `4231db6`

### 4. Menu do pacote nao aparecia no pfSense

Sintoma:

- arquivos do package existiam
- menu nao aparecia em `Services`

Causa raiz:

- instalacao manual copiava os arquivos, mas nao registrava o package no `installedpackages/menu`

Correcao:

- registrar package no fluxo manual via `install_package_xml('systemup-monitor')`
- commit: `4f43780`

### 5. Servico nao aparecia em `Status > Services`

Sintoma:

- package tinha GUI
- servico nao aparecia na tela padrao de servicos

Causa raiz:

- o XML do package nao era suficiente nesse fluxo manual
- foi necessario registrar explicitamente o servico em `installedpackages/service`

Correcao:

- commit: `74c078a`

### 6. Botao de start do servico nao funcionava

Sintoma:

- servico listado na GUI do pfSense, mas ficava `stopped`

Causas identificadas ao longo da rodada:

- `rc.d` inicialmente implementado de forma fragil
- fluxo generico com `daemon` e `rc.subr` nao estava robusto para o uso real do pfSense

Correcoes aplicadas em sequencia:

- `6a42c49` `Allow manual start from pfSense services page`
- `5b62478` `Simplify pfSense agent rc start flow`

### 7. `curl: (22) ... 404` em `test-connection`

Sintoma:

- comando manual no pfSense retornava `404`

Causa raiz:

- a chamada estava indo como `GET` em vez de `POST`

Correcao:

- forcar `-X POST` no agente

### 8. `curl: (22) ... 400` em `test-connection`

Sintoma:

- apos sair do `404`, ainda retornava `400`

Causa raiz:

- o agente enviava corpo JSON em `test-connection`
- a API exige corpo vazio nesse endpoint

Correcao:

- `test-connection` passou a enviar corpo vazio
- commit: `1bdc656`

### 9. `curl: (22) ... 400` em `heartbeat`

Sintoma:

- `heartbeat` ainda retornava `400`

Causa raiz:

- o JSON do agente estava fora do schema esperado pelo backend

Problemas encontrados no payload antigo:

- usava `uptime_seconds` em vez de `uptime_sec`
- colocava CPU/memoria/disco dentro de `metrics`, mas a API espera no topo
- nao enviava `heartbeat_id`
- nao enviava `sent_at`
- nao enviava `node_uid` no corpo
- servicos usavam `detail` em vez de `message`
- `gateways` nao era enviado no formato esperado

Correcao:

- alinhar payload com `apps/api/src/ingest/dto/heartbeat.dto.ts`
- commit: `1bdc656`

### 10. `401 invalid heartbeat signature`

Sintoma:

- mesmo com `node_secret` correto, a API rejeitava a assinatura

Causa raiz:

- o agente assinava no formato errado:
  - errado: `node_uid.timestamp.payload`
  - correto no backend: `timestamp + "\n" + rawBody`

Correcao:

- alinhar HMAC com `IngestService.assertSignature()`
- commit: `39766ea`

## Formato que realmente funciona contra a API

### Assinatura HMAC correta

Formato correto da mensagem assinada:

```text
${timestamp}\n${rawBody}
```

Nao usar:

```text
${node_uid}.${timestamp}.${payload}
```

### `test-connection`

Metodo:

- `POST`

Headers:

- `X-Node-Uid`
- `X-Timestamp`
- `X-Signature`

Body:

- vazio

### `heartbeat`

Metodo:

- `POST`

Headers:

- `Content-Type: application/json`
- `X-Node-Uid`
- `X-Timestamp`
- `X-Signature`

Body minimo valido:

```json
{
  "schema_version": "2026-01",
  "heartbeat_id": "lasalle-agro-1773410314534",
  "sent_at": "2026-03-13T13:58:34Z",
  "node_uid": "lasalle-agro",
  "hostname": "lasalle-agro",
  "customer_code": "lasalle-agro",
  "pfsense_version": "2.8.1",
  "uptime_sec": 123,
  "mgmt_ip": "192.168.4.3",
  "wan_ip_reported": "177.38.13.156",
  "agent_version": "0.1.0",
  "cpu_percent": null,
  "memory_percent": null,
  "disk_percent": 50,
  "gateways": [],
  "services": [
    {
      "name": "unbound",
      "status": "running",
      "message": "ok"
    }
  ],
  "notices": []
}
```

### Validacao local contra a API

Foi validado localmente neste host que a API aceita:

- `POST /api/v1/ingest/test-connection` com `201 Created`
- `POST /api/v1/ingest/heartbeat` com `201 Created`

## Estado final validado no painel

Firewall validado:

- `Lasalle Agro`

Estado visual confirmado no painel:

- `agente ativo`
- `Agente 0.1.0`
- `ultimo contato` recente

O node apareceu como `degraded` em vez de `unknown`, o que indica:

- bootstrap e ingestao basica funcionando
- mas ainda ha algum dado de runtime que classifica o node como degradado

Diagnostico fechado depois da rodada:

- a causa mais provavel do `degraded` era falso positivo na lista padrao de servicos monitorados do agente
- o pacote enviava por padrao `unbound,dhcpd,openvpn,ipsec,wireguard,ntpd,dpinger`
- no backend, qualquer servico vindo como `stopped`, `degraded` ou `unknown` derruba o node para `degraded`
- em firewalls que nao usam `openvpn`, `ipsec` ou `wireguard`, isso gera classificacao incorreta se o agente continuar reportando esses servicos
- a correcao aplicada no repositorio foi filtrar a lista padrao para enviar apenas servicos habilitados ou configurados no `config.xml` do pfSense

Consequencia pratica:

- o pacote continua com a mesma matriz de servicos suportados
- mas deixa de reportar como problema um servico que nao esta ativo naquele firewall
- a proxima rodada real deve reinstalar o artefato atualizado e confirmar se o node sai de `degraded` para `online`

## O que NAO fazer na proxima rodada

- nao executar varios comandos em uma unica linha no `Diagnostics > Command Prompt`
- nao misturar `test-connection`, `heartbeat` e `tail` no mesmo submit
- nao reutilizar `customer_code` de outro cliente
- nao supor que a assinatura HMAC usa `node_uid.timestamp.payload`
- nao remover arquivo fisico sem limpar tambem `installedpackages/package`, `menu` e `service`

## O que fazer na proxima rodada

1. ler `00_inicio.md`
2. ler `LEITURA-INICIAL.md`
3. ler este documento
4. tratar a homologacao do pacote pfSense como parcialmente validada em campo
5. focar no que ainda falta:
   - entender por que `Lasalle Agro` ficou `degraded`
   - revisar se o comando manual do agente no pfSense esta sempre carregando a versao mais nova do script
   - consolidar o instalador para reduzir necessidade de remendos manuais
   - decidir se a proxima etapa e endurecer o pacote atual ou gerar o `.pkg` pelo builder do pfSense

## Prompt pronto para novo chat

Use este prompt exatamente como entrada inicial do novo chat:

```text
Leia primeiro os arquivos abaixo e continue exatamente da homologacao real do pacote pfSense, sem reexplicar contexto e sem redesenhar arquitetura:

1. /opt/Monitor-Pfsense/00_inicio.md
2. /opt/Monitor-Pfsense/LEITURA-INICIAL.md
3. /opt/Monitor-Pfsense/00-README.md
4. /opt/Monitor-Pfsense/18-homologacao-pfsense-package-real-2026-03-13.md
5. /opt/Monitor-Pfsense/CORTEX.md

Considere como fatos ja validados:

- o dominio publico e https://pfs-monitor.systemup.inf.br
- existe ISPConfig na frente fazendo proxy para este host
- a GUI do pacote pfSense apareceu em Services > SystemUp Monitor
- o servico apareceu em Status > Services
- o firewall Lasalle Agro conseguiu chegar ao estado de agente ativo no painel
- o pacote/artefato final usado nesta rodada foi:
  - release URL: https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/dist/pfsense-package/monitor-pfsense-package-v0.1.0.tar.gz
  - sha256: 7aa9c08ee906b3b4a7e130fdbff2db0b0f190dd6000ec0126b532e846bfb1b46
- os commits criticos da rodada estao documentados no arquivo 18-homologacao-pfsense-package-real-2026-03-13.md

Objetivo do novo chat:

- continuar a partir do estado atual do pacote pfSense
- identificar por que o node Lasalle Agro apareceu como degraded
- consolidar o fluxo final de instalacao e operacao sem tentativa e erro em firewall de cliente
- atualizar a documentacao oficial do projeto conforme necessario
```
