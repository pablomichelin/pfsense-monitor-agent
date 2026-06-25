# 110 — Plano de correção: falhas pós-auditoria (P1–P9 · A1–A4 · C1–C6 · W1–W4)

**Data:** 2026-06-24  
**Status:** ✅ Entregue (doc 111)  
**Continua após:** [109-MELHORIAS-VISUAIS-POS-AUDITORIA-108-2026-06-24.md](./109-MELHORIAS-VISUAIS-POS-AUDITORIA-108-2026-06-24.md)  
**Origem dos achados:** auditoria read-only 2026-06-24 + hotfix [109-HOTFIX-ADMIN-PACKAGE-UPDATE-2026-06-24.md](./109-HOTFIX-ADMIN-PACKAGE-UPDATE-2026-06-24.md)  
**Referências:** [101-ENTREGA-CORRECOES-AUDITORIA-SEGURANCA-PFSENSE-2026-06-23.md](./101-ENTREGA-CORRECOES-AUDITORIA-SEGURANCA-PFSENSE-2026-06-23.md) · [108-AUDITORIA-VISUAL-STITCH-2026-06-24.md](./108-AUDITORIA-VISUAL-STITCH-2026-06-24.md) · [106-HOTFIX-ADMIN-NAV-MODAL-PORTAL-2026-06-24.md](./106-HOTFIX-ADMIN-NAV-MODAL-PORTAL-2026-06-24.md)

---

## 0. Inventário mestre (23 itens — nenhum pode ficar de fora)

> **Contagem:** P1–P9 (9) + A1–A4 (4) + C1–C6 (6) + W1–W4 (4) = **23**.

| ID | Sev. | Componente | Resumo | Fase | WS |
|----|------|------------|--------|------|-----|
| **P1** | Alto | Package | Privilégio de página ≠ admin para `package_update` | 1 | WS-P |
| **P2** | Médio | Package | Rate-limit 24h gravado antes do spawn | 1 | WS-P |
| **P3** | Médio | Package | Race lock update (check + acquire) | 1 | WS-P |
| **P4** | Médio | Package | Lock stale 2h libera com installer ativo | 1 | WS-P |
| **P5** | Médio | Package | POST `package_update` em Backup/Diagnóstico | 1 | WS-P |
| **P6** | Baixo | Package | CSRF fail-open sem `csrf_check` | 2 | WS-P |
| **P7** | Baixo | Package | Admin check fail-open sem helpers pfSense | 2 | WS-P |
| **P8** | Baixo | Package | `backup_now` sem check admin | +2 | WS-P |
| **P9** | Baixo | Docs | Doc 101/E2 desatualizado (rate-limit in-memory) | 4 | WS-D |
| **A1** | Médio | Agente | Lock backup órfão (`mkdir` sem stale) | 2 | WS-A |
| **A2** | Médio | Agente | Lock upgrade pfSense OS sem stale | 2 | WS-A |
| **A3** | Baixo | Agente | `NODE_SECRET` fallback legado no `.conf` | 3 | WS-A |
| **A4** | Baixo | Docs/Web | Upgrade OS semi-manual — validar/complementar docs + tooltip UI | 4 | WS-D (+ WS-W leve) |
| **C1** | Médio | API | `clients.create` UI vs escopo global API | 2 | WS-C |
| **C2** | Médio | API | MFA enforcement suave (login sem bloqueio) | 3 | WS-C |
| **C3** | Baixo | API | Rate-limit release fail-open se PG cair | 2 | WS-C |
| **C4** | Baixo | API | Cache RBAC in-memory — **parcialmente resolvido** (invalidação em mutação); validar + documentar TTL/multi-instância | 3 | WS-C |
| **C5** | Baixo | API | Cache `/nodes/filters` — **parcialmente resolvido** (invalidação em CRUD client/site/node); validar cobertura + documentar | 3 | WS-C |
| **C6** | Baixo | API | Audit backup usa `CF-Connecting-IP` direto | 2 | WS-C |
| **W1** | Médio | Web | Middleware sem `firewalls.view` em dashboard/nodes | 2 | WS-W |
| **W2** | Baixo | Web | Tratamento 403 inconsistente entre rotas | 2 | WS-W |
| **W3** | Baixo | Web | `/admin` visível com `clients.create` (par C1) | 2 | WS-W |
| **W4** | Baixo | Web | Banner MFA sem bloquear navegação (par C2) | 3 | WS-W |

**Versões-alvo pós-entrega:**

| Componente | Atual (ref.) | Alvo |
|------------|--------------|------|
| Package pfSense | 0.4.2 | **0.4.3** |
| API NestJS | 0.6.0 | **0.6.1** (ou 0.7.0 se C2 hard enforcement for breaking) |
| Painel web | 1.4.1 | **1.4.2** (ou 1.5.0 se MFA hard block) |

