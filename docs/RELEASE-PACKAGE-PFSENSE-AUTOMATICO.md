# Release automático do package pfSense

## Objetivo

Atualizar a versão do package em **um único lugar** e fazer com que:

- **Novos firewalls** recebam o comando de instalação já na versão nova.
- **Firewalls já cadastrados** passem a ver o comando atualizado ao abrir a tela do node ou **Instalação** (o comando é gerado na hora pela API).
- **Script** `generate-install-command.sh` use a mesma versão e SHA256 sem edição manual.

Nada é guardado por firewall: a API monta o comando sempre com a versão e o SHA256 definidos em `config/package-release.env`.

## Fonte única da verdade

- **Versão do package:** `packages/pfsense-package/Makefile` → `PORTVERSION` (ex.: `0.2.11`).
- **Versão reportada pelo agente no heartbeat:** `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc` → constante `SYSTEMUP_MONITOR_AGENT_VERSION` (deve ter o **mesmo** valor do PORTVERSION, ex.: `"0.2.11"`). Ao alterar o package, subir os dois na mesma alteração.
- **Versão + SHA256 + URL do repo usados na API e no script:** `config/package-release.env` (gerado e atualizado pelo script de release).

Decisao atual:

- tudo fica no repositorio principal `pablomichelin/pfsense-monitor-agent`
- o backup sera modulo integrado do package `SystemUp Monitor`
- `PACKAGE_RELEASE_REPO_RAW_BASE` deve apontar para `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main`
- detalhes em `docs/65-FRONTEND-E-DEPLOY-BACKUP-PFSENSE-2026-06-08.md` e `docs/66-DECISAO-MODULO-BACKUP-INTEGRADO-SYSTEMUP-MONITOR-2026-06-08.md`

## Como fazer um release (atualizar todos os clientes)

### 1. Ajustar a versão no Makefile e no .inc (se ainda não estiver)

- Edite `packages/pfsense-package/Makefile` e defina `PORTVERSION` (ex.: `0.2.11`).
- Edite `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc` e defina `SYSTEMUP_MONITOR_AGENT_VERSION` com o **mesmo** valor em string (ex.: `"0.2.11"`). Assim o agente reporta a versão correta no heartbeat e a tela Diagnóstico no pfSense mostra a versão atual.

### 2. Rodar o script de release

Na raiz do projeto:

```bash
./scripts/release-pfsense-package.sh
```

O script:

1. Lê `PORTVERSION` do Makefile.
2. Roda `build-pfsense-package-artifact.sh` (gera o `.tar.gz` e o `.sha256`).
3. Atualiza `config/package-release.env` com `PACKAGE_RELEASE_VERSION`, `PACKAGE_RELEASE_SHA256` e `PACKAGE_RELEASE_REPO_RAW_BASE`.
4. Dá `git add` em `config/package-release.env` e nos artefatos em `dist/pfsense-package/`.
5. Faz commit e **push** para o repositório (GitHub).

Para só gerar artefato e config, sem commit nem push:

```bash
./scripts/release-pfsense-package.sh --no-push
```

### 3. Atualizar o servidor (git pull) — sem restart

A API lê `config/package-release.env` **em tempo de execução** (o ficheiro está montado no container). Por isso:

- No servidor, faça **git pull** para obter o novo `config/package-release.env` e os artefatos.
- **Não é necessário reiniciar a API**: na próxima vez que alguém abrir o comando de bootstrap (node ou Instalação), a API lê o ficheiro atualizado e devolve o comando com a **nova versão**.

Se não usar o volume (ficheiro não montado), aí sim é preciso reiniciar a API para carregar as variáveis de ambiente.

### 4. Atualizar cada firewall (quando quiser)

Quem já tem o package instalado pode atualizar de duas formas:

- **Pelo painel:** abrir o node no painel, copiar de novo o “Comando de bootstrap” (já na versão nova) e colar no Command Prompt do pfSense.
- **Pelo script no servidor:** `./scripts/generate-install-command.sh NODE_UID` e colar a saída no pfSense.

Não é obrigatório atualizar todos no mesmo dia: quando o cliente rodar o comando (com a nova versão), o package será atualizado.

## Ficheiros envolvidos

| Ficheiro | Função |
|----------|--------|
| `packages/pfsense-package/Makefile` | Define `PORTVERSION` (versão do package). |
| `config/package-release.env` | Versão, SHA256 e URL raw do repo; commitado; usado pela API e pelo script. |
| `compose.yaml` | Serviço `api` com `env_file: ./config/package-release.env`. |
| `scripts/release-pfsense-package.sh` | Build, atualiza `config/package-release.env`, commit e push. |
| `scripts/generate-install-command.sh` | Lê versão/SHA256 de `config/package-release.env` (ou fallback local). |
| `apps/api/src/config/app-config.ts` | Lê `PACKAGE_RELEASE_*` do ambiente (e, em local, de `config/package-release.env`). |

## Resumo

- **Um release:** alterar `PORTVERSION` no Makefile (se necessário), rodar `./scripts/release-pfsense-package.sh`, depois reiniciar/redeploy da API.
- **Comandos “já gerados”:** não existem armazenados; a API gera sempre com a versão atual de `config/package-release.env`. Por isso, ao atualizar esse ficheiro e redeployar, todos (novos e antigos) passam a receber o comando na nova versão.
- **Próximos firewalls:** ao criar um node e usar o comando de bootstrap, já recebem a versão que está em `config/package-release.env`.
