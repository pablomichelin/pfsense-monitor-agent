# Comando para atualizar o package no pfSense

Sempre que for preciso instalar ou atualizar o package do SystemUp Monitor em um pfSense (Diagnostics > Command Prompt), use o comando **one-shot** abaixo.

**Procedimento completo e forma correta:** ver `docs/INSTALACAO-AGENTE-PFSENSE.md`.

## Gerar comando automaticamente (no servidor)

No servidor do projeto, o comando completo (com o **secret real** do node) é gerado pela API. Execute:

```bash
cd /opt/Monitor-Pfsense
./scripts/generate-install-command.sh [NODE_UID] [normal|light]
```

Exemplo para Lasalle Agro:

```bash
./scripts/generate-install-command.sh lasalle-agro normal
```

A saída é o comando pronto para copiar e colar no Command Prompt do pfSense. O comando **roda a instalação em segundo plano** para o Command Prompt da GUI retornar na hora (evita carregamento infinito). Acompanhe o progresso com: `tail -f /tmp/monitor-install.log`. Requer `curl` e `jq`; usa credenciais de `.env.api` para login na API e obtém o secret ativo do node.

### Escolha do modo

- `normal`: envia serviços e gateways em todo heartbeat
- `light`: envia só métricas e reaproveita o último estado conhecido

Exemplos:

```bash
./scripts/generate-install-command.sh fw-qlnctag7 normal
./scripts/generate-install-command.sh fw-qlnctag7 light
```

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
fetch -o /tmp/install-from-release.sh INSTALLER_SCRIPT_URL && chmod +x /tmp/install-from-release.sh && /tmp/install-from-release.sh --release-url ARTIFACT_URL --sha256 SHA256 --controller-url https://pfs-monitor.systemup.inf.br --node-uid NODE_UID --node-secret NODE_SECRET --customer-code CUSTOMER_CODE --heartbeat-mode normal < /dev/null
```

Substitua:

- **VERSAO** – versao do artefato (ex.: 0.1.7)
- **SHA256_DO_ARTEFATO** – saida de `sha256sum dist/pfsense-package/monitor-pfsense-package-vVERSAO.tar.gz` ou do arquivo `.sha256` apos o build
- **NODE_UID** – UID do node no painel (ex.: lasalle-agro)
- **NODE_SECRET** – secret do node (detalhe do firewall no painel; use Rekey se precisar gerar novo)
- **CUSTOMER_CODE** – codigo do cliente (ex.: lasalle-agro)

## Versão atual do client e versão exibida no painel

- **Comando de instalação:** versão e SHA256 vêm de `config/package-release.env` (atualizado pelo script de release). Ver **`docs/RELEASE-PACKAGE-PFSENSE-AUTOMATICO.md`**.
- **Versão do agente no painel:** vem **do cliente** (heartbeat). O agente lê `AGENT_VERSION` do config em `/usr/local/etc/monitor-pfsense-agent.conf` e envia no heartbeat; a API só grava o que recebe. Se o painel mostrar versão antiga após atualizar o package, no firewall rode:  
  `php -f /usr/local/share/pfSense-pkg-systemup-monitor/systemup_monitor_cli.php sync`  
  para regerar o config com a versão atual. Ver **`docs/DIRETRIZES-E-FUNCIONAMENTO.md`**.
- **Diagnóstico no pfSense:** Services → SystemUp Monitor → Diagnóstico exibe a linha "Versão do agente" (valor da constante do package). Heartbeats a cada 30s em background.

---

## Como atualizar clientes já instalados

Para firewalls que **já têm o package instalado** (qualquer versão anterior), use o **mesmo fluxo** do comando one-shot, mas com a **nova versão** do artefato (URL e SHA256).

### No servidor (uma vez por nova versão)

1. Gerar o artefato da nova versão e o SHA256:

```bash
cd /opt/Monitor-Pfsense
./scripts/build-pfsense-package-artifact.sh 0.2.1
cat dist/pfsense-package/monitor-pfsense-package-v0.2.1.tar.gz.sha256
```

2. Publicar no repositório:
   - `dist/pfsense-package/monitor-pfsense-package-v0.2.1.tar.gz`
   - `dist/pfsense-package/monitor-pfsense-package-v0.2.1.tar.gz.sha256`
   - `packages/pfsense-package/bootstrap/install-from-release.sh` (atualizado se houve mudança)

3. O script `generate-install-command.sh` já usa a versão atual (0.2.1). Se precisar de outra versão, edite a variável `VERSION` no script ou use o comando manual abaixo.

### Em cada cliente (pfSense já com o package)

- **Opção A — Comando gerado no servidor (recomendado)**  
  No servidor, gere o comando com o node do cliente e cole no **Command Prompt** do pfSense:

```bash
./scripts/generate-install-command.sh NODE_UID
```

  Use o mesmo `NODE_UID` que o firewall já tem (ex.: `lasalle-agro`). O comando baixa o artefato **0.2.1**, valida o SHA256, reinstala os arquivos do package e **mantém a configuração já salva** no pfSense (controller, node_uid, secret, etc.). Depois, reinicie o serviço se quiser garantir:

```bash
/usr/sbin/service monitor_pfsense_agent restart
```

- **Opção B — Comando manual**  
  Monte o comando igual ao da instalação, trocando apenas a versão na URL e o SHA256 pelo da nova versão (ex.: 0.2.1). Mesmos parâmetros de `--controller-url`, `--node-uid`, `--node-secret`, `--customer-code` (e `--enable` se quiser). O script de instalação sobrescreve apenas os arquivos do package; a configuração no pfSense (config.xml) permanece.

### Resumo

| Passo | Quem | O quê |
|-------|------|--------|
| 1 | Servidor | `./scripts/build-pfsense-package-artifact.sh 0.2.1` e publicar artefato + SHA256 |
| 2 | Servidor | `./scripts/generate-install-command.sh NODE_UID` para cada cliente |
| 3 | Cliente (pfSense) | Colar o comando no Command Prompt (igual à instalação, com nova versão) |
| 4 | Cliente (opcional) | `service monitor_pfsense_agent restart` |

Não é necessário desinstalar antes: rodar o one-shot com a nova versão **atualiza** os arquivos e preserva a configuração.

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
