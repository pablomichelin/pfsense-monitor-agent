# Comando para atualizar o package no pfSense

Sempre que for preciso instalar ou atualizar o package do SystemUp Monitor em um pfSense (Diagnostics > Command Prompt), use o comando **one-shot** abaixo.

**Procedimento completo e forma correta:** ver `docs/INSTALACAO-AGENTE-PFSENSE.md`.

## Gerar comando automaticamente (no servidor)

No servidor do projeto, o comando completo (com o **secret real** do node) é gerado pela API. Execute:

```bash
cd /opt/Monitor-Pfsense
./scripts/generate-install-command.sh [NODE_UID]
```

Exemplo para Lasalle Agro:

```bash
./scripts/generate-install-command.sh lasalle-agro
```

A saída é o comando pronto para copiar e colar no Command Prompt do pfSense. O comando **roda a instalação em segundo plano** para o Command Prompt da GUI retornar na hora (evita carregamento infinito). Acompanhe o progresso com: `tail -f /tmp/monitor-install.log`. Requer `curl` e `jq`; usa credenciais de `.env.api` para login na API e obtém o secret ativo do node.

### Se já instalou sem `--enable` (heartbeat só ao rodar manualmente)

No pfSense (Diagnostics > Command Prompt), execute para habilitar e iniciar o serviço:

```bash
/usr/sbin/sysrc monitor_pfsense_agent_enable=YES
/usr/sbin/service monitor_pfsense_agent start
```

Confirme que está rodando: `service monitor_pfsense_agent status`. A partir daí os heartbeats passam a ser enviados automaticamente a cada 30 segundos.

## Formato padrao

Comando **sem pipe** (evita travamento no Command Prompt do pfSense): baixa o script para `/tmp` e executa com stdin fechado.

```bash
fetch -o /tmp/install-from-release.sh INSTALLER_SCRIPT_URL && chmod +x /tmp/install-from-release.sh && /tmp/install-from-release.sh --release-url ARTIFACT_URL --sha256 SHA256 --controller-url https://pfs-monitor.systemup.inf.br --node-uid NODE_UID --node-secret NODE_SECRET --customer-code CUSTOMER_CODE < /dev/null
```

Substitua:

- **VERSAO** – versao do artefato (ex.: 0.1.7)
- **SHA256_DO_ARTEFATO** – saida de `sha256sum dist/pfsense-package/monitor-pfsense-package-vVERSAO.tar.gz` ou do arquivo `.sha256` apos o build
- **NODE_UID** – UID do node no painel (ex.: lasalle-agro)
- **NODE_SECRET** – secret do node (detalhe do firewall no painel; use Rekey se precisar gerar novo)
- **CUSTOMER_CODE** – codigo do cliente (ex.: lasalle-agro)

## Versao atual do client: **0.2.0**

Inclui PATH com /usr/local/bin no loop e rc.d, build_payload resiliente, e inicio explicito do servico apos o install. Heartbeats a cada 30s em background.

---

## Exemplo — Lasalle Agro (v0.1.7)

Use o comando gerado no servidor (`./scripts/generate-install-command.sh lasalle-agro`) para obter a linha com o secret real. Formato (sem pipe, para não travar no Command Prompt):

```bash
fetch -o /tmp/install-from-release.sh https://raw.githubusercontent.com/.../install-from-release.sh && chmod +x /tmp/install-from-release.sh && /tmp/install-from-release.sh --release-url ... --sha256 ... --controller-url ... --node-uid lasalle-agro --node-secret 'SEU_SECRET' --customer-code LASALLE-AGRO < /dev/null
```

**Importante:** use o **node-secret** exibido no painel (ou o comando completo gerado por `generate-install-command.sh`).

---

## Como gerar novo artefato e SHA256

No servidor do projeto:

```bash
cd /opt/Monitor-Pfsense
./scripts/build-pfsense-package-artifact.sh 0.1.7
cat dist/pfsense-package/monitor-pfsense-package-v0.1.7.tar.gz.sha256
```

Depois suba o `.tar.gz` (e opcionalmente o `.sha256`) para o repo no caminho `dist/pfsense-package/` e use a nova URL e o novo sha256 no comando acima.