---

## 1. Protocolo Multitask (novo chat limpo)

### 1.1 Ordem de leitura obrigatória

1. `/Dados/Monitor-Pfsense/LEITURA-INICIAL.md`
2. `/Dados/Monitor-Pfsense/CORTEX.md`
3. **Este arquivo** (`docs/110-PLANO-CORRECAO-FALHAS-AUDITORIA-POS-109-2026-06-24.md`)
4. `docs/109-HOTFIX-ADMIN-PACKAGE-UPDATE-2026-06-24.md` (contexto P1)

### 1.2 Regras de execução

- **Preservar hotfix 106:** portal em `confirm-dialog.tsx`, `key={pathname}` em `app-shell-layout.tsx`, `admin/layout.tsx` pass-through — **não regredir**.
- **Preservar entrega 109 visual:** não reverter melhorias visuais salvo conflito técnico documentado.
- **Um item = um checkbox** na **seção 6** (checklist mestre); marcar ✅ só com critério de aceite atendido.
- **Commits (harmonizado com CORTEX):**
  - **Durante execução:** commits incrementais por workstream são permitidos e recomendados (ex.: `fix(package): P1 admin check`, `fix(web): W1 route-policy`).
  - **Ao encerrar entrega completa (doc 111):** conforme `CORTEX.md` — atualizar docs, **commit + push para `origin main`**, depois **`git pull origin main`** neste host.
- **Ao finalizar:** atualizar `LEITURA-INICIAL.md` (versões + próximo passo), `docs/HISTORICO-E-LINHA-DO-TEMPO.md`, criar `docs/111-ENTREGA-CORRECAO-FALHAS-AUDITORIA-110-2026-06-24.md`, bump versões, rodar smokes.

### 1.3 Workstreams paralelos (Multitask Mode)

| WS | Escopo | Itens | Pode rodar em paralelo com |
|----|--------|-------|----------------------------|
| **WS-P** | `packages/pfsense-package/` | P1–P8 | WS-A, WS-C, WS-W (após Fase 1 P1–P5) |
| **WS-A** | agente shell | A1–A3 | WS-C, WS-W |
| **WS-C** | `apps/api/` | C1–C6 | WS-W (C1↔W3 coordenados) |
| **WS-W** | `apps/web/` | W1–W4 | WS-C |
| **WS-D** | documentação + A4 | P9, A4 (docs/tooltip), handoff | sempre por último ou junto com entrega |

**Sequência recomendada:**

```
Fase 1 (bloqueante): WS-P → P1, P2, P3, P4, P5
Fase 2 (paralelo):    WS-P (P6,P7,P8) + WS-A (A1,A2) + WS-C (C1,C3,C6) + WS-W (W1,W2,W3)
Fase 3 (paralelo):    WS-A (A3) + WS-C (C2,C4,C5) + WS-W (W4) + WS-D (A4 validação docs)
Fase 4 (fechamento):  WS-D (P9) + release package + deploy + doc 111 + LEITURA-INICIAL
```

### 1.4 Prompts prontos para subagentes (copiar no chat limpo)

**Subagente WS-P (Package):**
```
Execute o plano docs/110-PLANO-CORRECAO-FALHAS-AUDITORIA-POS-109-2026-06-24.md — workstream WS-P.
Implementar P1, P2, P3, P4, P5, P6, P7, P8 nesta ordem. Arquivo principal: packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc.
Bump PORTVERSION/Makefile + SYSTEMUP_MONITOR_AGENT_VERSION para 0.4.3. Rodar ./scripts/release-pfsense-package.sh --no-push.
Marcar checkboxes na **seção 6** do doc 110. Não quebrar hotfix getUserEntry (desempacotar item).
```

**Subagente WS-A (Agente):**
```
Execute docs/110 — workstream WS-A. Implementar **A1, A2, A3** em monitor-pfsense-agent.sh e run_pfsense_upgrade.sh.
Padrão de lock: PID + timestamp + stale TTL; limpeza no start do agente. A3: migração segura NODE_SECRET para arquivo 0600.
(A4 é WS-D — docs/tooltip, não shell.)
```

**Subagente WS-C (API):**
```
Execute docs/110 — workstream WS-C. Implementar C1, C2, C3, C4, C5, C6.
C1: alinhar assertCanCreateClient com clients.create OU documentar decisão. C2: enforcement MFA quando MFA_ENFORCED_ROLES ativo; **estender GET /api/v1/auth/me** com mfaEnrollmentRequired (+ mfaEnforcementBlocking se blocking).
C4/C5: **validar** invalidação existente em admin.service.ts (não reimplementar do zero); documentar TTL/multi-instância residual.
C6: backups-ingest.controller.ts → resolveClientIp(). Testes unitários onde existirem padrões.
```

