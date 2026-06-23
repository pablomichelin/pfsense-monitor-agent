# Diretrizes e funcionamento — Monitor-Pfsense

Documento de referência para saber **o que está sendo feito** e **como tudo deve funcionar**. Atualizado ao finalizar ciclos de trabalho.

---

## 1. Versão do package pfSense (agente no firewall)

### Onde a versão é definida

- **Makefile:** `packages/pfsense-package/Makefile` → `PORTVERSION` (ex.: `0.2.11`).
- **Constante do agente:** `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc` → `SYSTEMUP_MONITOR_AGENT_VERSION` (ex.: `"0.2.11"`).

**Regra:** ao alterar qualquer arquivo do package, incrementar **os dois** na mesma alteração (patch: 0.2.11 → 0.2.12). O script de release **não** altera a versão sozinho; ele só lê o Makefile.

### Como a versão do agente chega ao servidor

1. O PHP do package grava no config do agente a linha `AGENT_VERSION="X.Y.Z"` (valor da constante).
2. O script do agente lê esse config e envia `agent_version` no **heartbeat**.
3. O **ingest** da API grava no node o valor recebido (`request.body.agent_version`).
4. O painel (dashboard, editar cadastro, etc.) exibe o que está no banco → sempre **dado vindo do cliente**.

**Consequência:** se no painel aparecer versão antiga (ex.: 0.2.0) após instalar 0.2.11, o config do agente no firewall não foi regravado. Ver seção 4 abaixo.

### Onde a versão do agente aparece

- **Painel:** lista operacional (coluna Agente), detalhe do node, editar cadastro (somente leitura).
- **pfSense:** Services → SystemUp Monitor → **Diagnóstico** → linha "Versão do agente" na tabela (usa a constante do PHP).

---

## 2. Release do package (comando de instalação sempre atualizado)

### Fonte única para a API

- **Arquivo:** `config/package-release.env`
  - `PACKAGE_RELEASE_VERSION`, `PACKAGE_RELEASE_SHA256`, `PACKAGE_RELEASE_REPO_RAW_BASE`
- A API lê esse arquivo **em tempo de execução** (montado no container). Não é preciso reiniciar a API após um release.

### Como fazer um release

1. Ajustar versão no **Makefile** e em **SYSTEMUP_MONITOR_AGENT_VERSION** no `.inc` (mesmo valor).
2. Na raiz: `./scripts/release-pfsense-package.sh`
   - Lê `PORTVERSION` do Makefile.
   - Gera artefato e atualiza `config/package-release.env`.
   - Commit + push (config + artefatos em `dist/pfsense-package/`).
3. No servidor: `git pull`. Não é obrigatório reiniciar a API.

Detalhes: `docs/RELEASE-PACKAGE-PFSENSE-AUTOMATICO.md`.

---

## 3. Instalação/atualização no firewall e config do agente

### Script de install

- `install-from-release.sh` baixa o artefato e chama `bootstrap/install.sh`.
- O `install.sh` copia os arquivos do package e, quando há parâmetros (controller, node_uid, etc.), roda o PHP **seed** e em seguida o PHP **sync**.
- O **sync** regera o config do agente (`/usr/local/etc/monitor-pfsense-agent.conf`) com a versão atual do package (`AGENT_VERSION`). Assim, após instalar/atualizar, o próximo heartbeat já envia a versão correta.
- O **sync periódico (resync)** não grava mais o `config.xml` inteiro — só o arquivo runtime do agente. Persistência no XML usa `systemup_monitor_persist_package_config()` (`config_read` + snapshot só da seção SystemUp Monitor). Ver `docs/92-ENTREGA-CORRECAO-WRITE-CONFIG-SEGURO-2026-06-23.md`.

### Se a versão no painel continuar errada após atualizar o package

No firewall (SSH ou Diagnostics → Command Prompt):

```bash
/usr/local/bin/php -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php sync
```

Isso regera o config com o valor atual de `SYSTEMUP_MONITOR_AGENT_VERSION`. Alternativa: no pfSense, Services → SystemUp Monitor → Configuração → Editar configuração → Salvar.

---

## 4. Painel web (frontend)

### Versão exibida no rodapé

