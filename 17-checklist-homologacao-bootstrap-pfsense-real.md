# Checklist de Homologacao do Bootstrap em pfSense Real

## Objetivo

Padronizar a primeira execucao manual do bootstrap do agente em `pfSense CE 2.8.1`, sem depender de memoria do chat e sem abrir risco operacional desnecessario.

## Escopo desta rodada

Validar em um pfSense real:

- comando one-shot gerado pelo painel
- download do artefato versionado do agente
- validacao de integridade por `.sha256`
- instalacao do loop e servico `rc.d`
- `test-connection`
- primeiro heartbeat real no controlador

Fica fora desta rodada:

- pacote nativo do pfSense
- GUI local definitiva
- suporte oficial a outras versoes sem nova homologacao

## Pre-check no controlador

Antes de ir ao pfSense:

1. confirmar que a stack local ou de homologacao do controlador esta saudavel
2. repetir `scripts/run-smoke-suite.sh` se houve qualquer mudanca recente em `admin`, `alerts`, `bootstrap`, `realtime` ou `RBAC`
3. validar que o proxy externo efetivo segue o contrato `Cloudflare -> ISPConfig -> 192.168.100.244:8088`
4. validar que a release usada no bootstrap possui:
   - `monitor-pfsense-agent-vX.Y.Z.tar.gz`
   - `monitor-pfsense-agent-vX.Y.Z.tar.gz.sha256`
   - `install-from-release.sh`
5. executar `scripts/verify-bootstrap-release.sh <node_id> [release_base_url] [controller_url]` para confirmar o comando gerado e a acessibilidade dos artefatos
6. opcionalmente concentrar esse pre-check em um unico passo com `scripts/run-bootstrap-preflight.sh <node_id> [release_base_url] [controller_url]`
7. em laboratorio local sem `release_base_url` publicado, usar `AUTO_STAGE_RELEASE=1 scripts/run-bootstrap-preflight.sh <node_id>` para servir temporariamente o release local e validar o `bootstrap-command`
8. confirmar que nenhum ajuste local tocou `zabbix-server`, `zabbix-agent`, `apache2` ou `mysql`

## Pre-check do node no painel

No painel administrativo:

1. abrir o detalhe do node alvo
2. confirmar que o `node_uid` esta correto e unico
3. confirmar que o `secret_hint` esperado aparece no detalhe
4. confirmar que o `pfsense_version` do cadastro esta em `pfSense CE 2.8.1`
5. conferir se o comando de bootstrap foi gerado com:
   - `artifact_url`
   - `checksum_url`
   - `installer_url`
6. usar `release_base_url` e `controller_url` override apenas se a homologacao exigir ambiente alternativo

Esse mesmo pre-check agora tambem aparece no detalhe do node no painel, com atalho direto para abrir `/bootstrap` no mesmo contexto da rodada.

## Pre-check no pfSense

No firewall alvo:

1. confirmar que a versao e `pfSense CE 2.8.1`
2. abrir `Diagnostics > Command Prompt`
3. validar conectividade HTTP/HTTPS de saida para:
   - dominio publico do controlador
   - origem da release do agente
4. validar resolucao DNS funcional
5. garantir que a janela permite reiniciar apenas o servico do agente, se necessario

Esse mesmo pre-check agora tambem aparece no detalhe do node no painel, com um bloco copiavel para `Diagnostics > Command Prompt` usando os URLs efetivos da rodada.

## Execucao do bootstrap

Executar o comando one-shot gerado no painel.

Sinais esperados durante a execucao:

- download do `install-from-release.sh`
- download do `.tar.gz`
- validacao positiva de `SHA256`
- escrita da config em `/usr/local/etc/monitor-pfsense-agent.conf`
- instalacao dos arquivos em `/usr/local/libexec/monitor-pfsense-agent/`
- instalacao do servico em `/usr/local/etc/rc.d/monitor_pfsense_agent`

Se a execucao falhar:

1. capturar a saida completa do shell
2. verificar erro de DNS, TLS, download ou `SHA256 mismatch`
3. nao improvisar mudancas permanentes fora dos scripts versionados

Esses sinais esperados e o tratamento inicial de falha agora tambem aparecem no detalhe do node no painel, para reduzir improviso durante a rodada manual.

## Verificacao local no pfSense

Depois da instalacao:

1. conferir se o arquivo `/usr/local/etc/monitor-pfsense-agent.conf` existe
2. rodar:

```sh
service monitor_pfsense_agent status
/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh print-config
/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh test-connection
/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh heartbeat
tail -n 50 /var/log/monitor-pfsense-agent.log
```

Esse mesmo bloco agora tambem aparece no detalhe do node no painel, para copiar sem depender deste documento durante a rodada manual.

3. confirmar que `test-connection` responde com sucesso
4. confirmar que o heartbeat manual nao retorna erro de autenticacao

## Verificacao no controlador

Depois do `test-connection` e do primeiro heartbeat:

1. abrir o detalhe do node no painel
2. confirmar que `agent_version` apareceu
3. confirmar mudanca de `ultimo heartbeat`
4. confirmar que o node entra em `online` dentro da janela esperada
5. confirmar que dashboard e inventario refletem o refresh
6. revisar `audit_logs` para a trilha de `ingest.test_connection`

## Criterios de aceite desta homologacao

Considerar a rodada aprovada quando:

- o bootstrap executa sem ajuste manual fora do fluxo versionado
- o checksum do release e validado
- o servico do agente permanece instalado apos restart do servico
- `test-connection` funciona com credencial real do node
- ao menos um heartbeat real chega ao controlador
- o painel reflete o node como `online`

## Evidencias minimas para registrar

Guardar:

- versao exata do pfSense
- versao exata da release do agente
- comando de bootstrap usado
- resultado do `test-connection`
- resultado do primeiro heartbeat manual
- print ou anotacao do painel mostrando o node `online`
- qualquer ajuste de override usado em `release_base_url` ou `controller_url`

## Se falhar, classificar a falha

Categorias iniciais:

- conectividade ou DNS no pfSense
- problema de release ou checksum
- erro de instalacao do bootstrap
- erro de autenticacao HMAC
- erro de persistencia do servico `rc.d`
- divergencia entre detalhe do node e ambiente real

## Pos-homologacao

Se a rodada for bem-sucedida:

1. atualizar `LEITURA-INICIAL.md`
2. atualizar o percentual do roadmap se houver mudanca de fase
3. registrar a versao homologada do agente
4. decidir o proximo passo entre endurecer o bootstrap ou avancar para a GUI nativa do pfSense

Esse fechamento da rodada agora tambem aparece no detalhe do node no painel, incluindo a saida esperada quando a homologacao falha e precisa voltar ao fluxo versionado antes de nova tentativa.
