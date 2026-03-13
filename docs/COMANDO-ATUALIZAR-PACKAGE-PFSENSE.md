# Comando para atualizar o package no pfSense

Sempre que for preciso instalar ou atualizar o package do SystemUp Monitor em um pfSense (Diagnostics > Command Prompt), use o comando **one-shot** abaixo.

## Formato padrao

```bash
fetch -o - https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/packages/pfsense-package/bootstrap/install-from-release.sh | sh -s -- \
  --release-url https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/dist/pfsense-package/monitor-pfsense-package-vVERSAO.tar.gz \
  --sha256 SHA256_DO_ARTEFATO \
  --controller-url https://pfs-monitor.systemup.inf.br \
  --node-uid NODE_UID \
  --node-secret NODE_SECRET \
  --customer-code CUSTOMER_CODE
```

Substitua:

- **VERSAO** – versao do artefato (ex.: 0.1.7)
- **SHA256_DO_ARTEFATO** – saida de `sha256sum dist/pfsense-package/monitor-pfsense-package-vVERSAO.tar.gz` ou do arquivo `.sha256` apos o build
- **NODE_UID** – UID do node no painel (ex.: lasalle-agro)
- **NODE_SECRET** – secret do node (detalhe do firewall no painel; use Rekey se precisar gerar novo)
- **CUSTOMER_CODE** – codigo do cliente (ex.: lasalle-agro)

## Versao atual do client: **0.1.7**

Inclui correcao do loop do agente (heartbeat a cada 30s sem parar) e alteracoes da Fase B.

---

## Exemplo — Lasalle Agro (v0.1.7)

**Antes de usar:** publique o artefato `monitor-pfsense-package-v0.1.7.tar.gz` (e o `.sha256` se quiser) em `dist/pfsense-package/` no branch `main` do repo, para que a URL raw funcione.

```bash
fetch -o - https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/packages/pfsense-package/bootstrap/install-from-release.sh | sh -s -- \
  --release-url https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/dist/pfsense-package/monitor-pfsense-package-v0.1.7.tar.gz \
  --sha256 4b0ab135381ec8bf46bcacdd3687fda5a554bf5e866e47b7bfa6cf36aed9caba \
  --controller-url https://pfs-monitor.systemup.inf.br \
  --node-uid lasalle-agro \
  --node-secret SEU_NODE_SECRET_DO_PAINEL \
  --customer-code lasalle-agro
```

**Importante:** use o **node-secret** exibido no painel (detalhe do node Lasalle Agro). O secret tem digitos e letras; confira **0** (zero) vs **O** (letra). Se nao tiver o secret, use **Rekey** no painel e copie o novo.

---

## Como gerar novo artefato e SHA256

No servidor do projeto:

```bash
cd /opt/Monitor-Pfsense
./scripts/build-pfsense-package-artifact.sh 0.1.7
cat dist/pfsense-package/monitor-pfsense-package-v0.1.7.tar.gz.sha256
```

Depois suba o `.tar.gz` (e opcionalmente o `.sha256`) para o repo no caminho `dist/pfsense-package/` e use a nova URL e o novo sha256 no comando acima.
