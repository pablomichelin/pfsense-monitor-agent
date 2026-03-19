# Instalação do agente no pfSense — procedimento que funciona

Este documento descreve a forma correta de instalar ou atualizar o package SystemUp Monitor em um firewall pfSense e como o painel gera o comando automaticamente.

## O que foi corrigido (v0.2.0)

- **PATH**: O serviço rc.d e o loop do agente passam a exportar `PATH=/usr/local/bin:/usr/bin:/bin`, para que `curl`, `openssl` e `php` sejam encontrados quando o agente roda em background.
- **Comando em segundo plano**: O comando one-shot usa `nohup ... &` para a instalação rodar em background e o Command Prompt da GUI retornar na hora (evita carregamento infinito).
- **Build do payload**: O script do agente tornou-se resiliente a falhas em `detect_*` e `build_services_json`, para o heartbeat ser enviado mesmo com erros pontuais.
- **Início do serviço**: O `install.sh` habilita e inicia o serviço rc.d explicitamente após o PHP, para o agente enviar heartbeats automaticamente a cada 30 segundos.

## Forma correta de instalar

### 1. No painel (servidor)

- **Firewall novo**: Ao cadastrar um novo firewall (node), abra a página do firewall. Na seção **Credencial do agente** será exibido o **comando de instalação** pronto para copiar (com o secret real do node).
- **Secret rotacionado**: Após clicar em **Rotacionar secret**, a página é recarregada e o **comando de instalação** é atualizado com o novo secret. Copie o comando e use no pfSense.
- **Modo do heartbeat**: Antes de copiar o comando, escolha na tela se a instalação será em modo **Normal** ou **Light**.

### 2. No pfSense

- Acesse **Diagnostics > Command Prompt**.
- Cole o comando exibido no painel (um único bloco).
- Clique em **Execute**. A linha retorna na hora com a mensagem `Instalação em segundo plano. Log: tail -f /tmp/monitor-install.log`.
- A instalação continua em background. Para acompanhar: em outro Command Prompt, `tail -f /tmp/monitor-install.log`.
- Em 1–2 minutos o firewall deve aparecer **online** no painel e o agente enviará heartbeats a cada 30 segundos.

### 3. Geração automática do comando

- O comando é montado pelo backend com: **node_uid**, **node_secret** (ativo), **customer_code**, **controller_url**, **versão do package** e **SHA256** do artefato.
- O comando agora também inclui `--heartbeat-mode normal|light`.
- Para cada firewall, o painel chama a API e exibe o comando na página do node. Ao rotacionar o secret, a mesma página passa a mostrar o comando já com o novo secret.
- No servidor, também é possível gerar o comando via script:  
  `./scripts/generate-install-command.sh <NODE_UID> [normal|light]`

## Requisitos no servidor para o comando automático

O backend precisa das variáveis de ambiente (ex.: `.env.api`):

- `PACKAGE_RELEASE_VERSION` — versão do artefato (ex.: `0.2.0`)
- `PACKAGE_RELEASE_SHA256` — SHA256 do arquivo `monitor-pfsense-package-v<VERSION>.tar.gz`
- Opcional: `PACKAGE_RELEASE_REPO_RAW_BASE` — base URL raw do repositório (default: GitHub do projeto)

Com isso, a API inclui o campo `package_command` na resposta de **bootstrap-command** e o painel exibe o comando na página do firewall e após rotacionar o secret.

Ao publicar uma nova versão do package, atualize `PACKAGE_RELEASE_VERSION` e `PACKAGE_RELEASE_SHA256` no `.env.api` e reinicie a API para que o comando exibido use a nova versão.

## Modos de heartbeat

### Modo normal

- Novo padrão do package.
- Envia métricas, serviços e gateways em todo heartbeat.
- Recomendado para diagnóstico, VPN/IPsec/OpenVPN e validação de monitoramento.

### Modo light

Para reduzir carga no servidor e no firewall, o agente pode enviar apenas **dados essenciais** em cada heartbeat (sem lista de gateways nem de serviços). A API mantém o último estado conhecido de gateways/serviços até receber um heartbeat completo.

No arquivo de configuração do agente (ex.: `/usr/local/etc/monitor-pfsense-agent.conf`), defina:

```sh
MONITOR_AGENT_LIGHT_HEARTBEAT=1
```

Valores aceitos: `1`, `true` ou `yes`. Quando definido, o payload enviado a cada intervalo contém apenas: identificação, hostname, versões, uptime, IPs, CPU/memória/disco e interfaces. Gateways e serviços são omitidos; o painel continua a exibir o último estado recebido. Recomendado quando há muitos firewalls (ex.: 70+) para reduzir tráfego e processamento.

No fluxo atual do painel, essa escolha é feita diretamente no comando de instalação via `--heartbeat-mode normal|light`.

## Referência

- **Cadastro, comandos e testes (visão completa):** `docs/CADASTRO-E-COMANDOS-PFSENSE.md`
- Comando e artefatos: `docs/COMANDO-ATUALIZAR-PACKAGE-PFSENSE.md`
- Modos de heartbeat na instalação: `docs/62-MODO-HEARTBEAT-INSTALACAO-PFSENSE-2026-03-19.md`
- Script de geração no servidor: `scripts/generate-install-command.sh`