- **Fonte:** `apps/web/package.json` → campo `version`.
- **Uso:** `apps/web/app/layout.tsx` importa o `package.json` e exibe "Monitor-Pfsense v{packageJson.version}". Não há valor fixo no código; ao subir a versão no `package.json`, o rodapé reflete automaticamente.

### Cadastro de node: versões somente leitura

- **Versão pfSense** e **Versão do agente** no formulário "Editar cadastro" são **somente leitura**, preenchidas pelo agente (heartbeat).
- A API **não** aceita alteração desses campos no create/update do node; só o **ingest** atualiza com o que o cliente envia. Novos nodes ficam com versões em branco até o primeiro heartbeat.

### Dashboard (lista operacional)

- Colunas: Nome, Status, **Versão** (pfSense, sem sufixo -RELEASE), **Agente**, CPU, Mem, Disco, Uptime, Último HB, Alert., Ação.
- Modo manutenção: indicador **M** ao lado do link "Abrir" (amarelo se em manutenção, apagado se não). Não há mais coluna "M." separada.

### Build e deploy

- Após alterar `apps/api` ou `apps/web`: build do(s) app(s) e `docker compose up -d --build` na raiz.
- Regra em `.cursor/rules/build-and-deploy.mdc`.

---

## 5. Package pfSense: telas e textos

- **Configuração:** lista com colunas Description e Actions (ícones editar/excluir sem quadro, azul padrão); botões Add e Delete abaixo. Versão do agente no Diagnóstico.
- **Diagnóstico:** tabela com Enabled, Controller URL, Node UID, Customer code, Heartbeat interval, **Versão do agente**, Selected services, etc.; blocos Runtime paths e Operational commands com espaçamento inferior. Mensagem antiga de “homologação em pfSense CE 2.8.1 real” foi removida (já homologado).

---

## 6. Regras do projeto (Cursor)

| Regra | Conteúdo |
|-------|----------|
| `.cursor/rules/build-and-deploy.mdc` | Ao alterar API ou web: build + `docker compose up -d --build`. |
| `.cursor/rules/pfsense-package-version.mdc` | Ao alterar o package: subir `PORTVERSION` no Makefile e `SYSTEMUP_MONITOR_AGENT_VERSION` no `.inc` (mesmo valor). |

---

## 7. Documentos relacionados

| Documento | Assunto |
|----------|---------|
| `docs/00-INDICE-OPERACIONAL.md` | Mapa atual de retomada e organizacao documental. |
| `docs/63-PLANO-MESTRE-ORGANIZACAO-QUALIDADE-BACKUP-PFSENSE-2026-06-08.md` | Plano mestre de organizacao, qualidade e backup pfSense. |
| `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md` | Especificacao tecnica do modulo de backup do `config.xml`. |
| `docs/RELEASE-PACKAGE-PFSENSE-AUTOMATICO.md` | Release do package, config/package-release.env, API. |
| `docs/COMANDO-ATUALIZAR-PACKAGE-PFSENSE.md` | Comando de instalação/atualização no pfSense, generate-install-command.sh. |
| `docs/INSTALACAO-AGENTE-PFSENSE.md` | Procedimento de instalação do agente no pfSense. |
| `docs/CADASTRO-E-COMANDOS-PFSENSE.md` | Cadastro, comandos e testes no pfSense. |

---

## 8. Diretriz para backup do config.xml

O modulo de backup do pfSense ainda nao esta implementado. A decisao atual e:

- pfSense envia backup por `push`, usando o package atual como base
- endpoint novo deve reutilizar autenticacao HMAC por node
- `config.xml` nunca deve ser salvo puro no PostgreSQL nem em disco persistente
- backup deve ser criptografado em repouso com chave separada de `NODE_SECRET_ENCRYPTION_KEY_BASE64`
- download deve exigir RBAC e auditoria, inicialmente apenas `superadmin`
- restore automatico no pfSense fica fora do primeiro MVP
- antes de codar, sanear publicacao/origem interna e limite de upload conforme o plano mestre

---

*Última atualização: 2026-06-08 — adicionados indice operacional, plano mestre e especificacao do modulo de backup pfSense.*