**Subagente WS-W (Web):**
```
Execute docs/110 — workstream WS-W. Implementar W1, W2, W3, W4.
W1: firewalls.view em route-policy para /dashboard, /nodes, /nodes/[id].
W2: helper compartilhado handleApiError (401→login, 403→/conta?denied=1 ou página sem permissão).
W4: depende de C2 — middleware lê mfaEnrollmentRequired de /auth/me (contrato a estender).
Preservar hotfix 106 (portal modal, key pathname).
```

**Subagente WS-D (Docs + entrega):**
```
Execute docs/110 — workstream WS-D. P9 + **A4** (validar/complementar docs upgrade OS + tooltip painel se gap) + criar docs/111-ENTREGA-... + atualizar HISTORICO + LEITURA-INICIAL + 00-INDICE se necessário.
Corrigir doc 101 E2 e A7 (rc.d). Rodar run-smoke-suite.sh se disponível.
```

---

## 2. Especificação por item

### WS-P — Package pfSense

#### P1 — Privilégio de página tratado como admin (Alto)

**Problema:** Hotfix 0.4.2 inclui `page-config_systemup_monitor`, `page-status_*`, `page-backup_*` em `systemup_monitor_current_user_is_admin()` — operador com acesso só às páginas SystemUp pode rodar `package_update`.

**Arquivos:**
- `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc` — `systemup_monitor_current_user_is_admin()` (~L1021)
- `systemup_monitor_render_config_update_action()` (~L2034) — esconder botão
- `systemup_monitor_handle_package_update_post()` (~L2003)

**Implementação:**
1. Redefinir `systemup_monitor_current_user_is_admin()` para retornar `true` **somente** se:
   - `userHasPrivilege($user, 'page-all')`, **ou**
   - `uid === '0'`, **ou**
   - membro do grupo `admins` (`getUserGroups()`).
2. **Remover** lista `$pagePrivs` da função admin (privilégios de página continuam valendo para **ver/editar** config via pfSense nativo, não para upgrade).
3. Manter desempacotamento `$userEntry['item']` (hotfix 0.4.2 — não regredir).
4. Em `systemup_monitor_render_config_update_action()`: só renderizar botão se `systemup_monitor_current_user_is_admin()`.

**Aceite:**
- [ ] Usuário pfSense com só `page-backup_systemup_monitor` → botão oculto + POST retorna `forbidden`
- [ ] Usuário `admin` / grupo `admins` / `page-all` → botão visível + update inicia
- [ ] LDAP/RADIUS admin via grupo `admins` → OK

**Teste manual:** criar usuário limitado no pfSense 2.7+; tentar POST crafted e botão GUI.

---

#### P2 — Rate-limit 24h antes do spawn (Médio)

**Problema:** `systemup_monitor_record_update_started()` (~L1992) roda **antes** de `systemup_monitor_run_command()` — falha no spawn bloqueia retry por 24h.

**Arquivos:** `systemup_monitor.inc` — `systemup_monitor_start_package_update()`, `systemup_monitor_record_update_started()`

**Implementação:**
1. Mover `systemup_monitor_record_update_started()` para **depois** de confirmar que o comando background foi enfileirado com sucesso (`exit_code === 0` do wrapper `nohup`).
2. Se spawn falhar: `systemup_monitor_release_update_lock()` **sem** gravar rate-limit.
3. Mensagem de erro distinta: "Falha ao iniciar processo de atualizacao (rate-limit nao aplicado)."
4. CLI `upgrade --force` continua ignorando rate-limit (já existe).

**Aceite:**
- [ ] Simular falha de spawn → segundo clique permitido dentro de 24h
- [ ] Spawn OK → rate-limit aplicado
- [ ] `--force` ignora rate-limit

---

#### P3 — Race no lock de update (Médio)

**Problema:** `systemup_monitor_is_update_running()` + `systemup_monitor_acquire_update_lock()` não são atômicos.

**Implementação:**
1. Usar lock exclusivo atômico: `fopen($lockFile, 'x')` ou `mkdir` exclusivo em dir temporário antes de escrever JSON.
2. Consolidar checagem + acquire em **uma** função `systemup_monitor_try_acquire_update_lock()`.
3. Segundo POST simultâneo → redirect `update_fail` com detail "Outra atualizacao ja em andamento."

**Aceite:**
- [ ] Dois POSTs paralelos → apenas um inicia; segundo recebe mensagem clara
- [ ] CLI + GUI simultâneos → mesmo comportamento

---

