# 101 — Entrega: correções de auditoria de segurança (package + controlador)

**Data:** 2026-06-23
**Versões finais:** Package pfSense `0.4.0` · API `0.4.0` · Painel web `1.2.0`
**Artefato:** `dist/pfsense-package/monitor-pfsense-package-v0.4.0.tar.gz`
**SHA256:** `02278f7a435322650fc488b494afda7f329f7ad21d6f0d4e84be903f57f69a68`
**Plano de origem:** `docs/94-PLANO-MELHORIAS-PACKAGE-0.3.6.md`

Trilha end-to-end de correção dos achados de duas auditorias (package pfSense + agente/shell + controlador NestJS + SSE/infra). Itens classificados como "FAZER AGORA" foram implementados; itens "ADIAR/DOCUMENTAR" receberam mitigação e ficaram registrados como gap conhecido.

---

## PARTE A — Pacote pfSense (`packages/pfsense-package/`)

| Item | Sev. | Correção | Arquivos |
|------|------|----------|----------|
| A1 | Crítico | Adicionado segundo `<menu>` em `Status` (mantido o de `Services`). Menu "SystemUp Monitor" agora aparece em ambas as seções. | `files/usr/local/pkg/systemup_monitor.xml`, `README.md` |
| A2 | Crítico | Proteção CSRF nos POSTs das páginas WWW e em `handle_package_update_post()`; helpers `systemup_monitor_csrf_tags()` / `systemup_monitor_csrf_validate_post()`; `package_update` restrito a admin; flash messages `csrf_fail` / `forbidden`. | `files/usr/local/www/backup_systemup_monitor.php`, `files/usr/local/pkg/systemup_monitor.inc` |
| A3 | Alto | Declarados os 3 PHP de `www` em `<additional_files_needed>` (config_, status_, backup_). | `systemup_monitor.xml` |
| A4 | Alto | `service_definition()` agora atribui `$rc = (mwexec(...) == 0);` (pfSense faz `eval()` e espera `$rc` booleano). | `systemup_monitor.inc` |
| A5 | Alto | `pkg-deinstall.in` só roda o CLI `remove` em `DEINSTALL`/`POST-DEINSTALL` e prefixa paths com `${PKG_ROOTDIR}`. | `files/pkg-deinstall.in` |
| A6 | Médio | Adicionado `<version>%%PKGVERSION%%</version>` no XML (alvo do REINPLACE) e `NO_ARCH=yes` no Makefile. | `Makefile`, `systemup_monitor.xml` |
| A7 | Médio | **Documentado como limitação conhecida** (ver abaixo). rc.d mantido para não quebrar homologação validada. | `files/usr/local/etc/rc.d/monitor_pfsense_agent` |

### A7 — limitação registrada
O rc.d usa padrão custom `start/stop` com `onecmd` global, atípico frente ao `.rc` idiomático (`procname`/`command_args`). Reescrever sem ambiente real de pfSense para testar `restart`/`onestatus` é arriscado. Mantido o comportamento homologado; alinhamento idiomático fica como dívida de baixo risco a validar em homologação pfSense.

---

## PARTE B — Agente / shell / scripts

| Item | Sev. | Correção | Arquivos |
|------|------|----------|----------|
| B1 | Crítico | Segredo HMAC sai do `.conf` em texto: agente lê de `NODE_SECRET_FILE` (0600). Fallback retrocompatível mantém `NODE_SECRET` no `.conf` apenas enquanto o arquivo de segredo não existir (nodes legados continuam autenticando até a próxima migração). | `monitor-pfsense-agent.sh`, `systemup_monitor.inc` |
| B2 | Alto | `detect_cpu_percent()` agora usa delta de `kern.cp_time` via `sysctl` (FreeBSD), com fallback `top -b -d 1` válido no FreeBSD (não `-n`, que é do Linux). | `monitor-pfsense-agent.sh` |
| B3 | Alto | `install-from-release.sh`: `shell_quote()` + `eval set --` preservam argumentos com espaços (fim do word-splitting cego). | `bootstrap/install-from-release.sh` |
| B4 | Alto | `url_allowed_for_controller()` endurecido: GitHub/raw só aceitos sob a allowlist fixa de org/repo (`/pablomichelin/pfsense-monitor-agent/`). Não desabilita auto-update — endurece. | `systemup_monitor.inc` |
| B5 | Médio | `uninstall.sh` agora limpa estado runtime, `node_secret`, locks, backoff, pid, logs e tmp — paridade com `systemup_monitor_package_uninstall()`. | `bootstrap/uninstall.sh` |
| B6 | Médio | `glob('/tmp/monitor-*')` substituído por lista explícita de paths. | `systemup_monitor.inc` |
| B7 | Médio | `packages/pfsense-agent/` (tarball legado) marcado **DEPRECATED**; package nativo é a única fonte de verdade. | `packages/pfsense-agent/README.md` |

---

## PARTE C — Controlador NestJS (`apps/api/`)

