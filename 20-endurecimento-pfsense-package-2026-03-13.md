# Endurecimento do Pacote pfSense em 2026-03-13

## Objetivo deste registro

Documentar a continuidade da homologacao real do pacote pfSense apos a primeira rodada funcional.

Este arquivo cobre:

- o que foi testado no pfSense real depois da primeira instalacao funcional
- os erros encontrados em cada release incremental
- o que foi corrigido no repositorio
- o estado operacional final ao fim desta iteracao

## Escopo desta iteracao

Nesta iteracao foi feito o endurecimento do package nativo do pfSense para resolver:

- instalacao via release GitHub
- autenticacao do `test-connection`
- autenticacao do `heartbeat`
- classificacao indevida de `degraded`
- coleta errada de `uptime`
- coleta errada de status de servicos
- ausencia de selecao explicita por firewall dos servicos que impactam saude

## Ambiente de referencia

- firewall real: `Lasalle Agro`
- `node_uid`: `lasalle-agro`
- dominio do controlador: `https://pfs-monitor.systemup.inf.br`
- pacote base ja funcional antes desta iteracao: `0.1.0`
- package GUI funcional em `Services > SystemUp Monitor`
- service entry funcional em `Status > Services`

## Linha do tempo resumida

### 1. Publicacao do `v0.1.1`

Objetivo:

- filtrar servicos padrao nao habilitados no pfSense para reduzir falso `degraded`

Testes executados:

- build local do artefato `monitor-pfsense-package-v0.1.1.tar.gz`
- validacao local do payload com `openvpn` omitido quando nao configurado

Falha encontrada em campo:

- o pfSense recebeu `404 Not Found` ao tentar baixar o artefato

Causa:

- artefato ainda nao estava publicado no GitHub raw

Correcao:

- commit e push do artefato para `main`

### 2. Instalacao limpa e validacao do `v0.1.1`

Testes executados:

- limpeza total de arquivos e registros do package no pfSense
- reinstalacao completa do package
- verificacao de `AGENT_VERSION` no runtime e no `systemup_monitor.inc`

Falha encontrada:

- `test-connection` retornava `400`
- `heartbeat` retornava `400`

Conclusao operacional:

- o package foi atualizado, mas o helper HTTP ainda divergía do contrato real da API

### 3. Investigacao do `400`

Testes executados:

- `curl` manual no pfSense com assinatura HMAC montada inline
- reproducao local contra a API real com o mesmo `node_uid` e `node_secret`
- execucao do script com `sh -x` para inspecionar `timestamp`, assinatura e cabecalhos

Resultados:

- `curl` manual para `test-connection` respondeu `201`
- `curl` manual para `heartbeat` respondeu `201`
- o script `0.1.1` ainda respondia `400`

Causa raiz identificada:

- o helper do package enviava `Content-Type: application/json` em `POST` sem body
- isso fazia o backend rejeitar `test-connection` antes de entrar na autenticacao

### 4. Publicacao do `v0.1.3`

Objetivo:

- corrigir o `POST` vazio do `test-connection`
- endurecer mensagens de status de servicos

Falha encontrada:

- `test-connection` passou de `400` para `401`

Causa raiz identificada:

- a assinatura do body vazio ainda estava errada
- a quebra de linha final de `timestamp + "\n"` se perdia no helper generico

### 5. Publicacao do `v0.1.4`

Objetivo:

- substituir o helper generico por fluxo explicito ja validado em teste manual

Mudancas praticas:

- `test-connection` passou a assinar explicitamente `timestamp + "\n"`
- `heartbeat` passou a assinar bytes exatos de arquivo temporario e enviar com `--data-binary`

Resultado validado:

- `test-connection` respondeu `201`
- `heartbeat` respondeu `201`
- o package ficou funcional fim a fim em campo

### 6. Persistencia do `degraded` com dados incorretos

Sintomas observados no painel:

- `uptime` absurdo e incorreto
- `CPU` vazia
- `unbound`, `dpinger` e `ntpd` aparecendo errados
- `openvpn` e `ipsec` divergindo do estado real mostrado pela tela nativa do pfSense