#### P4 — Lock stale libera installer ativo (Médio)

**Problema:** Após `SYSTEMUP_MONITOR_UPDATE_LOCK_STALE_SECONDS` (7200s), lock removido mesmo se `pgrep` ainda achar processo.

**Implementação:**
1. Antes de `@unlink($lockFile)` por stale: se `systemup_monitor_is_update_running()` → **não** remover; retornar "update em andamento".
2. Stale só quando: idade > TTL **e** nenhum processo installer/agente de update detectado **e** log sem atividade recente (opcional: mtime do log < 5min).
3. Documentar TTL em constante com comentário operacional.

**Aceite:**
- [ ] Update longo (>2h) não permite segundo update enquanto processo vivo
- [ ] Processo morto + lock velho → stale libera

---

#### P5 — POST package_update em Backup/Diagnóstico (Médio)

**Problema:** `systemup_monitor_setup_package_tabs()` chama `systemup_monitor_handle_package_update_post()` em **todas** as abas (~L68).

**Implementação (escolher uma — preferida A):**
- **A (preferida):** Remover `handle_package_update_post()` de `setup_package_tabs()`. Chamar **somente** em `config_systemup_monitor.php` antes do render.
- **B:** Dentro do handler, exigir `basename($_SERVER['SCRIPT_NAME']) === 'config_systemup_monitor.php'`.

**Arquivos:**
- `systemup_monitor.inc` — `setup_package_tabs()`, `handle_package_update_post()`
- `config_systemup_monitor.php` — adicionar chamada explícita
- `status_systemup_monitor.php`, `backup_systemup_monitor.php` — sem handler de update

**Aceite:**
- [ ] POST para `/backup_systemup_monitor.php` com `action=package_update` → ignorado ou 403
- [ ] POST para `/config_systemup_monitor.php` → funciona (admin)

---

#### P6 — CSRF fail-open (Baixo)

**Problema:** `systemup_monitor_csrf_validate_post()` retorna `true` se `csrf_check` não existir (~L997–1001).

**Implementação:**
1. Se método POST e `!function_exists('csrf_check')` → retornar `false` (fail-closed).
2. Log syslog opcional: "CSRF helper indisponivel; POST rejeitado."

**Aceite:**
- [ ] Em contexto GUI pfSense normal → sem regressão (csrf_check existe)
- [ ] Teste unitário/simulação sem helper → POST rejeitado

---

#### P7 — Admin check fail-open (Baixo)

**Problema:** Se `getUserEntry`/`userHasPrivilege` ausentes → retorna `true` (~L1023–1024).

**Implementação:**
1. Fail-closed para ações destrutivas/privilegiadas (`package_update`, futuro `backup_now` admin).
2. Fail-open **apenas** se `$username === ''` e contexto for CLI interno documentado — ou remover fail-open totalmente na GUI.

**Aceite:**
- [ ] Fora de guiconfig → update negado
- [ ] GUI pfSense normal → inalterado

---

#### P8 — backup_now sem check admin (Baixo)

**Problema:** `backup_systemup_monitor.php` L28–34 executa backup manual sem `is_admin`.

**Implementação:**
1. Antes de `backup_now`: `if (!systemup_monitor_current_user_is_admin())` → redirect `forbidden`.
2. Save de **configurações** de backup (agendamento) pode permanecer para quem tem acesso à página (decisão produto) **ou** exigir admin — **documentar escolha**; default: save permitido, `backup_now` admin-only.

**Aceite:**
- [ ] Usuário limitado salva agendamento → OK (se mantida decisão)
- [ ] Usuário limitado "Enviar backup agora" → forbidden

---

#### P9 — Doc 101/E2 desatualizado (Baixo) → WS-D

**Problema:** Doc 101 cita rate-limit in-memory; código usa PostgreSQL `package_release_rate_limits`.

**Implementação:** Atualizar `docs/101-ENTREGA-CORRECOES-AUDITORIA-SEGURANCA-PFSENSE-2026-06-23.md` seção E2 e `05-seguranca-e-endurecimento.md` se mencionar in-memory.

**Aceite:**
- [ ] Doc reflete PostgreSQL + fail-open C3 documentado como mitigação consciente

---

### WS-A — Agente shell

#### A1 — Lock backup órfão (Médio)

**Arquivo:** `packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/monitor-pfsense-agent.sh` — `backup_acquire_lock()` (~L1946)

**Implementação:**
1. Lock file com conteúdo `pid=… started_at=…` em vez de só `mkdir`.
2. Stale TTL: ex. 3600s — se PID morto ou idade > TTL, remover lock e re-adquirir.
3. No startup do agente (`main` / loop): `backup_cleanup_stale_lock()`.

