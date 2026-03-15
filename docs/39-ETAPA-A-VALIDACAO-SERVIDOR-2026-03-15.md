# Etapa A — Validação do Servidor/Controlador para Homologação do Pacote pfSense

**Data:** 2026-03-15  
**Objetivo:** Validar o lado servidor, artefato e comando antes de qualquer rodada em firewall real.  
**Escopo:** Apenas validação; nenhuma execução no pfSense real.

---

## 1. Resumo executivo

A validação do lado servidor foi executada conforme o plano técnico da trilha de homologação. O **generate-install-command.sh** funciona corretamente e gera o comando one-shot do pacote. O **verify-origin-contract** passou no domínio público. A **smoke suite** falhou em smoke-bootstrap-flow (esperado para fluxo de agente leve sem release_base_url). Os scripts **verify-bootstrap-release** e **run-bootstrap-preflight** validam o fluxo de **agente leve**, não o fluxo de **pacote pfSense** — falham porque release.ready=false.

**Bloqueio principal:** A API `GET /api/v1/admin/nodes/:id/bootstrap-command` retorna `package_command: null` mesmo com `PACKAGE_RELEASE_VERSION`, `PACKAGE_RELEASE_SHA256` e `PACKAGE_RELEASE_REPO_RAW_BASE` configurados. O **generate-install-command.sh** contorna isso usando lógica própria e produz o comando correto.

**Conclusão:** O servidor está **parcialmente pronto** para rodada real. O comando pode ser obtido via `./scripts/generate-install-command.sh lasalle-agro`. O painel pode não exibir o comando se a API continuar retornando `package_command: null`.

---

## 2. Comandos executados e resultados

### 2.1 Smoke suite

```bash
scripts/run-smoke-suite.sh
```

**Resultado:** Exit code 1 (falha em smoke-bootstrap-flow)

| Script | Resultado |
|--------|-----------|
| smoke-frontend-assets | OK |
| smoke-agent-release | OK |
| smoke-realtime-refresh | OK |
| smoke-auth-sessions | OK |
| smoke-bootstrap-flow | **Falha** em [3/7] |
| smoke-admin-operations | Não executado (suite para no primeiro falho) |
| smoke-rbac-roles | Não executado |

**Causa da falha:** smoke-bootstrap-flow valida o fluxo de **agente leve** (monitor-pfsense-agent). Espera que, sem `release_base_url` configurada, `release.ready=false` e a página mostre mensagem para configurar `AGENT_BOOTSTRAP_RELEASE_BASE_URL`. Com `PACKAGE_RELEASE_*` configurado mas sem agente, o comportamento pode divergir.

### 2.2 Variáveis PACKAGE_RELEASE_*

**Arquivo:** `.env.api`

| Variável | Valor confirmado |
|----------|------------------|
| PACKAGE_RELEASE_VERSION | `0.2.0` |
| PACKAGE_RELEASE_SHA256 | `62260cc8a2689b09720e3a8858fa398e857ceff03063de31a600e6d21d0c31bb` |
| PACKAGE_RELEASE_REPO_RAW_BASE | `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main` (adicionada explicitamente na validação) |

**Coerência:** SHA256 local (`dist/pfsense-package/monitor-pfsense-package-v0.2.0.tar.gz.sha256`) = valor em .env.api = valor no GitHub.

### 2.3 generate-install-command.sh

```bash
./scripts/generate-install-command.sh lasalle-agro
```

**Resultado:** Exit code 0. Comando gerado com sucesso.

**Comando gerado (resumo):**
- Versão: **0.2.0**
- Artefato: `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/dist/pfsense-package/monitor-pfsense-package-v0.2.0.tar.gz`
- SHA256: `62260cc8a2689b09720e3a8858fa398e857ceff03063de31a600e6d21d0c31bb`
- Controller: `https://pfs-monitor.systemup.inf.br`
- Node: `lasalle-agro`
- Formato: `fetch` + `chmod` + `nohup` + instalação em background

### 2.4 verify-origin-contract

```bash
BASE_URL="https://pfs-monitor.systemup.inf.br" \
  AUTH_EMAIL="admin@systemup.inf.br" \
  AUTH_PASSWORD="***" \
  ./scripts/verify-origin-contract.sh
```

**Resultado:** Exit code 0. Contrato validado.

- healthz: OK
- login e assets: OK
- limite 64k: OK
- stream SSE autenticado: OK (connected=1, keepalive=2, dashboard.refresh=1)

### 2.5 verify-bootstrap-release

```bash
AUTH_EMAIL="admin@systemup.inf.br" AUTH_PASSWORD="***" \
  BASE_URL="http://127.0.0.1:8088" \
  scripts/verify-bootstrap-release.sh 61d6ae1c-1ee7-478c-ab35-ac3258aa2d6d
```

**Resultado:** Exit code 1.

**Motivo:** Valida o fluxo de **agente leve**. `release.ready=false` (AGENT_BOOTSTRAP_RELEASE_BASE_URL não configurada). O script não valida `package_command`.

### 2.6 run-bootstrap-preflight

```bash
AUTH_EMAIL="admin@systemup.inf.br" AUTH_PASSWORD="***" \
  BASE_URL="http://127.0.0.1:8088" \
  scripts/run-bootstrap-preflight.sh 61d6ae1c-1ee7-478c-ab35-ac3258aa2d6d
```

**Resultado:** Exit code 1.

- [1/2] Smoke agent release: OK
- [2/2] verify-bootstrap-release: Falha (release.ready=false)

