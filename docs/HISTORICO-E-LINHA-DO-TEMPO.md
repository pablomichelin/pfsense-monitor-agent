# Histórico e linha do tempo — Monitor-Pfsense

Documento de referência do **que foi feito**, **por quê** e **o que não repetir**. Use para retomada do projeto e para evitar os mesmos erros.

**Última atualização:** 2026-08-23

---

### 2026-08-23 — Hotfix modal Apontar branch (painel 1.12.1)

- O `apiFetch` não dá mais `JSON.stringify` duas vezes no body (a API recusava `2.9.0` válido).
- O modal vai para `document.body` com z-index alto — o `backdrop-filter` do card de package não cobre mais os botões.

### 2026-08-23 — Firmware branch no update (API 0.11.0, painel 1.12.0, package 0.5.14)

- O agente reporta o train atual; o portal deixa de tratar 2.7.2 “atualizado” só como cache velho.
- **Apontar branch** (allowlist Latest / 2.8.1 / 2.9.0) usa as mesmas APIs da GUI (`pkg_repo_conf_path` + `pkg_switch_repo`), sem devel/snapshot.
- Ver `docs/175-ENTREGA-FIRMWARE-BRANCH-UPDATE-PFSENSE-2026-08-23.md`.

### 2026-08-23 — Reparo do repositório de update (API 0.10.11, painel 1.11.5, package 0.5.13)

- Check do OS trata lock órfão, `certctl rehash` e fallback IPv4; classifica o erro e manda o log oficial.
- Portal ganha **Reparar repositório** (receita Netgate de `pkg` / `pfSense-repo` / `pfSense-upgrade`), sem mexer em firmware branch.
- Ver `docs/174-ENTREGA-REPARO-REPO-UPDATE-PFSENSE-2026-08-23.md`.

### 2026-08-23 — Check do OS com repositório pkg fresco (API 0.10.10, painel 1.11.4, package 0.5.12)

- O agente passa a rodar `pfSense-upgrade -u` antes do `-c`, fora do HTTP do heartbeat, e invalida o cache v4 (falso “atualizado”).
- Portal ganha **Atualizar verificação**; o heartbeat devolve `force_update_check` até o agente rechecar.
- Ver `docs/173-ENTREGA-CHECK-OS-REPOSITORIO-STALE-2026-08-23.md`.

### 2026-08-23 — Saúde do box vs IPsec e técnico no 2.7.x (API 0.10.9, painel 1.11.3, package 0.5.11)

- Túnel IPsec sem SA deixa de degradar o node e o alerta passa a warning; o box deixa de parecer doente por peer/road warrior ocioso.
- `apply_local_user_password()` tenta wrapper 2.8+, array direto 2.7.x e bcrypt local — corrige `password hash missing after apply` na frota 2.7.
- Histórico não devolve senha do follow-up de backup; expire marca a conta `failed` e o controlador avisa comando `pending` > 90s.
- Ver `docs/172-ENTREGA-SAUDE-BOX-VS-IPSEC-E-TECNICO-2.7-2026-08-23.md`.

### 2026-08-20 — Reorganização visual concluída (painel 1.11.2)

- Shell responsivo com drawer mobile, Escape e foco; Administração agrupada; conta, sessões, tema e sair reunidos no menu do usuário.
- Dashboard com exceções primeiro; inventário com presets; alertas, backups e sessões compactados e paginados; login consolidado; matriz de permissões com modo de diferenças.
- Rotas, query strings, dados, ações e contratos de RBAC preservados; nenhuma alteração de backend, banco, autenticação, SSE ou package.
- Ver `docs/171-ENTREGA-REORGANIZACAO-VISUAL-PAINEL-1.11.2-2026-08-20.md` e plano `docs/170-PLANO-REORGANIZACAO-VISUAL-PAINEL-2026-08-20.md`.

### 2026-08-20 — Create de técnico deixava usuário órfão no Unix (package 0.5.10)

- `local_user_create` reescrevia `system/user` sem validar a lista e gravava o SO antes do `config.xml`; contas sumiam da GUI e a recriação dizia “reservado pelo sistema”.
- Varredura antes da publicação: o upgrade da frota passa por `install.sh` (não pelo `pkg-install`); `adopt_orphans` passou a rodar aí. Também: filtro de home `/home/...`, restauração do `admin` se sumiu do config, uid novo sem colidir com órfãos, delete Unix-primeiro.
- Ver `docs/170-CORRECAO-USUARIO-ORFAO-CREATE-LOCAL-USER-2026-08-20.md`.

### 2026-08-20 — Tema claro completo do painel (painel 1.11.0)

- Alternância Claro / Escuro / Sistema com tokens semânticos; tema escuro preservado; preferência só visual (`mp-theme-preference`).
- Ver `docs/169-ENTREGA-TEMA-CLARO-PAINEL-2026-08-20.md` e `docs/SISTEMA-VISUAL-PAINEL.md`.

### 2026-08-20 — UX P0 gestão de técnicos (painel 1.10.15)

- Abas Técnicos / Ação em lote; seleção por clique; modal de cadastro; layout em coluna; rótulos sem ambiguidade (cadastro vs firewalls).
- Ver `docs/168-ENTREGA-UX-P0-GESTAO-TECNICOS-2026-08-20.md`.

### 2026-08-20 — Backup automático antes do provisionamento (API 0.10.8, painel 1.10.14)

- Opção no lote (default ligada) enfileira `config_backup_now` quando falta backup recente e provisiona automaticamente após sucesso; outcome `backup_queued`.
- Ver `docs/167-ENTREGA-BACKUP-AUTOMATICO-ANTES-PROVISIONAMENTO-2026-08-20.md`.

### 2026-08-19 — Correção senha no provisionamento de técnicos (API 0.10.6, painel 1.10.12, package 0.5.9)

- Lote passa a **atualizar senha** se usuário já existe (upsert create/reset); `account_id` no payload; reconciliação corrigida; agente valida hash antes de `ok:true`; proteção contra reentrega sem senha.
- Ver `docs/166-ENTREGA-CORRECAO-SENHA-PROVISIONAMENTO-TECNICOS-2026-08-19.md`.

### 2026-08-01 — Ordenação por colunas no inventário (API 0.10.5, painel 1.10.11)

- Cabeçalhos Status/Firewall/Versão/Pacote/Backup/Alertas clicáveis (asc/desc); API com novos `sort_by`.
- Ver `docs/165-ENTREGA-ORDENACAO-COLUNAS-INVENTARIO-2026-08-01.md`.

### 2026-08-01 — Exclusão real do cadastro de técnicos (API 0.10.4, painel 1.10.10)

- `DELETE /technicians/:id` passa a hard-delete (some da matriz); listagem default só ativos; limpeza dos soft-deletes Hotspot/Osmarildo.
- Ver `docs/164-ENTREGA-EXCLUSAO-REAL-CADASTRO-TECNICOS-2026-08-01.md`.

### 2026-08-01 — Backup ligado por padrão (package 0.5.8, painel 1.10.9)