**Aceite:**
- [ ] `kill -9` durante backup → próximo ciclo recupera em ≤ TTL
- [ ] Backup concorrente legítimo → segundo falha com mensagem clara

---

#### A2 — Lock upgrade pfSense OS sem stale (Médio)

**Arquivos:** `monitor-pfsense-agent.sh` — `dispatch_pfsense_upgrade()` (~L1432); `run_pfsense_upgrade.sh`

**Implementação:** Reutilizar helper genérico `agent_acquire_stale_lock(dir, ttl, label)` extraído de A1.

**Aceite:**
- [ ] Interrupção mid-upgrade → lock liberado após stale
- [ ] Upgrade legítimo em curso → bloqueia duplicata

---

#### A3 — NODE_SECRET fallback legado (Baixo)

**Arquivo:** `monitor-pfsense-agent.sh` (~L20–25), `systemup_monitor.inc` (sync secret)

**Implementação:**
1. On-read: se `.conf` tem `NODE_SECRET` e arquivo 0600 vazio → migrar para arquivo e limpar `.conf`.
2. Log único "secret migrated to runtime file".
3. Manter fallback **somente** uma release (0.4.3); marcar DEPRECATED em comentário para remoção 0.5.0.

**Aceite:**
- [ ] Node legado continua autenticando após upgrade
- [ ] Pós-migração `.conf` sem segredo em texto

---

#### A4 — Upgrade OS semi-manual — validar docs + tooltip (Baixo) → WS-D (+ WS-W leve)

**Contexto:** fluxo semi-manual já documentado em `docs/pfsense-package/00-GUIA-OPERACAO-PACKAGE.md` (~L119) e `docs/97-SPIKE-PFSENSE-UPGRADE-CE.md`. **Não** implementar lógica nova no agente shell.

**Implementação:**
1. **WS-D:** Revisar guias — confirmar que cobrem `MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=0`, ack → wrapper → reboot manual.
2. Complementar doc **somente** se gap encontrado na revisão.
3. **WS-W (leve):** Se existir ação de upgrade OS no painel (`nodes/[id]`), adicionar tooltip/disclaimer alinhado ao guia.

**Aceite:**
- [ ] Operador entende limitação sem abrir código
- [ ] Nenhuma alteração desnecessária em `monitor-pfsense-agent.sh` para A4

---

### WS-C — API NestJS

#### C1 — clients.create vs escopo global (Médio)

**Arquivos:**
- `apps/api/src/auth/access-policy.service.ts` — `assertCanCreateClient()` (~L73)
- `apps/api/src/admin/admin.controller.ts` — POST clients
- `apps/web/lib/route-policy.ts` — `/admin` requer `clients.create`

**Decisão recomendada (registrar no doc 111):**
- **Opção A (recomendada):** Criar cliente = operação **superadmin / escopo global** apenas. UI: trocar `/admin` cadastro para exigir permissão nova `clients.create_global` **ou** checar escopo global no middleware (via flag na sessão). Esconder cards de criação para admin escopado.
- **Opção B:** Relaxar API para quem tem `clients.create` — **não recomendado** (C4 auditoria).

**Implementação Opção A:**
1. API: manter `assertCanCreateClient` + mensagem clara.
2. Web W3: alinhar nav e rotas (ver W3).
3. Endpoint `auth/me` expor `hasGlobalClientScope: boolean` se necessário.

**Aceite:**
- [ ] Admin escopado com `clients.create` → não vê cadastro top-level / recebe 403 explicativo
- [ ] Superadmin → cria cliente OK

---

#### C2 — MFA enforcement suave (Médio)

**Arquivos:** `apps/api/src/auth/auth.service.ts` (~L170), `apps/api/src/auth/mfa.service.ts`, `apps/api/src/config/app-config.ts`, **`apps/api/src/auth/auth.controller.ts`** (`GET me` ~L176)

**Implementação:**
1. Quando `MFA_ENFORCED_ROLES` inclui role do usuário **e** `mfa_enabled=false`:
   - **Modo hard (flag `MFA_ENFORCEMENT_BLOCKING=true`):** login retorna 403 ou sessão limitada só `/conta` (escolher e documentar).
   - **Modo soft (default atual):** manter `mfaEnrollmentRequired` na resposta de login — coordenar com W4.
2. Guard NestJS `@RequireMfaEnrolled()` em rotas admin/destructivas quando blocking ativo.
3. **Contrato sessão (obrigatório para W4):** estender `GET /api/v1/auth/me` para incluir:
   - `mfaEnrollmentRequired: boolean`
   - `mfaEnforcementBlocking?: boolean` (quando blocking ativo)
   - Persistir flags na sessão server-side ou recalcular em `getSession()` a partir do user record.