---

## 3. Artefato e URLs verificadas

| Item | Status |
|------|--------|
| Artefato v0.2.0 no GitHub | Acessível (HTTP 200) |
| Checksum .sha256 no GitHub | Acessível, valor coincide |
| install-from-release.sh no GitHub | Acessível |
| SHA256 local vs .env.api | Coerente |
| SHA256 local vs GitHub | Coerente |

**URLs confirmadas:**
- Artefato: `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main/dist/pfsense-package/monitor-pfsense-package-v0.2.0.tar.gz`
- Checksum: `https://raw.githubusercontent.com/.../monitor-pfsense-package-v0.2.0.tar.gz.sha256`
- Installer: `https://raw.githubusercontent.com/.../packages/pfsense-package/bootstrap/install-from-release.sh`

---

## 4. Divergências encontradas

### 4.1 API não retorna package_command

**Problema:** A API `GET /api/v1/admin/nodes/:id/bootstrap-command` retorna `package_command: null` mesmo com `PACKAGE_RELEASE_*` configurados no `.env.api` e no container.

**Impacto:** O painel pode não exibir o comando one-shot do pacote ao buscar o bootstrap da API.

**Mitigação atual:** `generate-install-command.sh` gera o comando independentemente da API, usando versão hardcoded (0.2.0) e SHA256 do arquivo local ou .env.

**Recomendação:** Investigar por que `admin.service.getBootstrapCommand` não popula `package_command` apesar das variáveis configuradas. Verificar se `appConfig.packageRelease` está sendo avaliado corretamente no runtime.

### 4.2 verify-bootstrap-release / run-bootstrap-preflight vs pacote

**Problema:** Esses scripts validam o fluxo de **agente leve** (monitor-pfsense-agent), não o fluxo de **pacote pfSense** (monitor-pfsense-package).

**Fluxo agente leve:** Requer `AGENT_BOOTSTRAP_RELEASE_BASE_URL`; usa `release.artifact_url`, `release.checksum_url`, `release.installer_url`, `command`.

**Fluxo pacote:** Usa `PACKAGE_RELEASE_*`; gera `package_command`; artefato é monitor-pfsense-package-vX.Y.Z.tar.gz.

**Recomendação:** Criar variante de verify/preflight para o fluxo de pacote, ou estender os scripts existentes para aceitar modo package quando PACKAGE_RELEASE_* estiver configurado.

### 4.3 smoke-bootstrap-flow

**Problema:** Smoke espera comportamento do fluxo de agente leve (sem release_base_url). Com PACKAGE configurado, o fluxo no painel/API pode divergir.

**Recomendação:** Avaliar smoke-bootstrap-flow à luz do fluxo de pacote; possivelmente ajustar expectativas ou criar smoke dedicado ao pacote.

---

## 5. Versão e artefato confirmados

| Campo | Valor |
|-------|-------|
| Versão do pacote | **0.2.0** |
| Artefato | `monitor-pfsense-package-v0.2.0.tar.gz` |
| SHA256 | `62260cc8a2689b09720e3a8858fa398e857ceff03063de31a600e6d21d0c31bb` |
| Repositório base | `https://raw.githubusercontent.com/pablomichelin/pfsense-monitor-agent/main` |
| Node Lasalle Agro ID | `61d6ae1c-1ee7-478c-ab35-ac3258aa2d6d` |

---

## 6. Bloqueios

| # | Bloqueio | Severidade | Pode ir ao pfSense? |
|---|----------|------------|---------------------|
| 1 | API retorna package_command null | Média | Sim, usar generate-install-command.sh |
| 2 | verify-bootstrap-release não cobre pacote | Baixa | Sim, validação manual de URLs |
| 3 | smoke-bootstrap-flow falha | Baixa | Sim, demais smokes passaram |

---

## 7. Aptidão para rodada em pfSense real

**Resposta:** **Sim, com ressalvas.**

- O comando one-shot correto é obtido via `./scripts/generate-install-command.sh lasalle-agro`.
- As URLs do artefato e do installer estão acessíveis.
- O checksum está coerente.
- O contrato do domínio público está ok.
- O painel pode ou não exibir o comando (depende da correção da API). Em caso de dúvida, usar o comando gerado pelo script.

---

## 8. Próximo passo recomendado

1. **Antes da rodada no pfSense:** Obter o comando com `./scripts/generate-install-command.sh lasalle-agro` e conferir node_uid/secret.
2. **Investigação (não bloqueante):** Descobrir por que a API retorna `package_command: null` e corrigir.
3. **Opcional:** Estender verify-bootstrap-release para validar o fluxo de pacote quando PACKAGE_RELEASE_* estiver configurado.
4. **Na rodada real:** Seguir `18-homologacao-pfsense-package-real-2026-03-13.md` e `17-checklist-homologacao-bootstrap-pfsense-real.md`.

---

## 9. Arquivos alterados nesta validação

- `.env.api` — Adicionada `PACKAGE_RELEASE_REPO_RAW_BASE` explicitamente (valor padrão do app-config).

---

## 10. Comandos de referência rápida

```bash
# Obter comando para Lasalle Agro
./scripts/generate-install-command.sh lasalle-agro

# Validar contrato domínio público
BASE_URL="https://pfs-monitor.systemup.inf.br" AUTH_EMAIL="..." AUTH_PASSWORD="..." \
  ./scripts/verify-origin-contract.sh

# Node ID Lasalle Agro
61d6ae1c-1ee7-478c-ab35-ac3258aa2d6d
```