- Default `config_backup_enabled=on` + remoto on; pedido remoto recusado agora falha com mensagem (não expira em silêncio); correção do `if !` em `backup_scheduled`.
- Motivo: frota inteira com backup off → “Solicitar backup” no portal expirava sem erro.
- Ver `docs/163-ENTREGA-BACKUP-PADRAO-LIGADO-PACKAGE-0.5.8-2026-08-01.md`.

### 2026-08-01 — UX despoluição P0 inventário (painel 1.10.8)

- `/nodes` mais legível: colunas Criticidade/Tags/Instalação saíram da tabela (inline condicional); soma `min-w` 90rem → 61rem; filtros em `<details>`; lote só com seleção + backup por filtro explícito.
- Motivo: reduzir carga cognitiva do operador/técnico sem regredir Versão pfSense, Acesso remoto nem backup `mode=filter`.
- Plano `docs/161-...md`; entrega `docs/162-...md`. P1/P2 pendentes.

### 2026-08-01 — Proteção absoluta do usuário admin pfSense (API 0.10.3, painel 1.10.7, package 0.5.7)

- `admin`/`root` nunca cadastrados nem gerenciados: DTO, validação, serviço (revalida DB), enqueue e agente (reserved + uid 0 / scope system / nome canônico).

### 2026-08-01 — Delete de técnico desabilitado (API 0.10.2)

- `userExistsInSnapshot` exigia `!disabled`, então excluir conta desativada retornava “Usuário não encontrado no firewall”. Agora existência inclui desabilitados; “já ativo” continua em `userAlreadyActiveInSnapshot`.

### 2026-08-01 — Excluir técnico + privilégio sem User Manager (package 0.5.6, painel 1.10.6)

- UI: aba **Excluir** com delete como padrão (desativar secundário).
- Package: privilégio `page-systemup-technician-admin` — GUI ampla sem User/Group Manager; senha própria via passwordmg.
- Contas antigas com `page-all` precisam ser recriadas após upgrade 0.5.6. Ver `docs/158-...md`.

### 2026-08-01 — Package 0.5.5: técnicos habilitados por padrão

- Default do agente mudou de off → **on** (`technician_accounts_enabled`); checkbox na GUI SystemUp Monitor; shell fallback `:-1`.
- Motivo: teste no voner falhou com `technician accounts disabled on agent` porque a flag fail-closed não tinha UI e vinha desligada.
- Package **0.5.5**, painel **1.10.5**. Ver `docs/157-ENTREGA-PACKAGE-0.5.5-TECNICOS-PADRAO-LIGADO-2026-08-01.md`.

### 2026-08-01 — Mensagem PT-BR: técnicos desligados no agente (painel 1.10.4)

- Erro `technician accounts disabled on agent` (flag fail-closed no package) agora aparece traduzido no resultado do lote.

### 2026-08-01 — Técnicos usam seleção da tabela em `/nodes` (painel 1.10.3)

- Provisionar/resetar/revogar na seleção deixou de cair automaticamente em “todos do filtro”; usa os checkboxes do inventário (mesmo mecanismo do upgrade de package).
- Sem seleção: aviso claro + cadastro + opção de revogar em toda a frota. Painel **1.10.3**.

### 2026-08-01 — Senha mínima de técnico: 10 caracteres (API 0.10.1, painel 1.10.2)

- Mínimo de senha manual em provisionar/reset reduzido de 12 para **10** caracteres (API + validação do painel). Campo vazio continua gerando senha automaticamente.

### 2026-08-01 — Correção crash Server Action na gestão de técnicos (painel 1.10.1)

- Provisionar técnico em `/nodes` derrubava a página com banner genérico de Server Components; log real: `password must be 12-64 characters`.
- Causa: Server Actions lançavam `ApiError` (Next.js 15 transforma em falha de RSC) + senha curta (muitas vezes autofill) rejeitada pela API sem feedback amigável.
- Correção: actions com `{ ok, error }`, validação client-side, mensagens PT-BR, anti-autofill no campo de senha. Painel **1.10.1**. Ver `docs/156-CORRECAO-SERVER-ACTION-GESTAO-TECNICOS-2026-08-01.md`.

### 2026-07-31 — Validação E2E real: `local_user_set_password()` exigia wrapper de item (package 0.5.4)

- Validação cautelosa e autorizada contra pfSense de produção real (`192.168.100.254`, Plus `26.03.1`), com usuário descartável, backup prévio e limpeza total ao final, para confirmar em campo o fix de UID da entrega anterior (`0.5.3`).
- **[Crítico, novo achado]** `local_user_set_password()` do pfSense nessa versão espera o usuário empacotado como `{'item': $user}`; o agente passava `$user` direto. Resultado: o hash de senha era gravado incorretamente e a conta Unix (`pw useradd`/`usermod`) nunca era sincronizada — o usuário "criado" ficava com UID correto no `config.xml` mas sem acesso real (login falhava). Bug **independente** do fix de UID anterior, só visível testando contra pfSense real.
- Corrigido com `apply_local_user_password()` em `manage_local_user.php`, encapsulando o array antes de chamar a função nativa do pfSense. Revalidado do zero: create → set_password → delete confirmados no `config.xml` e no SO (login funcional, depois removido sem deixar rastro).
- Package **0.5.4**. Entrega: `docs/155-VALIDACAO-E2E-LOCAL-USER-CREATE-PFSENSE-254-2026-07-31.md`.

### 2026-07-31 — Página `/admin/tecnicos` + gate de backup recente (API 0.10.0, painel 1.10.0, package 0.5.4)

- **Painel:** nova rota `/admin/tecnicos` (Fase 3 do plano 144) — matriz técnico × firewall (expansível), navegação admin, e reaproveita `FleetTechnicianManagementPanel` (`mode: 'filter'`) para cadastro/lote sem duplicar lógica.
- **Painel + API:** indicador "técnicos com acesso" no detalhe do firewall (`/nodes/[id]`), consumindo novo endpoint `GET /api/v1/nodes/:id/technician-accounts` (`technicians.view`).
- **Guardrail:** gate de backup recente de `config.xml` antes de qualquer escrita de usuário local (create/set_password/disable/delete), individual ou em lote. Decisão de design: exigir **sempre** (não só "na primeira escrita") — mais simples e igualmente seguro. Flags `TECHNICIAN_ACCOUNT_REQUIRE_RECENT_BACKUP_ENABLED` (default `true`) e `TECHNICIAN_ACCOUNT_REQUIRE_BACKUP_MAX_AGE_HOURS` (default `168`).
- Entrega: `docs/154-ENTREGA-ADMIN-TECNICOS-GATE-BACKUP-2026-07-31.md`.

### 2026-07-31 — Auditoria e correções: gestão de técnicos (API 0.9.0, painel 1.9.0, package 0.5.3)

