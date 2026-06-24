# 102 — Follow-up: alinhamento dos smokes pos-release 0.4.0

**Data:** 2026-06-24
**Versoes em producao:** API `0.4.0` · Painel web `1.2.0` · Package pfSense `0.4.0`
**Origem:** `docs/101-ENTREGA-CORRECOES-AUDITORIA-SEGURANCA-PFSENSE-2026-06-23.md`
**Escopo:** apenas scripts de smoke e o purge oficial — sem mudanca de runtime (API/web/package).

Apos a release 0.4.0 (auditoria de seguranca: C4 default-deny de escopo, B1 segredo
em arquivo, novo fluxo de package_command), tres smokes ficaram desalinhados com o
comportamento CORRETO e novo. Este follow-up registra o que foi ajustado e por que.
Nenhum assert foi enfraquecido: os smokes passaram a refletir o comportamento
pretendido da 0.4.0 (em alguns casos com asserts adicionais).

## Resultado

`scripts/run-smoke-suite.sh` — **13/13 verdes** (~34s). Stack 0.4.0 ja no ar
(`docker compose ps` saudavel); nenhum redeploy/rebuild. Zabbix nao foi tocado.

## Smokes alinhados

### 1. `scripts/smoke-rbac-node-detail.sh` — default-deny de escopo (C4)
- **Desalinhamento:** esperava HTTP 200 para `operator`/`readonly` sem escopo. Na
  0.4.0 o escopo RBAC e default-deny: usuario sem `UserClientScope` no cliente dono
  do node recebe 403 ("client out of scope").
- **Correcao:** `operator`/`readonly` agora nascem ja escopados no cliente do node
  (`client_ids`) para o caso 200; foi adicionado um terceiro ator `readonly` SEM
  escopo que valida o 403 (default-deny). Passos renumerados para `[1..7]/7`.
- **Intencao:** validar o comportamento real — com escopo → 200; sem escopo → 403;
  bootstrap segue restrito a admin.

### 2. `scripts/smoke-agent-release.sh` — contrato real do instalador 0.4.0 (B1/B7)
- **Desalinhamento:** usava o instalador legado `packages/pfsense-agent` (marcado
  DEPRECATED em B7, sem o contrato B1) e passava `--secret-file`, que aquele
  instalador nao aceita ("Unknown option: --secret-file"). O assert antigo
  `grep NODE_SECRET="..."` no `.conf` validava justamente o comportamento INSEGURO
  que o B1 eliminou.
- **Correcao:** o smoke passou a validar o instalador REAL do 0.4.0
  (`packages/pfsense-package/bootstrap/install-from-release.sh`) com o artefato
  `monitor-pfsense-package-v0.4.0.tar.gz`:
  - pin `--sha256` obrigatorio (teste negativo: sem `--sha256` falha);
  - contrato B1 do segredo: `MONITOR_UPDATE_NODE_SECRET` > `--secret-file` >
    `--node-secret` (legado, com aviso de depreciacao mantido por retrocompat);
    teste negativo: sem nenhum segredo o instalador falha;
  - runtime instalado le o segredo de `NODE_SECRET_FILE` (0600) e o `.conf` nao
    carrega o segredo em texto;
  - ciclo install/uninstall em `INSTALL_ROOT` temporario.
- **Intencao:** refletir que o segredo HMAC saiu do `.conf` em texto e passou a um
  arquivo 0600, e que o release entregue e o package nativo.

### 3. `scripts/smoke-bootstrap-flow.sh` — package_command e ativacao via heartbeat
- **Desalinhamento [3/7] e [5/7]:** esperava o nome versionado
  `monitor-pfsense-package-v0.4.0.tar.gz` no `package_command`/tela. Na 0.4.0 o
  comando serve o artefato pelo endpoint do controlador
  (`/api/v1/agent/package-artifact`), com pin `--sha256` do package e o contrato B1
  (`--secret-file` + setup do `.update-node-secret` 0600).
- **Desalinhamento [7/7]:** "simulava agente" via `POST /admin/nodes` com
  `agent_version`, mas esse campo e read-only (preenchido so pelo heartbeat) — o
  update administrativo o ignora. Agora o smoke envia um **heartbeat assinado por
  HMAC** (caminho real de ativacao), confirma `node_status=online`,
  `agent_version=0.1.0` no detalhe e o bucket "Agente ativo".
- **Drift de label:** `bucket=active` mudou de "agente ativo" para "Agente ativo"
  (web 1.2.0) — assert tornado case-insensitive.

### Bonus — `scripts/smoke-rbac-admin-ux.sh` (drift de label web 1.2.0)
- A pagina `/admin/permissoes` passou a usar acento: "Matriz de permissões".
  Assert alinhado ao texto real.

## Purge oficial estendido

`scripts/purge-smoke-test-data.sh` ganhou cobertura para os prefixos de cliente
`ADM`/`BST`/`LAB` e para os usuarios `admin-smoke`/`operator-nd`/`readonly-nd`/
`noscope-nd` (sufixo numerico ancorado — clientes/usuarios reais preservados).
Execucao ao final removeu o residue dos smokes; clientes reais intactos.

## Validacao

- `bash -n` em todos os scripts alterados — OK.
- `scripts/run-smoke-suite.sh` — 13/13 verde.
- `docker compose ps` — `api`/`web`/`db`/`nginx` saudaveis (0.4.0 ja no ar).
- Nenhuma operacao destrutiva no banco; sem `prisma migrate reset`.