**Aceite:**
- [ ] `/auth/me` expõe `mfaEnrollmentRequired` para middleware web
- [ ] Com blocking + role admin sem MFA → não acessa `/api/v1/admin/*`
- [ ] Com MFA ativo → fluxo normal
- [ ] Sem `MFA_ENFORCED_ROLES` → sem regressão

---

#### C3 — Rate-limit release fail-open (Baixo)

**Arquivo:** `apps/api/src/common/package-release-rate-limit.guard.ts` (~L56–64)

**Implementação:**
1. Fail-closed conservador: se PG indisponível → permitir **1 req/min/IP** via memória local de emergência (Map com TTL 60s), log warn.
2. Documentar trade-off em ENV.md.

**Aceite:**
- [ ] PG down → máx ~1 req/min/IP (não unlimited)
- [ ] PG up → comportamento atual PostgreSQL

---

#### C4 — Cache RBAC in-memory (Baixo) — parcialmente resolvido

**Arquivo:** `apps/api/src/auth/permissions.service.ts` (~L9, L17–18); invalidação em mutações: `apps/api/src/admin/admin.service.ts` (~L454)

**Estado atual:** `invalidateRoleCache()` já é chamado ao alterar matriz de permissões.

**Implementação (validar, não reimplementar):**
1. Confirmar que **todas** as mutações de `rolePermission` passam por `invalidateRoleCache`.
2. Adicionar TTL curto opcional (ex. 60s) como rede de segurança **ou** documentar que cache é per-instância.
3. Documentar limitação multi-instância (sem Redis); backlog se >1 réplica API.

**Aceite:**
- [ ] Auditoria de call sites de invalidação documentada no doc 111
- [ ] Alteração de permissão reflete em ≤ TTL ou imediato após save (single instance)

---

#### C5 — Cache nodes/filters (Baixo) — parcialmente resolvido

**Arquivo:** `apps/api/src/nodes/nodes.service.ts` (~L17, L46–54); invalidação em CRUD: `admin.service.ts` (~L1523, L1588, L1938)

**Estado atual:** `invalidateFiltersCache()` já é chamado em create/update/delete de client, site e node.

**Implementação (validar, não reimplementar):**
1. Confirmar cobertura completa de mutações que afetam filtros (grep `invalidateFiltersCache`).
2. Se gap encontrado, adicionar invalidação no call site faltante.
3. Documentar TTL residual (120s) e limitação multi-instância.

**Aceite:**
- [ ] Novo cliente aparece nos filtros sem esperar TTL (single instance)
- [ ] Gaps de invalidação listados no doc 111 (ou “nenhum gap”)

---

#### C6 — Audit backup IP spoofing (Baixo)

**Arquivo:** `apps/api/src/backups/backups-ingest.controller.ts` (~L84, L111, L140)

**Implementação:**
1. Substituir `readHeader(cf-connecting-ip) ?? request.ip` por `resolveClientIp(request)` (import de `common/client-ip.ts`).
2. Alinhar com `ingest.controller.ts`.

**Aceite:**
- [ ] Request com CF-Connecting-IP falso de peer não confiável → audit usa IP real do socket
- [ ] HMAC auth inalterado

---

### WS-W — Painel web

#### W1 — Middleware sem firewalls.view (Médio)

**Arquivo:** `apps/web/lib/route-policy.ts`

**Implementação:**
```typescript
{ pattern: /^\/dashboard(?:\/|$)/, requirement: { permissions: ['firewalls.view'] } },
{ pattern: /^\/nodes(?:\/|$)/, requirement: { permissions: ['firewalls.view'] } },
```
Incluir `/nodes/[id]` via regex `/^\/nodes(?:\/|$)/`.

**Aceite:**
- [ ] Usuário autenticado sem `firewalls.view` → redirect (middleware) antes de render
- [ ] Sidebar: ocultar Dashboard/Firewalls se sem permissão (ajustar `buildNavGroups`)

---

#### W2 — Tratamento 403 inconsistente (Baixo)

**Arquivos:** `apps/web/app/dashboard/page.tsx`, `apps/web/app/nodes/page.tsx`, `apps/web/app/nodes/[id]/page.tsx`, `apps/web/app/backups/page.tsx`

**Implementação:**
1. Criar `apps/web/lib/handle-page-api-error.ts`:
   - 401 → `redirect('/login')`
   - 403 → `redirect('/conta?access=denied')` ou página `/sem-permissao`
2. Usar em todas as server pages que chamam API protegida.

**Aceite:**
- [ ] 403 em dashboard/nodes → redirect amigável, não stack Next.js
- [ ] Comportamento igual em backups/alerts/audit/admin

---