- **[Crítico]** `payload_json` do histórico/detalhe de comando (`firewalls.view`, mais amplo que `technicians.manage`) vazava a senha em texto claro de `local_user_create`/`local_user_set_password` enquanto o comando estava `pending`. Corrigido: `serializeCommand()` sempre varre a senha desses tipos, não só no `picked_up`.
- **[Crítico]** `manage_local_user.php::handle_create()` nunca atribuía `uid`/incrementava `system/nextuid` ao criar usuário — risco real de falha silenciosa no provisionamento (nunca testado E2E contra pfSense real). Corrigido com `allocate_next_local_uid()`, seguindo o padrão da GUI do pfSense.
- **[Médio]** Validadores (`validatePfsenseUsername`, `validateTechnicianPassword`, etc.) lançavam `Error` genérico → 500 em vez de 400 em erros de validação comuns (senha curta, login reservado). Corrigido para `BadRequestException`.
- **[Médio]** Login revogado bloqueava recadastro para sempre; agora reativa o técnico existente.
- **[Médio]** Provisionar/resetar senha em lote não exigia confirmação (ao contrário de revogar); adicionado `confirm: "CONFIRMAR"` obrigatório na API e etapa de confirmação no painel.
- **[Baixo]** `userExistsInSnapshot` tinha default fail-open inconsistente com `userAlreadyActiveInSnapshot`; alinhado para fail-closed.
- Entrega: `docs/153-AUDITORIA-CORRECOES-GESTAO-TECNICOS-2026-07-31.md`.

### 2026-07-31 — Senha gerada visível + exclusão cadastro técnicos (API 0.8.5, painel 1.8.1)

- Card destacado com `password_display_once` e botão copiar após provision/reset em lote.
- `DELETE /api/v1/technicians/:id` — soft-delete do cadastro central (`status=revoked`), sem afetar firewalls.
- Entrega: `docs/152-ENTREGA-SENHA-GERADA-EXCLUSAO-CADASTRO-TECNICOS-2026-07-31.md`.

### 2026-07-31 — Ciclo de vida técnicos: provision + reset senha (API 0.8.4, painel 1.8.0, package 0.5.2)

- **API:** `POST /technician-accounts/batch-provision`, `batch-password-reset`; provision/reset individual por node; scrub de senha no `picked_up`.
- **Agente:** `manage_local_user.php` create/set_password; dispatchers no `monitor-pfsense-agent.sh`.
- **Painel:** `FleetTechnicianManagementPanel` em `/nodes` — cadastro, busca, provisionar, resetar senha, revogar.
- Flags create/reset habilitadas neste host.
- Entrega: `docs/151-ENTREGA-CICLO-VIDA-TECNICOS-PROVISION-RESET-2026-07-31.md`.

### 2026-07-31 — Offboarding técnicos: cadastro UI + revoke-fleet (API 0.8.3, painel 1.7.0)

- **Painel:** formulário cadastrar técnico; botão **Revogar em toda a frota**; polling multi-lote.
- **API:** `POST /api/v1/technicians/:id/revoke-fleet`; login duplicado → 409; `TECHNICIAN_ACCOUNT_BATCH_MAX_SIZE` default 100.
- Entrega: `docs/150-ENTREGA-OFFBOARDING-TECNICOS-FROTA-2026-07-31.md`.

### 2026-07-31 — Correção gestão técnicos: getUserEntry Plus + payload agente (API 0.8.2, package 0.5.1)

- **Causa:** `getUserEntry()` no Plus retorna `{idx, item}`; `manage_local_user.php` não desempacotava → disable não persistia. API enviava `username` em vez de `pfsense_username` ao agente.
- **Correção:** `config_set_path` + unwrap em `manage_local_user.php`; dispatch agente com stderr e fallback de payload; `build_local_users_json` via `php -f`.
- **Validação:** lab 254 — batch revoke disable `hotspot` → `succeeded`; snapshot `disabled: true`.
- Entrega: `docs/149-CORRECAO-GESTAO-TECNICOS-GETUSERENTRY-0.5.1-2026-07-31.md`.

### 2026-07-31 — MVP plano 144: revogação técnicos em lote (API 0.8.0, web 1.6.0, package 0.5.0)

- Agente: `collect_local_users.php`, `manage_local_user.php` (disable/delete), dispatchers + snapshot no heartbeat.
- API: módulo `technicians`, `POST /technician-accounts/batch-revoke`, migration `local_users_snapshot_json`.
- Painel: `FleetBatchTechnicianRevokePanel` no inventário `/nodes`.
- Flags `TECHNICIAN_ACCOUNTS_*` e `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED` default off — piloto pendente.
- Entrega: `docs/148-ENTREGA-MVP-REVOCACAO-TECNICOS-LOTE-2026-07-31.md`.

### 2026-07-31 — Revisão Fase 0 plano 144 + correções (API 0.7.2)

- `command-orchestrator`: persistir payload normalizado após `validatePayload` (bug: username não lowercase chegava ao agente).
- `node-commands`: remover mapa `AUDIT_PREFIX_BY_TYPE` duplicado — usar `getCommandDefinition().auditPrefix`.
- `.env.api.example`: variáveis `TECHNICIAN_ACCOUNTS_*` documentadas.

### 2026-07-31 — Fase 0 plano 144: fundação gestão usuários locais pfSense (API 0.7.1 → 0.7.2)

- Models `Technician` / `TechnicianNodeAccount`, enums de status, 4 tipos `local_user_*` em `NodeCommandType`.
- RBAC: `technicians.view`, `technicians.manage`, `technicians.password_reset.run` (superadmin only).
- Flags `TECHNICIAN_ACCOUNTS_*` default off; `minAgentVersion` = `0.5.0` bloqueia dispatch até agente suportar.
- Sem UI, endpoints ou handler no agente — fundação apenas.
- Entrega: `docs/145-ENTREGA-TECNICIAN-ACCOUNTS-FOUNDATION-2026-07-31.md`.

### 2026-07-08 — Correção XML mal formado do package (release 0.4.18)

- `systemup_monitor.xml` estava **inválido desde 0.4.10** (`2>&1` sem escape no `custom_php_service_status_command`, introduzido ao remover o CDATA no commit `a3774ea`): `parse_xml_config_pkg` retornava `-1`, `pkg.php`/`pkg_edit.php` viravam **"Package / Editor" vazio** nos clientes e `install_package_xml` falhava silenciosamente (causa primária do menu ausente dos docs 137–140).
- Release **0.4.18**: `&` escapado (`2>&amp;1`) + guard de well-formedness (expat) em `build-pfsense-package-artifact.sh` — XML inválido agora aborta o build.
- **Não repetir:** conteúdo PHP/shell dentro de tags XML do pfSense deve usar CDATA ou escapar `&`/`<`/`>`.
- Entrega: `docs/143-CORRECAO-XML-MALFORMADO-GUI-0.4.18-2026-07-08.md`.

### 2026-07-04 — Correção versão reportada no heartbeat (package 0.4.15)

- Release **0.4.14** tinha `SYSTEMUP_MONITOR_AGENT_VERSION` preso em **0.4.13** — lote concluía com sucesso mas coluna **Pacote** não passava de 0.4.13.
- Release **0.4.15** alinha constante com `Makefile`; guards em `build-pfsense-package-artifact.sh` e `release-pfsense-package.sh`.
- Entrega: `docs/141-CORRECAO-AGENT-VERSION-0.4.15-2026-07-04.md`.

### 2026-07-01 — Coluna Pacote no inventário (painel 1.4.5)

