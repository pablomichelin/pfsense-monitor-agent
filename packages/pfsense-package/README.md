# pfSense Native Package

Pacote nativo do `SystemUp Monitor` para `pfSense CE 2.8.1`, estruturado como port FreeBSD/pfSense.

## O que existe aqui

- `Makefile`, `pkg-descr`, `pkg-plist` e scripts `pkg-install`/`pkg-deinstall`
- GUI do pacote em `Services > SystemUp Monitor`
- pagina local de diagnostico em `/status_systemup_monitor.php`
- runtime do agente empacotado no proprio package:
  - `/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh`
  - `/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent-loop.sh`
  - `/usr/local/etc/rc.d/monitor_pfsense_agent`

## Comportamento do pacote

- instala os binarios do agente no pfSense
- registra a GUI pelo framework oficial de package XML
- grava `/usr/local/etc/monitor-pfsense-agent.conf` a partir da configuracao salva no pacote
- habilita ou desabilita o servico `monitor_pfsense_agent` via `sysrc`
- reinicia o servico no `sync` quando o pacote esta habilitado e com configuracao minima valida
- filtra automaticamente a lista padrao de servicos para monitorar apenas itens habilitados ou configurados no `config.xml` do pfSense

Campos obrigatorios para o runtime:

- `controller_url`
- `node_uid`
- `customer_code`
- `node_secret`

## Build do pacote

Este diretorio agora pode ser usado como um port pfSense/FreeBSD.

Fluxo recomendado em um builder FreeBSD/pfSense compativel com `pfSense CE 2.8.1`:

```sh
cp -R /caminho/do/repositorio/packages/pfsense-package /usr/ports/sysutils/pfSense-pkg-systemup-monitor
cd /usr/ports/sysutils/pfSense-pkg-systemup-monitor
make package
```

O artefato gerado podera ser instalado no firewall com:

```sh
pkg add ./pfSense-pkg-systemup-monitor-0.1.1.pkg
```

Dependendo do builder, a extensao final pode sair como `.pkg` ou `.txz`.

## Instalacao one-shot via GitHub

Se a meta for colar uma linha no `Diagnostics > Command Prompt`, use o fluxo de release versionada:

1. gerar o artefato com `./scripts/build-pfsense-package-artifact.sh`
2. publicar no GitHub:
   - `monitor-pfsense-package-vX.Y.Z.tar.gz`
   - `monitor-pfsense-package-vX.Y.Z.tar.gz.sha256`
   - `packages/pfsense-package/bootstrap/install-from-release.sh`
3. o artefato pode ficar:
   - em uma GitHub Release
   - ou versionado direto no repositorio, por exemplo em `dist/pfsense-package/`
4. executar no pfSense:

```sh
fetch -o - https://raw.githubusercontent.com/SEU-USUARIO/SEU-REPO/main/packages/pfsense-package/bootstrap/install-from-release.sh | sh -s -- \
  --release-url https://raw.githubusercontent.com/SEU-USUARIO/SEU-REPO/main/dist/pfsense-package/monitor-pfsense-package-vX.Y.Z.tar.gz \
  --sha256 COLE_O_SHA256_AQUI \
  --controller-url https://pfs-monitor.systemup.inf.br \
  --node-uid NODE_UID \
  --node-secret NODE_SECRET \
  --customer-code CLIENTE \
  --enable
```

Esse fluxo instala os arquivos locais do pacote no pfSense e, quando os parametros sao informados, grava a configuracao do pacote e sobe o servico.

## Teste no pfSense

Depois do `pkg add`:

1. abrir `Services > SystemUp Monitor`
2. preencher `controller_url`, `node_uid`, `customer_code` e `node_secret`
3. marcar `Enable package`
4. salvar e aplicar
5. validar em `Status > SystemUp Monitor` ou abrindo `/status_systemup_monitor.php`
6. confirmar:
   - arquivo `/usr/local/etc/monitor-pfsense-agent.conf`
   - servico `monitor_pfsense_agent`
   - `test-connection`
   - primeiro heartbeat no controlador