#### W3 — /admin visível com clients.create (Baixo, par C1)

**Arquivos:** `route-policy.ts`, `buildNavGroups()`, `apps/web/app/admin/page.tsx`

**Implementação:**
1. Se Opção A de C1: nav Cadastro só para superadmin / escopo global.
2. Cards de criação em `/admin` condicionados a mesma regra.
3. Mensagem inline se usuário cair na rota sem escopo.

**Aceite:**
- [ ] Admin escopado não vê link Cadastro no menu
- [ ] URL direta `/admin` → redirect ou página "sem permissão"

---

#### W4 — Banner MFA sem bloqueio (Baixo, par C2)

**Arquivos:** `apps/web/middleware.ts`, `apps/web/app/conta/mfa-section.tsx`, layout shell; **dependência:** `GET /api/v1/auth/me` (C2)

**Pré-requisito:** `/auth/me` deve expor `mfaEnrollmentRequired` (e opcionalmente `mfaEnforcementBlocking`). Hoje retorna apenas `authenticated`, `session`, `user`, `permissions` — **W4 não funciona sem C2**.

**Implementação:**
1. Estender tipo `AuthMeResponse` em `middleware.ts` com campos MFA.
2. Se sessão tem `mfaEnrollmentRequired` e blocking ativo (C2): middleware redireciona rotas não-`/conta` → `/conta?mfa=required`.
3. Banner persistente em `mfa-section.tsx` até enrollment concluído (modo soft).

**Aceite:**
- [ ] Middleware consome campos MFA de `/auth/me`
- [ ] Admin enforced sem MFA + blocking → só navega conta até configurar
- [ ] Após enrollment → acesso normal

---

## 3. Matriz de dependências

```
P1 ──► release 0.4.3 (prioridade máxima)
P2,P3,P4 ──► podem ir no mesmo PR package
P5 ──► independente; combinar com P1 no mesmo inc
P6,P7 ──► package mesma release
P8 ──► usa função admin corrigida em P1

A1 ──► A2 reutiliza helper lock
A3 ──► independente; incluir no tarball 0.4.3

C1 ◄──► W3 (decisão conjunta)
C2 ◄──► W4 (enforcement + contrato /auth/me)
C6 ──► independente
C3,C4,C5 ──► independentes entre si

W1 ──► antes de W2 (middleware primeiro)
W2 ──► usa rotas de W1
```

---

## 4. Testes obrigatórios (Definition of Done global)

### 4.1 Package (pfSense 2.7+ lab)

| # | Cenário | Itens |
|---|---------|-------|
| T1 | admin GUI update package | P1,P2,P5 |
| T2 | usuário limitado tenta update | P1,P5,P8 |
| T3 | spawn fail + retry <24h | P2 |
| T4 | POST paralelo update | P3 |
| T5 | lock longo >2h | P4 |
| T6 | backup kill -9 recovery | A1 |

### 4.2 API + Web

| # | Cenário | Itens |
|---|---------|-------|
| T7 | admin escopado POST /admin/clients | C1,W3 |
| T8 | user sem firewalls.view /dashboard | W1 |
| T9 | 403 dashboard → redirect | W2 |
| T10 | MFA enforced blocking | C2,W4 |
| T11 | backup ingest audit IP | C6 |
| T12 | alterar permissão role | C4 |

### 4.3 Automação existente

```bash
cd /Dados/Monitor-Pfsense
./scripts/run-smoke-suite.sh          # se disponível
cd apps/web && npm run build
cd apps/api && npm test               # testes existentes
./scripts/release-pfsense-package.sh --no-push
```

---

## 5. Entregáveis finais (Fase 4)

### 5.1 Publicação package (fluxo canônico)

O script **`./scripts/release-pfsense-package.sh`** é o caminho oficial:

1. Build artefato → `dist/pfsense-package/monitor-pfsense-package-v0.4.3.tar.gz`
2. Atualiza `config/package-release.env` (`PACKAGE_RELEASE_VERSION`, `PACKAGE_RELEASE_SHA256`)
3. Commit + push para branch `main` → raw GitHub via `PACKAGE_RELEASE_REPO_RAW_BASE`

**`gh release create` não faz parte do script atual** — é opcional/backlog para tag formal em GitHub Releases. Firewalls consomem via raw URL + SHA256 (GUI ou one-shot).

Com `--no-push`: só build + config local (homologação).

### 5.2 Checklist de entrega