- Coluna **Pacote** dedicada em `/nodes` (`agent_version` vs release alvo); **Versão pfSense** mostra só o OS.
- Sem mudança de API ou package (release continua **0.4.7**).
- Entrega: `docs/115-ENTREGA-COLUNA-PACOTE-INVENTARIO-2026-07-01.md`.

### 2026-06-30 — Upgrade remoto de package (0.4.6) e heartbeat light (0.4.5)

- **`package_upgrade`:** comando remoto via painel/API; pré-requisito agente ≥ 0.4.6.
- **Heartbeat light recovery:** package 0.4.5 força heartbeat normal após recovery.
- Entregas: `docs/114-*`, `docs/113-*`.

### 2026-06-24 — Correção pós-varredura read-only (gaps plano 110)

- **Package 0.4.4 (A2-001/002):** lock upgrade OS no wrapper (libera ao fim); `rm -f` no lock file.
- **API 0.6.2 (C2/C6):** `MfaEnrollmentGuard` em rotas operacionais; `resolveClientIp` centralizado; login MFA alinhado.
- **Painel 1.4.3 (W2/MW/HOME):** `handlePageApiError` completo; banners `/conta`; middleware fail-open em erro de rede; `/` roteia por permissão.
- **Smokes:** `smoke-rbac-admin-ux.sh` alinhado; suite 14/14.
- **Entrega:** `docs/112-ENTREGA-CORRECAO-POS-VARREDURA-2026-06-24.md`.

### 2026-06-24 — Correção falhas pós-auditoria (plano 110, 23/23)

- **Package 0.4.3 (P1–P8):** admin check restrito; rate-limit pós-spawn; lock atômico; stale seguro; handler update só em config; CSRF/admin fail-closed; backup_now admin-only.
- **Agente (A1–A3):** locks backup/upgrade com stale TTL; migração NODE_SECRET para arquivo 0600.
- **API 0.6.1 (C1–C6):** escopo global em `/auth/me`; MFA blocking opt-in; rate-limit emergência; caches documentados; `resolveClientIp` no backup ingest.
- **Painel 1.4.2 (W1–W4):** `firewalls.view` no middleware; 403 consistente; cadastro alinhado escopo global; MFA blocking no middleware.
- **Entrega:** `docs/111-ENTREGA-CORRECAO-FALHAS-AUDITORIA-110-2026-06-24.md`.

### 2026-06-24 — Hotfix: "Acao restrita a administradores" no update package (0.4.2)

- **Sintoma:** botão **Atualizar package** na GUI pfSense retornava `forbidden` mesmo para `admin`.
- **Causa:** `getUserEntry()` no pfSense 2.7+ retorna wrapper `{idx, item}`; `userHasPrivilege()` recebia o wrapper em vez de `$user['item']` → lista de privilégios vazia.
- **Correção:** desempacotar `item`, fallbacks grupo `admins` / uid 0 / privs das páginas do package.
- **Entrega:** `docs/109-HOTFIX-ADMIN-PACKAGE-UPDATE-2026-06-24.md`.

### 2026-06-23 — Correções de auditoria de segurança (package 0.4.0 · API 0.4.0 · painel 1.2.0)

- **Package (A1–A7):** menu `Status` adicionado; CSRF nos POSTs WWW + `package_update` restrito a admin; PHP de www declarados no XML; `$rc = (mwexec…)` no service_definition; `pkg-deinstall.in` guardado por fase + `${PKG_ROOTDIR}`; `%%PKGVERSION%%` no XML + `NO_ARCH`. A7 (rc.d idiomático) documentado como dívida de baixo risco.
- **Agente/shell (B1–B7):** segredo HMAC sai do `.conf` em texto (passa a `NODE_SECRET_FILE` 0600, com fallback retrocompatível); `detect_cpu_percent` FreeBSD via `sysctl`; fim do word-splitting em `install-from-release.sh`; allowlist de org/repo no auto-update; `uninstall.sh` com limpeza completa; `glob('/tmp/monitor-*')` → lista explícita; `packages/pfsense-agent/` marcado DEPRECATED.
- **Controlador (C1–C8):** bootstrap login não regrava senha (C1); anti-replay HMAC via `node_request_nonces` (C2, migration nova); CAS+`FOR UPDATE` no ingest (C3); RBAC em `createClient` (C4); `trustProxy` restrito + `CF-Connecting-IP` só de proxy confiável (C5); boot falha sem RBAC em produção (C6); replay de heartbeat não reentrega comandos (C7); `command-ack` condicional por status (C8).
- **SSE/infra (D1–D2):** stream filtra por `allowedClientIds` (sem vazar `node_id`/`node_uid` cross-escopo); headers de segurança (HSTS/X-Frame-Options/X-Content-Type-Options/CSP) nos dois nginx, preservando SSE/limites.
- **Adiado:** E1 MFA (gap de go-live; mitigação `AUTH_BOOTSTRAP_LOGIN_ENABLED=false` default + C1); E2 rate-limit in-memory (dívida documentada); E3 doc×código corrigido em `07`/`06`.
- **Entrega:** `docs/101-ENTREGA-CORRECOES-AUDITORIA-SEGURANCA-PFSENSE-2026-06-23.md`. Próximo passo: `prisma migrate deploy` + `docker compose up -d --build` para subir a API 0.4.0.

### 2026-06-23 — Package pfSense 0.3.8 (Opção D + Fase 3 P2)

- **`pfsense_upgrade` semi-manual:** spike `docs/97-SPIKE-PFSENSE-UPGRADE-CE.md`; wrapper `run_pfsense_upgrade.sh`; dispatch com pré-checks HA/disco/target; flag `MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=0`; state `pfsense-upgrade-pending.json`; sem failed imediato se spawn OK.
- **`node_secret` runtime:** arquivo `/var/db/monitor-pfsense-agent/node_secret` (0600); migração copy-on-read do XML; GUI "configurado".
- **Docs/backup XML:** fields `heartbeat_mode` + `config_backup_*`; guia `docs/pfsense-package/00-GUIA-OPERACAO-PACKAGE.md`; runbook ISPConfig 253.
- **Entrega:** `docs/98-ENTREGA-PACKAGE-0.3.8.md`. Pendente: lab CE flags não assistidas, piloto pfSense end-to-end.

### 2026-06-23 — Package pfSense 0.3.7 (Opção C / P1)

- **Gateways reais:** `collect_gateways.php` + `build_gateways_json()` via gwlib/dpinger; mapeamento para contrato API.
- **Harden auto-update:** secret via env/arquivo 0600; lock `/var/run/monitor-package-update.lock`; allowlist URL; SHA256 obrigatório; rate limit 24h; CLI `upgrade --force`.
- **Cache config.xml:** `config-snapshot.json` TTL 86400s; interfaces/IPs leem cache; heartbeat light não força refresh.
- **Desinstalação:** `systemup_monitor_package_uninstall()` + `pkg-deinstall.in` + paridade `bootstrap/uninstall.sh`.
- **Heartbeat HTTP:** `http_post_signed_json()`; `last-heartbeat-error.json`; diagnóstico GUI; backoff upstream separado do backup.
- **Entrega:** `docs/96-ENTREGA-PACKAGE-0.3.7.md`. Pendente: piloto pfSense (gateways no painel, regressão VPN/NAT).

