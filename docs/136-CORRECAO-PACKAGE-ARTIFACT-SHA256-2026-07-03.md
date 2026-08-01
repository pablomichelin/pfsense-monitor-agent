# 136 — Correção package-artifact SHA256 e limpeza smoke

**Data:** 2026-07-03  
**Status:** Corrigido em produção (API reconstruída e reiniciada)

---

## Sintomas reportados

1. Hosts antigos falhavam no upgrade com `fetch: size of remote file is not known` seguido de `SHA256 mismatch`.
2. SHA256 esperado (`2b6d2690…`) ≠ SHA256 do download (`e8c41fb9…`); artefato ~61 kB.
3. Clientes/usuários de smoke test permaneciam cadastrados após testes do plano 117.
4. Alguns firewalls ficaram offline após tentativa de upgrade.

---

## Causa raiz — SHA256 mismatch

| Item | Valor |
|------|-------|
| SHA256 em `config/package-release.env` (doc 135) | `2b6d26904010c2636be697640a663cf1b24e6f3ae30f33c8fcdb3cdea481b853` |
| SHA256 real do artefato servido em disco | `e8c41fb934439f766adcd36f6ee51842392976f83b72f8c8c961f53534ef7185` |

O doc 135 atualizou o checksum no config **sem regerar o tarball** ou vice-versa: a API lia o SHA256 do config mas servia o arquivo antigo em `dist/pfsense-package/`. Firewalls baixavam `e8c41fb9…` e validavam contra `2b6d2690…`.

**Contribuinte secundário:** o endpoint `GET /api/v1/agent/package-artifact` não enviava `Content-Length` (stream chunked). O `fetch` do pfSense/FreeBSD reporta *size of remote file is not known* antes da validação SHA256.

---

## Correções aplicadas

1. **Artefato regerado** (1ª passagem) — alinhamento config/disco; SHA256 intermediário `980d01e5…`.
2. **API** — `Content-Length` no download; guard `assertArtifactMatchesConfig()` bloqueia entrega se config ≠ arquivo (503 em vez de mismatch silencioso).
3. **Purge smoke** — `./scripts/purge-smoke-test-data.sh`: 24 clientes + 27 usuários de teste removidos; 19 nodes smoke excluídos.
4. **Container** `monitor-pfsense-api-1` reconstruído e reiniciado.
5. **Artefato regerado** (2ª passagem, 2026-07-03 tarde) — inclui fix `ensure_package_gui_registration` em `install.sh` (menu GUI ausente após bootstrap). SHA256 canônico atual: `bbbb35e80d2effab9f6ed8204c23d07bbee2a7a557e92dfc2e0a3a331d5dff1a` (62 051 bytes).
6. **`.env.api`** alinhado ao SHA256 final; API reiniciada.

---

## Linha do tempo do incidente (2026-07-02 noite → 2026-07-03)

| Quando | O quê |
|--------|-------|
| 2026-07-02 manhã | Commit `a3774ea` — release package 0.4.10 + deploy plano 117 (API/web rebuild) |
| 2026-07-02 tarde | Doc 135: alinhamento `.env.api` e `config/package-release.env` para 0.4.10 — **checksum `2b6d2690…` copiado sem regerar tarball** (ou tarball antigo `e8c41fb9…` permaneceu em `dist/`) |
| 2026-07-02 noite | Instalações/upgrades fleet-wide passam a falhar: `SHA256 mismatch` + `fetch: size of remote file is not known` (sem `Content-Length`) |
| 2026-07-03 manhã | 1ª correção SHA256 (`980d01e5…`); API com guard + Content-Length |
| 2026-07-03 tarde | 2ª regen do tarball com fix GUI; SHA256 final `bbbb35e8…` |

**Causa sistêmica:** desalinhamento config vs artefato introduzido na consolidação pós-plano 117 (doc 135), não regressão de HMAC/auth do agente.

---

## Hosts offline — diagnóstico (atualizado 2026-07-03 16:35 UTC-3)

| Grupo | Qtd | Causa provável |
|-------|-----|----------------|
| Smoke (RBAC, BST, LAB, …) | 19 | Removidos pelo purge |
| Produção 0.2.26–0.2.27 (WUSTRO, RECON, OFIZZI) | 3 | Heartbeat parou ~14:38–14:43 BRT 2026-07-03; verificar agente/rede local |
| Produção 0.4.10 (SUPER-GENTIL, ACREL, RENOVA) | 3 | Falha no upgrade remoto por SHA256 mismatch — reinstalar com SHA256 atual |
| CONTACENTER 0.2.27 | 1 | Offline desde 2026-06-29 (anterior ao incidente) |
| **HILE (fw-r0f5nver)** | — | **Online 0.4.10**; menu GUI ausente — reinstalar com artefato `bbbb35e8…` |

Frota produtiva: **50 online** (0.4.10), **7 offline/degraded** (excl. smoke removidos).

Não há evidência de regressão de heartbeat ou HMAC do plano 117. Os offline 0.4.10 coincidem com tentativas de upgrade na release desalinhada.

---

## Verificação pós-correção

```bash
curl -sI https://pfs-monitor.systemup.inf.br/api/v1/agent/package-artifact | grep -i content-length
# Content-Length: 62051

curl -s https://pfs-monitor.systemup.inf.br/api/v1/agent/package-release | jq .sha256
# bbbb35e80d2effab9f6ed8204c23d07bbee2a7a557e92dfc2e0a3a331d5dff1a

curl -s -o /tmp/pkg.tgz https://pfs-monitor.systemup.inf.br/api/v1/agent/package-artifact
sha256sum /tmp/pkg.tgz
# deve bater com o sha256 acima
```

`./scripts/smoke-agent-release.sh` — OK.

---

## Comando de reinstalação (qualquer node)

Obter o comando completo (com secret) no painel (**Node → Instalação**) ou no servidor:

```bash
cd /Dados/Monitor-Pfsense
./scripts/generate-install-command.sh <NODE_UID>
```

O SHA256 embutido no comando reflete automaticamente `config/package-release.env`.

---

## Passos manuais pendentes

1. **Firewalls offline 0.4.10** — reinstalar/atualizar manualmente via GUI (Services → SystemUp Monitor) ou comando bootstrap da página do node (SHA256 novo).
2. **Firewalls offline 0.2.x** — verificar conectividade e serviço `monitor_pfsense_agent` no pfSense antes de upgrade remoto.
3. **Commit** — alterações locais (config, dist, código API) ainda não commitadas; fazer push quando conveniente para manter raw GitHub alinhado se usado como fallback.