- [ ] Package **0.4.3** — artefato + `config/package-release.env` + push raw GitHub
- [ ] API bump + `docker compose up -d --build api`
- [ ] Web bump + `docker compose up -d --build web`
- [ ] `docs/111-ENTREGA-CORRECAO-FALHAS-AUDITORIA-110-2026-06-24.md` criado
- [ ] `docs/HISTORICO-E-LINHA-DO-TEMPO.md` atualizado
- [ ] `docs/00-INDICE-OPERACIONAL.md` — bloco "Última entrega"
- [ ] **`LEITURA-INICIAL.md`** — versões alvo (web 1.4.2+, package 0.4.3+, API 0.6.1+) e **próximo passo claro** (CORTEX exige)
- [ ] `CORTEX.md` / roadmap se versão mudou
- [ ] Correção doc 101 E2 + A7 (P9) + A4 guia upgrade OS (se gap na revisão)
- [ ] **Commit + push `origin main` + `git pull origin main`** (CORTEX)

> **Nota:** `LEITURA-INICIAL.md` está desatualizado hoje (cita web 1.4.0 / package 0.4.1; código real: web 1.4.1 / package 0.4.2). Corrigir na entrega 111.

---

## 6. Checklist mestre de conclusão (23/23)

Marque ✅ somente quando critério de aceite + teste correspondente passarem.

### Package (P1–P9)
- [x] **P1** — Admin check restrito; botão oculto para não-admin
- [x] **P2** — Rate-limit após spawn OK
- [x] **P3** — Lock atômico update
- [x] **P4** — Stale lock seguro
- [x] **P5** — Handler update só em config
- [x] **P6** — CSRF fail-closed
- [x] **P7** — Admin fail-closed
- [x] **P8** — backup_now admin-only
- [x] **P9** — Doc 101/E2 atualizado

### Agente (A1–A4)
- [x] **A1** — Lock backup com stale
- [x] **A2** — Lock upgrade OS com stale
- [x] **A3** — Migração NODE_SECRET
- [x] **A4** — Docs/tooltip upgrade OS validados (sem alteração shell desnecessária)

### API (C1–C6)
- [x] **C1** — RBAC create client alinhado
- [x] **C2** — MFA enforcement configurável
- [x] **C3** — Rate-limit fail-closed conservador
- [x] **C4** — Invalidação RBAC auditada + limitação multi-instância documentada
- [x] **C5** — Invalidação filters auditada + gaps corrigidos se houver
- [x] **C6** — resolveClientIp em backup ingest

### Web (W1–W4)
- [x] **W1** — firewalls.view no middleware
- [x] **W2** — 403 consistente
- [x] **W3** — Nav/admin alinhado C1
- [x] **W4** — MFA blocking UI (+ contrato `/auth/me`)

---

## 7. Riscos e não-regressões

| Risco | Mitigação |
|-------|-----------|
| Regressão hotfix getUserEntry | Manter `$userEntry['item']`; test T1 |
| Regressão modal admin (106) | Não alterar portal/z-index/key pathname |
| Regressão visual 109 | Smokes visuais e2e se existirem |
| MFA lockout admin legado | Blocking off por default; enrollment gradual |
| Package update quebra frota | Piloto 1 firewall antes de rollout massa |

---

## 8. Mensagem inicial sugerida (novo chat Multitask)

Copie e cole:

```
Leia /Dados/Monitor-Pfsense/docs/110-PLANO-CORRECAO-FALHAS-AUDITORIA-POS-109-2026-06-24.md e execute o plano completo (23 itens: P1–P9, A1–A4, C1–C6, W1–W4).

Modo Multitask: lance workstreams WS-P, WS-A, WS-C, WS-W em paralelo conforme fases 1–4 do doc 110. Preserve hotfix 106 e melhorias 109.

Ao concluir: marcar checklist seção 6 (23/23), criar doc 111, atualizar LEITURA-INICIAL, bump versões (package 0.4.3, api, web), release via release-pfsense-package.sh, commit+push+pull conforme CORTEX.
```

---

## 9. Revisão pós-veredito (2026-06-24)

Correções aplicadas nesta revisão:

| # | Correção |
|---|----------|
| 1 | Contagem **22 → 23** em todo o documento |
| 2 | Referência **seção 7 → seção 6** (checklist) |
| 3 | Commits harmonizados com **CORTEX** (incremental + push/pull na entrega) |
| 4 | Handoff inclui **`LEITURA-INICIAL.md`** + nota de desatualização |
| 5 | **A4** reclassificado: WS-D (docs/tooltip), removido de WS-A shell |
| 6 | **C4/C5** reclassificados: parcialmente resolvido — validar + documentar |
| 7 | **W4** exige contrato **`mfaEnrollmentRequired` em `/auth/me`** (C2) |
| 8 | Publicação package: fluxo **raw GitHub** via script; `gh release` opcional |

---

*Plano 110 — cobertura completa **23/23** achados. Pronto para execução em Multitask.*