### 2026-06-23 — Package pfSense 0.3.6 (Opção A / P0)

- **Merge cirúrgico `installedpackages.service`:** export/import usam `monitor_service_entry` (upsert só `monitor_pfsense_agent`); compat com snapshots 0.3.5 que traziam `service_entries` completo.
- **Backoff backup:** estado em `backup-upload-backoff.json`; classificação HTTP (502 → 5 min); `backup_should_run_scheduled` respeita `next_attempt_at`; `config_backup_now` bypass via `command_id`.
- **Metadados:** `info.xml` e `pkg-descr` sem "scaffold".
- **Entrega:** `docs/95-ENTREGA-PACKAGE-0.3.6.md`. Pendente: deploy piloto pfSense + `release-pfsense-package.sh`.

### 2026-06-23 — Persistência segura do config.xml (package 0.3.5)

- **Sintoma reportado:** firewalls perdendo VPN/NAT/senhas após horas ou dias, correlacionado à instalação do SystemUp Monitor.
- **Causa:** `systemup_monitor_sync_config()` chamava `write_config()` no resync, gravando o `$config` **inteiro** — se stale, revertia todo o XML.
- **Correção:** `systemup_monitor_persist_package_config()` faz `config_read()`, reaplica só snapshot do package e grava; resync periódico não grava XML (só runtime do agente). Entrega: `docs/92-ENTREGA-CORRECAO-WRITE-CONFIG-SEGURO-2026-06-23.md`.
- **Erro a não repetir:** nunca `write_config()` no resync sem `config_read()` e sem limitar alterações à seção `installedpackages` do SystemUp Monitor.

### 2026-06-14 — Upgrade remoto pfSense OS (API 0.3.0, painel 1.1.0, package 0.3.0)

- **API 0.3.0:** `NodeCommandsService` genérico; comando `pfsense_upgrade` com `payloadJson`/`runningAt`; ingest `command-result` succeeded/failed; reconciliação tardia pós-expire; lifecycle batch com grace window; módulo `pfsense-upgrade` com gate de backup e RBAC `pfsense.upgrade.run`.
- **Painel 1.1.0:** seção upgrade na visão geral do firewall; modal com override de backup; polling com comando ativo.
- **Package 0.3.0:** helper `check_pfsense_update_available.sh`, throttle no config, dispatcher de comandos, CLI `upgrade-check`; execução real stubbed até spike CE.
- **Entrega:** `docs/91-PLANO-ENTREGA-PFSENSE-OS-UPGRADE.md`.

### 2026-06-14 — Modal upgrade: erro genérico + refresh pré-submit (painel 1.1.1)

- **Sintoma:** ao confirmar upgrade, modal exibia erro genérico do Next.js em produção.
- **Causa:** server action propagava `ApiError` 409 (`no pfSense update available`) sem captura; status da UI ficou defasado em relação ao banco entre abrir o modal e confirmar.
- **Correção:** `requestPfsenseUpgradeAction` retorna `{ ok, error }` com mensagens em PT-BR; refresh do status ao abrir modal e antes de enviar.

### 2026-06-14 — Parser prioriza últimas linhas do CLI (package 0.3.4)

- **Sintoma:** agente `0.3.2` re-checou às 01:04 e ainda gravou `available=false` com widget nativo mostrando update.
- **Causa:** saída real do `pfSense-upgrade -d -c` termina com `26.03.1 version of pfSense is available`, mas o parser caía antes em `repository is up to date` (regex genérico `up to date`).
- **Correção:** package `0.3.3` reconhece formato CLI `X version of pfSense is available` e só trata como “atualizado” mensagens explícitas (`Your system is up to date`, etc.).

### 2026-06-14 — Correção cache detector upgrade (package 0.3.2)

- **Sintoma:** após instalar package `0.3.1`, painel continuava com `pfSense atualizado` apesar do widget nativo mostrar `Version 26.03.1 is available.`
- **Causa:** cache local `pfsense-update-check.json` gravado pelo parser `0.3.0` (`available=false`) permanecia válido por 6h (throttle); heartbeat reenviava o falso negativo.
- **Correção:** package `0.3.2` com `cache_version`, invalidação automática de cache antigo no heartbeat/sync e `force-check` após `sync_config`.
- **Operação imediata (sem 0.3.2):** no pfSense, `php -f .../systemup_monitor_cli.php upgrade-check --force`.

### 2026-06-14 — Correção detector upgrade pfSense OS (API/package 0.3.1)

- **Sintoma:** pfSense Plus mostrava `Version 26.03.1 is available.`, mas o SystemUp exibia `pfSense atualizado`.
- **Causa:** helper do agente não reconhecia a frase `Version X is available.` e tratava saída desconhecida/erro como `available=false`.
- **Correção:** package `0.3.1` reconhece esse formato, grava erro como estado desconhecido (`available=null`) e API/painel exibem `pfsense_update_check_error`.
- **Operação:** upgrade remoto passa a exigir agente `0.3.1+`.

---

### 2026-06-13 — Correções auditoria servidor (API 0.2.10, painel 1.0.1)

- **Produção:** `AUTH_BOOTSTRAP_LOGIN_ENABLED=false` em `.env.api` (login bootstrap desabilitado após usuários locais).
- **API 0.2.10:** heartbeat leve preserva status/alertas quando `services`/`gateways` omitidos; idempotência atualiza `lastSeenAt`; race `expireStaleCommands` com `updateMany` condicional; `markCommandSucceeded` reconcilia `expired→succeeded` com warning; SSE dashboard exige `firewalls.view`; paginação audit logs com overscan por escopo; `requestBackupNow` em transação serializável.
- **Painel 1.0.1:** redirect pós-login respeita `?next=` (path interno válido).
- **Entrega:** `docs/90-ENTREGA-CORRECOES-AUDITORIA-SERVIDOR-2026-06-13.md`.

---

### 2026-06-14 — Fix save backup travando aba do navegador (package 0.2.38)

- **Sintoma:** ao clicar "Salvar configurações" na aba Backup, a aba ficava girando indefinidamente.
- **Causa:** `sync_config()` reiniciava o serviço do agente de forma síncrona dentro do POST HTTP.
- **Correção:** save de backup usa `sync_backup_settings()` (sem restart); POST redirect imediato.

---

### 2026-06-14 — Correção consulta de release na UI de update (package 0.2.36)

- **Sintoma:** botão "Atualizar package" aparecia, mas ao clicar retornava erro de consulta ao controlador em loop.
- **Causa:** GUI usava PHP/cURL sem CA bundle confiável no FreeBSD; o agente (heartbeat) já usava `curl` do sistema.
- **Correção 0.2.36:** fallback para `curl` CLI, cache de release, erros detalhados, comando `release-check` no CLI.

---

### 2026-06-13 — Auditoria frota: backup agendado em loop (3 firewalls)