Conclusao:

- autenticacao e ingestao ja estavam corretas
- a coleta local do agente ainda nao refletia corretamente o ambiente real do pfSense

### 7. Publicacao do `v0.1.5`

Objetivo:

- corrigir a coleta local do agente no pfSense real

Mudancas aplicadas:

- parse mais robusto de `kern.boottime`
- melhoria na leitura de CPU
- deteccao de servicos priorizando processos reais antes de cair no `service ... status`
- ajuste de classificacao de retorno “not found / unknown directive”

Resultado esperado:

- aproximar `uptime` e servicos do que a tela nativa do pfSense mostra

### 8. Necessidade de selecao explicita por firewall

Observacao de produto validada nesta iteracao:

- nao faz sentido degradar um firewall por um servico que o cliente nao usa
- exemplo: `openvpn` deve sair da conta quando o firewall nao usa `OpenVPN`

Decisao:

- a saude do node deve considerar apenas o que foi explicitamente selecionado para aquele firewall

### 9. Publicacao do `v0.1.6`

Objetivo:

- entregar selecao operacional por firewall para os servicos nativos suportados

Mudancas aplicadas:

- package GUI passou a expor selecao por checkbox para:
  - `unbound`
  - `dhcpd`
  - `dpinger`
  - `openvpn`
  - `ipsec`
  - `wireguard`
  - `ntpd`
- o runtime continua compativel com `services_csv`, mas deixa de depender dele como campo manual principal
- o agente passa a enviar apenas os servicos efetivamente selecionados naquele firewall

Resultado esperado:

- evitar `degraded` por servicos nao usados pelo cliente

## Validacoes executadas localmente no host do projeto

Durante esta iteracao, foram repetidos localmente:

- `php -l` nos arquivos PHP do package
- `sh -n` nos scripts shell do runtime
- execucao do package script contra a API real com `node_uid=lasalle-agro`
- `curl -I` nos artefatos raw publicados no GitHub

## Validacoes executadas no pfSense real

Foram executados no firewall real, em diferentes momentos da iteracao:

- `service monitor_pfsense_agent status`
- `cat /usr/local/etc/monitor-pfsense-agent.conf`
- `grep AGENT_VERSION ...`
- `test-connection`
- `heartbeat`
- `tail -n 50 /var/log/monitor-pfsense-agent.log`
- `date -u`
- leitura do segredo com `awk`
- `curl` manual com assinatura HMAC inline

## Estado final ao fim desta iteracao

Ao final desta iteracao:

- instalacao por release GitHub esta funcional
- `test-connection` esta funcional no pfSense real
- `heartbeat` esta funcional no pfSense real
- package GUI e service entry permanecem funcionais
- selecao por firewall dos servicos nativos suportados esta implementada no package
- o backlog do projeto passa a tratar a lista de packages do pfSense como catalogo monitoravel futuro, nao como degradacao automatica

## Artefatos finais relevantes desta iteracao

Release final desta rodada:

- `monitor-pfsense-package-v0.1.6.tar.gz`
- sha256: `c8ad7241848d2f7c02a5dde9ce38fce19134970dd20c0fe5c0947a5ef99efd6b`

Commits principais desta rodada de endurecimento:

- `78ce5df` `Fix pfSense package service filtering and publish v0.1.1 artifact`
- `7f202f0` `Fix pfSense package empty-body signing and publish v0.1.3 artifact`
- `c6b3f8a` `Fix pfSense package request flow and publish v0.1.4 artifact`
- `7833670` `Fix pfSense runtime service and uptime detection in v0.1.5`
- `b416532` `Add per-firewall service selection to pfSense package v0.1.6`

## Proximo bloco recomendado

1. reinstalar o `v0.1.6` no pfSense real
2. marcar apenas os servicos realmente usados pelo firewall
3. validar se o node sai de `degraded`
4. consolidar a Fase B por catalogo de pacotes monitoraveis
5. definir quais packages devem impactar saude e quais devem ser apenas inventario