| Item | Sev. | Correção | Arquivos |
|------|------|----------|----------|
| C1 | Crítico | Bootstrap login não regrava mais `passwordHash` de usuário existente; só provisiona no primeiro acesso ou quando o usuário ainda não tem senha. | `src/auth/auth.service.ts` |
| C2 | Crítico | Anti-replay HMAC via PostgreSQL: nova tabela `node_request_nonces` (hash da assinatura por node, TTL = janela de skew) com `@@unique([nodeId, signatureHash])`; assinatura repetida → 401. Sem Redis. | `prisma/schema.prisma`, `prisma/migrations/20260623210000_node_request_nonce/`, `src/common/node-request-auth.service.ts` |
| C3 | Alto | Race no ingest resolvido com `SELECT … FOR UPDATE` + CAS por `last_heartbeat_sent_at`/`last_heartbeat_id` dentro de transação — heartbeat fora de ordem não sobrescreve snapshot novo. | `src/ingest/ingest.service.ts` |
| C4 | Alto | `createClient` aplica escopo RBAC (`assertCanCreateClient`): exige escopo global de cliente (superadmin); admin/cliente escopados são barrados. | `src/admin/admin.service.ts`, `src/admin/admin.controller.ts`, `src/auth/access-policy.service.ts` |
| C5 | Alto | `TRUST_PROXY` aplicado no Fastify (`trustProxy` restrito a `TRUSTED_PROXY_IPS`); `CF-Connecting-IP`/`X-Forwarded-For` só são aceitos de peer confiável via `resolveClientIp()`. | `src/main.ts`, `src/common/client-ip.ts`, `src/ingest/ingest.controller.ts`, `src/common/package-release-rate-limit.guard.ts` |
| C6 | Médio | Em `NODE_ENV=production`, boot falha se `RBAC_SCOPE_ENABLED`/`RBAC_PERMISSIONS_ENABLED` não forem `true`. | `src/config/app-config.ts` |
| C7 | Médio | Replay do mesmo `heartbeat_id` não reentrega comandos pendentes (idempotência). | `src/ingest/ingest.service.ts` |
| C8 | Médio | `command-ack` usa `updateMany` condicional por status esperado (CAS) — fim da corrida de ack. | `src/node-commands/node-commands.service.ts` |

---

## PARTE D — SSE / infra

| Item | Sev. | Correção | Arquivos |
|------|------|----------|----------|
| D1 | Alto | Stream SSE filtra por `allowedClientIds` do usuário; eventos fora de escopo são reduzidos a refresh genérico (sem `node_id`/`node_uid`). | `src/realtime/realtime.service.ts`, `src/dashboard/dashboard.controller.ts`, `src/ingest/ingest.service.ts` |
| D2 | Médio | Headers de segurança (HSTS, X-Frame-Options, X-Content-Type-Options, CSP básica) em ambos os nginx; re-declarados nos `location` do SSE/healthz por causa da herança do `add_header`. Buffering off do SSE, limite 5m do backup e 64k do heartbeat preservados. | `infra/nginx/default.conf`, `infra/ispconfig/nginx.monitor-pfsense.conf` |

---

## ADIADO / DOCUMENTADO (gaps conhecidos)

- **E1 — MFA obrigatório para admin (gap de go-live):** feature grande, **não implementada**. Mitigação aplicada: `AUTH_BOOTSTRAP_LOGIN_ENABLED=false` é agora o default em `.env.api.example`, com comentário reforçado (só ligar durante o primeiro provisionamento do superadmin). Combinado com C1, elimina o risco de sobrescrita de senha. MFA fica como gap de go-live a planejar em trilha própria.
- **E2 — Rate-limit de release in-memory:** `package-release-rate-limit.guard.ts` mantém o contador em memória. Limitação conhecida: o limite reseta em restart e não é compartilhado entre instâncias (bypass possível em multi-instância). Migração para persistência só se trivial — registrado como dívida.
- **E3 — Doc × código:** documentação atualizada para refletir o código real (não o contrário): `07-api-e-fluxos.md` (`services[]`/`gateways[]` opcionais no heartbeat leve), `06-modelo-de-dados-inicial.md` (`heartbeats` é legado, snapshot vive no `Node`; `audit_logs` tem `actor_role`/`client_id`/`result`).

---

## Versionamento

| Componente | Antes | Depois | Arquivo |
|------------|-------|--------|---------|
| Package pfSense | 0.3.11 | **0.4.0** | `Makefile` (PORTVERSION), `systemup_monitor.inc` (SYSTEMUP_MONITOR_AGENT_VERSION), `config/package-release.env` |
| API | 0.3.1 | **0.4.0** | `apps/api/package.json`, `.env.api.example` (SYSTEM_VERSION) |
| Painel web | 1.1.1 | **1.2.0** | `apps/web/package.json` (rodapé em `app/layout.tsx`) |

Tratado como **MINOR**: há mudança de comportamento de segurança e novo menu. Branding do rodapé ("Desenvolvido por Systemup", https://www.systemup.inf.br) preservado.

---

## Validação executada

- `php -l` em todos os `.php` alterados — OK.
- `sh -n` em todos os `.sh` alterados — OK.
- `npx prisma generate` (novo model `NodeRequestNonce`) — OK.
- `npm run build` (NestJS / `apps/api`) — OK.
- `npm run build` (Next / `apps/web`) — OK.
- Artefato gerado e SHA256 conferido: `monitor-pfsense-package-v0.4.0.tar.gz`.

> **Pendência de deploy (não-bloqueante para a release do package):** o controlador precisa de `prisma migrate deploy` (migration `20260623210000_node_request_nonce`) + `docker compose up -d --build` para passar a rodar a API 0.4.0. Até lá, a stack continua na versão anterior. A nova tabela é requisito do C2 antes de subir a API nova.

---

## Como atualizar os clientes pfSense

A release é entregue por raw GitHub na branch `main` (`config/package-release.env` → `PACKAGE_RELEASE_REPO_RAW_BASE`). Após o push do artefato em `dist/pfsense-package/`, os firewalls atualizam pelo GUI (Services → SystemUp Monitor) ou pelo one-shot/`generate-install-command.sh` apontando para 0.4.0 — preservando `config.xml`. Ver `docs/COMANDO-ATUALIZAR-PACKAGE-PFSENSE.md` e `docs/99-HOTFIX-UPGRADE-0.3.5-NODE-SECRET.md`.