- **Frota afetada (agente 0.2.34):** Maquimalhas, Metalpox, Incubatorio Bom Jesus (~110 dup/h cada); demais 18 nodes com backup OK.
- **API 0.2.9:** supressao early de duplicata agendada (antes do gunzip), alerta de flood em log, expiracao de comandos picked_up/running.
- **Scripts:** `test-backup-schedule-logic.sh`, `audit-config-backup-fleet.sh`, `cleanup-scheduled-duplicate-backups.sh`.
- **Package 0.2.35** artefato gerado; atualizar os 3 pfSense prioritariamente.

---

## 1. Objetivo deste documento

- Manter uma **linha do tempo** das alterações relevantes (agente, API, painel, UX).
- Registrar **decisões** e **comportamentos esperados** para não reabrir questões já fechadas.
- Listar **erros cometidos e correções** para não repeti-los em novos chats ou refatorações.

---

## 2. Linha do tempo por tema

### 2.0.12 Coluna Pacote no inventário (**2026-07-01**)

- **Entrega:** `docs/115-ENTREGA-COLUNA-PACOTE-INVENTARIO-2026-07-01.md`
- **Versões:** painel `1.4.5` (API/package inalterados)
- **Resumo:** coluna **Pacote** em `/nodes` com `agent_version` do heartbeat; destaque visual quando abaixo da release alvo do controlador.

### 2.0.11 Link de acesso remoto por firewall (**2026-06-24**)

- **Entrega:** `docs/104-ENTREGA-LINK-ACESSO-REMOTO-FIREWALL-2026-06-24.md`
- **Versões:** API `0.6.0`, painel `1.4.0`
- **Resumo:** campo `remote_access_url` no node; padrao `https://{ip}:9999`; coluna **Acesso** / botao **Conectar** no inventario.

### 2.0 Trilha RBAC — usuários, permissões e escopo (2026-06-09)

- **Objetivo:** reestruturar RBAC humano com escopo por cliente, permissões granulares, perfil `client`, UX administrativa e auditoria — sem alterar ingest do agente.
- **Plano mestre:** `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
- **Encerramento:** `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md`
- **Versões finais da trilha:** API `0.2.4`, painel `0.2.3` (Fase E)
- **Fases:** A (correções UX) → B (escopo) → C (permissões) → D (perfil client) → E (UX admin + middleware) → F (auditoria + endurecimento)
- **Lições:**
  - Cache global de `/nodes/filters` precisa invalidação após mutações de inventário (Fase D/E).
  - `middleware.ts` no Next.js complementa guards da API para rotas do painel.
  - `AUTH_BOOTSTRAP_LOGIN_ENABLED=false` em produção após criar usuários locais.
  - Download de `config.xml` exige `backups.download` + auditoria com `actor_role` e `client_id`.
- **Não reabrir** fases A–F sem decisão explícita; Fase G (opcional) em trilha separada.

### 2.0.10 Encerramento roadmap UX front-end Fases 0–8 (**2026-06-09**)

- **Encerramento formal:** `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`
- **Versões finais:** painel `1.0.0`, API `0.2.7`
- **Trilhas consolidadas:** `docs/79`–`docs/87` (entregas `docs/80`–`docs/87`); contexto pré-roadmap em `docs/77`–`docs/78`
- **Não reabrir** fases 0–8 sem novo plano mestre

### 2.0.9 UX front-end — Fase 8 design system pages restantes (**concluída**, 2026-06-09) — **roadmap plano 24 encerrado**

- **Plano:** `31-plano-fase8-design-system-pages-restantes-2026-06-09.md`
- **Trilha:** `docs/87-TRILHA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md`
- **Entrega:** `docs/87-ENTREGA-FRONTEND-FASE8-DESIGN-SYSTEM-PAGES-RESTANTES-2026-06-09.md` — adoção design system em alerts, bootstrap, admin, sessions, login
- **Versão:** painel `1.0.0` (minor — fechamento roadmap UX); API `0.2.7` (sem alteração)
- **Componente novo:** `DataTable` em `components/ui/data-table.tsx`
- **Lição:** `nodes-table-with-delete.tsx` permanece órfão (Fase 3 usa `NodesInventoryTable`); atualizado por consistência

### 2.0.8 UX front-end — Fase 7 auditoria filtros amigáveis (**concluída**, 2026-06-09)

- **Plano:** `30-plano-fase7-auditoria-filtros-amigaveis-2026-06-09.md`
- **Trilha:** `docs/86-TRILHA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md`
- **Entrega:** `docs/86-ENTREGA-FRONTEND-FASE7-AUDITORIA-FILTROS-AMIGAVEIS-2026-06-09.md` — filtros PT-BR em `/audit`
- **Versão:** painel `0.8.0` (minor); API `0.2.7` (patch — query params opcionais `result`, `from`, `to`, `actor_email`, `offset`)
- **Decisões:** escopo RBAC e `audit.view` inalterados; labels em `audit-labels.ts`

### 2.0.7 UX front-end — Fase 6 conta separada + polimento PT-BR (**concluída**, 2026-06-09)

- **Plano:** `29-plano-fase6-conta-separada-polimento-ptbr-2026-06-09.md`
- **Trilha:** `docs/85-TRILHA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md`
- **Entrega:** `docs/85-ENTREGA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md` — `/conta` perfil + `/sessions` dedicada
- **Versão:** painel `0.7.0` (minor); API `0.2.6` (sem alteração — sem endpoint troca de senha)
- **Decisões:** menu Conta sem duplicata; senha via administrador; polimento PT-BR pontual

### 2.0.6 UX front-end — Fase 5 backups frota + menu (**concluída**, 2026-06-09)

- **Plano:** `28-plano-fase5-backups-frota-menu-2026-06-09.md`
- **Trilha:** `docs/84-TRILHA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md`
- **Entrega:** `docs/84-ENTREGA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md` — `/backups` frota + item menu Operação
- **Versão:** painel `0.6.0` (minor); API `0.2.6` (sem alteração — estratégia front com `GET /nodes`)
- **Decisões:** permissão `backups.view`; KPIs/filtros backup no front; link para `/nodes/[id]?tab=backup`

### 2.0.5 UX front-end — Fase 4 detalhe firewall em abas (**concluída**, 2026-06-09)

- **Plano:** `27-plano-fase4-detalhe-firewall-abas-2026-06-09.md`
- **Trilha:** `docs/83-TRILHA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md`
- **Entrega:** `docs/83-ENTREGA-FRONTEND-FASE4-DETALHE-FIREWALL-ABAS-2026-06-09.md` — `/nodes/[id]` em abas (visão geral, métricas, alertas, backup, configuração)
- **Versão:** painel `0.5.0` (minor); API `0.2.6` (sem alteração)
- **Decisões:** `?tab=` na URL; perfil `client` sem aba Alertas; features existentes preservadas

### 2.0.4 UX front-end — Fase 3 firewalls inventário (**concluída**, 2026-06-09)

- **Plano:** `26-plano-fase3-firewalls-inventario-backup-alertas-2026-06-09.md`
- **Trilha:** `docs/82-TRILHA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md`
- **Entrega:** `docs/82-ENTREGA-FRONTEND-FASE3-FIREWALLS-INVENTARIO-2026-06-09.md` — inventário `/nodes` com colunas backup e alertas, design system, ordenação
- **Versão:** painel `0.4.0` (minor); API `0.2.6` (patch — campos opcionais em `GET /nodes`)
- **Decisões:** extensão mínima API para backup na listagem; coluna alertas oculta para perfil `client`

### 2.0.3 UX front-end — Fase 2 dashboard enxuto (**concluída**, 2026-06-09)

- **Plano:** `25-plano-fase2-dashboard-enxuto-kpis-zona-quente-2026-06-09.md`
- **Trilha:** `docs/81-TRILHA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md`
- **Entrega:** `docs/81-ENTREGA-FRONTEND-FASE2-DASHBOARD-ENXUTO-2026-06-09.md` — KPIs com design system, zona quente polida, tabela operacional removida, CTA para `/nodes`
- **Versão:** painel `0.3.0` (minor); API inalterada `0.2.5`
- **Decisões:** stats redundantes removidos do PageHero; inventário completo só em Firewalls (`/nodes`)

### 2.0.2 UX front-end — Fase 0 + Fase 1 layout (**concluída**, 2026-06-09)

- **Plano:** `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md`
- **Trilha:** `docs/79-TRILHA-FRONTEND-FASE0-FASE1-LAYOUT-NAVEGACAO-2026-06-09.md`
- **Entrega:** `docs/80-ENTREGA-FRONTEND-FASE0-FASE1-LAYOUT-2026-06-09.md` — sidebar 240/64px, header, breadcrumbs, `components/ui/`
- **Versão:** painel `0.2.8` (patch); API inalterada `0.2.5`
- **Hotfix `0.2.9`:** `.glass-panel { width:100% }` sobrescrevia `.app-sidebar` — coluna principal (header, breadcrumbs, páginas) ficava fora do viewport; reordenado CSS em `globals.css`
- **Decisões mantidas:** Backups fora do menu; permissões de `buildNavGroups` inalteradas; páginas de negócio intactas

### 2.0.1 Pós-RBAC — UX escopo e layout responsivo (2026-06-09)

- **Doc:** `docs/77-ENTREGA-POS-RBAC-UX-LAYOUT-2026-06-09.md`
- **Versões atuais do produto:** API `0.2.4`, painel `0.2.5`
- **Painel `0.2.4`:** lista multi-coluna em Clientes permitidos; purge smoke (`scripts/purge-smoke-test-data.sh`)
- **Painel `0.2.5`:** shell fluido `.app-shell` (breakpoints 1440/1800/2200px); cards e hero em largura total
- **Lição:** toda entrega em `apps/web` ou `apps/api` exige bump em `package.json` + índices (regra `.cursor/rules/versioning.mdc`)

---

### 2.1 Modo manutenção e redirect (frontend)

- **Problema:** Ao ativar/desativar "maintenance mode" no painel, a ação era concluída com sucesso no backend, mas o frontend exibia erro: *"Falha ao atualizar maintenance mode: NEXT_REDIRECT"*.
- **Causa:** Em Server Actions do Next.js, `redirect()` lança um valor especial (`NEXT_REDIRECT`) que não é erro; o `catch` do formulário tratava como erro e mostrava a mensagem ao usuário.
- **Correção:** Em `apps/web/lib/admin.ts`, no `catch` de `setNodeMaintenanceAction`, chamar `rethrowIfRedirectError(error)` antes de tratar como falha, para que o redirect seja propagado e a navegação ocorra normalmente.
- **Lição:** Em Server Actions que usam `redirect()`, sempre re-lançar o “erro” de redirect em vez de exibi-lo ao usuário.

---

### 2.2 Comandos servidor → agente (ideia futura)

- **Contexto:** Foi avaliada a possibilidade de o servidor enviar comandos ou atualizações aos agentes nos firewalls (ex.: atualizar o agente).
- **Segurança:** Documentado em `docs/SEGURANCA-E-MODELO-DE-AMEACAS.md` (riscos de invasão/comprometimento dos clientes).
- **Ideia registrada:** `docs/IDEIAS-DE-FUNCOES.md` — comandos assinados entregues via GitHub (ou canal controlado), para implementação futura, sem expor os firewalls a comandos arbitrários do servidor.
- **Estado:** Apenas documentado; não implementado.

---

### 2.3 Serviços: “sem clientes” e “desativados” (falsos positivos)

- **Problema 1:** OpenVPN (e similares) em funcionamento, mas **sem clientes conectados**, eram reportados como erro pelo agente.
- **Problema 2:** Serviços **intencionalmente desativados** pelo cliente apareciam como erro.
- **Solução:**
  - **Sem clientes:** No backend (`node-status.util.ts`), serviços do tipo `openvpn` cuja mensagem indica “no clients” / “0 clients” **não** degradam o node nem geram alerta (`isNoClientsOnly`).
  - **Desativados:** O agente passa a reportar status `not_installed` quando o serviço está desativado no rc/config; o backend não considera `not_installed` como problema. Para IPsec Phase 1 com checkbox “Disabled” no pfSense, o agente lê `<disabled/>` no `config.xml` e envia `not_installed` + mensagem “(desativado)”.
- **Lição:** Distinguir sempre: **running** (ok), **stopped** (problema quando esperado rodar), **not_installed** (não instalado/desativado = não é alerta).

---

### 2.4 Monitoramento por túnel (OpenVPN, IPsec, WireGuard)

- **Objetivo:** Saber **qual** túnel/conexão está off, não só se o daemon está no ar.
- **Convenção:** Serviços no formato `{tipo}:{identificador}` (ex.: `openvpn:server1`, `ipsec:con1_2`, `wireguard:wg0`).
- **Agente:**
  - OpenVPN: lista instâncias (ex.: server1, client1) e reporta um item por túnel.
  - IPsec: usa `swanctl --list-sas` e config.xml (Phase 1) para listar túneis; descrição (ex.: “Matriz-Mecanica”) vem do config e vai no `message`.
  - WireGuard: usa `wg show interfaces` e reporta uma entrada por interface.
- **PATH no agente:** O script do agente roda com PATH mínimo; `swanctl` fica em `/usr/local/sbin`. Foi adicionado `/usr/local/sbin` ao PATH em `monitor-pfsense-agent-loop.sh` e no script `rc.d`, para o agente encontrar `swanctl`.
- **IPsec:**
  - **Descrições:** O agente lê o campo Description (Phase 1) do `config.xml` e envia no `message`; o painel exibe essa descrição em vez de “con1”, “con2”.
  - **Degradação:** O agente reporta **todas** as Phase 1 configuradas (não só as que aparecem em `swanctl --list-sas`). Se uma Phase 1 configurada não estiver ESTABLISHED → status `stopped`; o node é degradado e pode gerar alerta (o túnel não “some” da lista).
  - **Phase 1 desativada (checkbox Disabled):** Se existir `<disabled/>` no config, o agente envia `not_installed` e mensagem “(desativado)”; o backend não degrada e o painel exibe em **cinza**.
- **Documentação:** `docs/MONITORAMENTO-POR-TUNEL-VPN.md`.

---

### 2.5 Múltiplas interfaces de rede (nome e IP)

- **Objetivo:** Exibir no painel as interfaces como no pfSense (nome visual + IP), e não apenas um “IP interno” e um “IP WAN”.
- **Agente (0.2.19/0.2.20+):**
  - Envia no heartbeat o array **`interfaces`**: `[{ "name": "WAN1GB", "ip": "10.200.201.2" }, ...]`.
  - O **nome** é a descrição da interface no pfSense (ex.: WAN1GB, LAN, CAMERAS); quando não há IP (link down), envia `"ip": "n/a"`.
  - Mantém `mgmt_ip` e `wan_ip_reported` em string (virgula-separada) para compatibilidade.
- **Backend:** O payload do heartbeat é guardado em `payload_json`; o endpoint de detalhe do node devolve **`network_interfaces`** a partir do último heartbeat (`payloadJson.interfaces`).
- **Frontend:** Se existir `network_interfaces`, a página do node mostra a secção **“Interfaces (como no pfSense)”** com chips **Nome: IP**. Caso contrário, usa “IP(s) interno(s)” e “IP(s) público(s) / WAN”.
- **Fallback quando lista vazia (agente 0.2.21):** Se `list_pfsense_interface_roles` não retornar linhas (config inacessível, PHP, etc.), o agente monta um array mínimo com **LAN** (IP de gerenciamento) e **WAN** (IP WAN). Assim o painel sempre recebe pelo menos duas entradas e não fica com chips vazios.
- **Lição:** Em firewalls onde o config não é lido pelo agente, o fallback LAN/WAN evita tela sem informações; para lista completa com nomes customizados, o agente precisa conseguir ler o config (permissões, PATH, etc.).

---

### 2.6 Cadastro de firewall: só cliente obrigatório

- **Objetivo:** Permitir cadastrar um node com o mínimo de dados; nome, hostname e IPs vêm do próprio firewall no primeiro heartbeat.
- **Alterações:**
  - **API/Admin:** `hostname` (e campos de IP) opcionais no DTO de criação de node; se `hostname` vazio, o backend gera um `node_uid` (ex.: `fw-abc12def`) e usa como hostname até o agente reportar.
  - **Ingest:** No primeiro heartbeat, se `displayName` do node for null, o backend preenche com `request.body.hostname`.
  - **Formulário (painel):** Hostname e IPs opcionais; texto explicando que o sistema gera um ID e que, após o bootstrap no pfSense, nome e IPs são preenchidos pelo agente.
- **Lição:** Manter o formulário de criação alinhado ao contrato da API (opcional onde a API aceita opcional).

---

### 2.7 Exibição das interfaces no painel (chips vazios e botão)

- **Problema 1:** A secção “Interfaces (como no pfSense)” mostrava **chips vazios** (sem texto) quando o backend enviava itens com `name` ou `ip` vazios/undefined.
- **Correção (frontend):**
  - **Valores padrão:** Se `name` vazio → exibir **"—"**; se `ip` vazio → exibir **"n/a"**, para o chip nunca ficar em branco.
  - **Filtro:** Só exibir interfaces que tenham pelo menos `name` ou `ip` preenchidos.
  - **Mensagem:** Se todas as interfaces estiverem vazias, exibir *“Nenhuma interface com nome ou IP preenchido.”*
  - Mesma lógica defensiva na secção **“Editar cadastro”**.
- **Problema 2:** O botão **“Ativar maintenance mode”** era grande demais.
- **Correção:** Botão reduzido: `rounded-lg`, `px-3 py-1.5`, `text-xs` (em vez de `rounded-xl`, `px-4 py-3`, `text-sm`).
- **Lição:** Sempre tratar dados opcionais ou vindos de payload externo com fallbacks de exibição (—, n/a) e filtrar entradas vazias para não mostrar blocos sem informação útil.

---

### 2.8 Versões

- **Agente (package pfSense):** Definida em `packages/pfsense-package/Makefile` (`PORTVERSION`) e em `packages/pfsense-package/files/usr/local/pkg/systemup_monitor.inc` (`SYSTEMUP_MONITOR_AGENT_VERSION`). Alterar **os dois** em conjunto. Versão atual relevante para interfaces e fallback: **0.2.21**.
- **Frontend (painel):** `apps/web/package.json` → campo `version`; exibido no rodapé. Após alterações de build, fazer rebuild e `docker compose up -d --build` para o usuário ver a versão correta (ex.: 0.1.19).
- **Documentação de versões e release:** `docs/DIRETRIZES-E-FUNCIONAMENTO.md`, `docs/RELEASE-PACKAGE-PFSENSE-AUTOMATICO.md`.

---

## 3. Erros a não repetir (resumo)

| Situação | O que evitar | O que fazer |
|----------|-----------------------------|-------------|
| Redirect em Server Action | Tratar `redirect()` como erro e mostrar "NEXT_REDIRECT" ao usuário | Usar `rethrowIfRedirectError(error)` no catch |
| Serviço “sem clientes” (ex.: OpenVPN) | Considerar como falha e degradar o node | Tratar como ok quando mensagem indicar “no clients” / “0 clients” |
| Serviço desativado pelo cliente | Alertar como se fosse falha | Usar status `not_installed` e não degradar |
| IPsec Phase 1 desativada na UI | Mostrar como erro (vermelho) | Ler `<disabled/>` no config e enviar `not_installed`; exibir cinza |
| Agente sem `swanctl` no PATH | Assumir que comando existe no PATH padrão | Incluir `/usr/local/sbin` no PATH do agente (loop e rc.d) |
| Lista de interfaces vazia no config | Enviar `interfaces: []` e deixar chips vazios no painel | Fallback no agente: LAN + WAN a partir de mgmt_ip/wan_ip (0.2.21) |
| Chips de interface no frontend | Renderizar `name`/`ip` sem fallback | Usar "—" e "n/a", e filtrar itens totalmente vazios |
| Cadastro de node | Exigir hostname/IPs no formulário | Deixar opcionais; gerar node_uid e preencher no primeiro heartbeat |
| Versão do frontend desatualizada | Esquecer de dar build/deploy após mudança | Bump em `package.json` + `npm run build` + `docker compose up -d --build` |

---

## 4. Referências cruzadas

- **Monitoramento por túnel e interfaces:** `docs/MONITORAMENTO-POR-TUNEL-VPN.md`
- **Versões, release e config do agente:** `docs/DIRETRIZES-E-FUNCIONAMENTO.md`
- **Segurança e comandos servidor→agente:** `docs/SEGURANCA-E-MODELO-DE-AMEACAS.md`, `docs/IDEIAS-DE-FUNCOES.md`
- **Estado do projeto e retomada:** `LEITURA-INICIAL.md`, `00_inicio.md`, `00-README.md`
- **RBAC (encerrado):** `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md`, `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md`
### 2026-08-20 — Reorganização visual do painel: bump de continuidade (painel 1.11.1)

- Aplicado bump patch obrigatório antes de continuar as fases do plano 170, evitando publicar mudanças de UI com a versão 1.11.0 já entregue.
- Escopo permanece exclusivamente visual: sem alteração de API, dados, RBAC, autenticação, SSE, package pfSense ou infraestrutura.
