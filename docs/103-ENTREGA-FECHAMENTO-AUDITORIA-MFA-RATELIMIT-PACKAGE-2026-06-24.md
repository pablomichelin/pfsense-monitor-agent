# 103 — Entrega: fechamento dos itens restantes da auditoria (MFA, rate-limit persistente e package)

**Data:** 2026-06-24
**Versoes entregues:** API `0.5.0` · Painel web `1.3.0` · Package pfSense `0.4.1`
**Origem:** `docs/101-ENTREGA-CORRECOES-AUDITORIA-SEGURANCA-PFSENSE-2026-06-23.md` (gaps E1/E2 adiados) + `docs/94-PLANO-MELHORIAS-PACKAGE-0.3.6.md`
**Escopo:** controlador (`apps/api`, `apps/web`) e package pfSense (`packages/pfsense-package`). Zabbix nao foi tocado.

Esta trilha fecha os itens medios/baixos em aberto e os dois itens adiados
da auditoria de seguranca: **MFA TOTP (E1)** e **persistencia do rate-limit (E2)**.

## Resumo por item

### Controlador

#### C-MFA (E1) — MFA TOTP completo para usuarios humanos — **MINOR**
- **Schema/migration** (`apps/api/prisma`): campos `mfa_enabled` / `mfa_secret`
  (cifrado em repouso com o mesmo `aes-256-gcm` usado em `node_secret`) /
  `mfa_enrolled_at` em `users`; tabelas `mfa_recovery_codes` (hash dos codigos) e
  `mfa_login_challenges` (desafios transitorios). Migration `20260624130000_mfa_totp`.
- **Servico** `apps/api/src/auth/mfa.service.ts`: geracao de secret + QR `otpauth://`
  (otplib 12.0.1 + qrcode), enrollment, verificacao TOTP, recovery codes (consumo
  unico), desafios de login e regra de enforcement por role. Secret nunca em log.
- **Auth flow** (`auth.service.ts` / `auth.controller.ts`): login em duas etapas
  (senha → desafio MFA quando habilitado). Endpoints: `POST /auth/login/mfa`,
  `GET /auth/mfa/status`, `POST /auth/mfa/enroll/start`, `POST /auth/mfa/enroll/verify`,
  `POST /auth/mfa/disable` — todos com `SessionAuthGuard` + CSRF (a finalizacao do
  desafio usa o `mfa_token` transitorio).
- **Painel** (`apps/web`): secao "Minha conta" (`app/conta/mfa-section.tsx`) com
  enroll/QR/recovery/disable; login de 2 etapas em `app/login/page.tsx`; route
  handlers `app/api/mfa/*` via `lib/mfa-proxy.ts`.
- **Enforcement opt-in e desligado por padrao:** `MFA_ENFORCED_ROLES` vazio por
  default. Quando ligado, usuario sem MFA NAO e trancado — e direcionado ao
  enrollment. Break-glass: esvaziar `MFA_ENFORCED_ROLES` e reiniciar a API.
  Auxiliares: `MFA_ISSUER`, `MFA_CHALLENGE_TTL_MINUTES`, `MFA_RECOVERY_CODE_COUNT`,
  `MFA_TOTP_WINDOW`.
- **Smoke** `scripts/smoke-mfa.sh` (na `run-smoke-suite.sh`): enroll → login TOTP
  em 2 etapas → recovery code (consumo unico, reuso rejeitado). Purge oficial cobre
  o prefixo `mfa-smoke`.
- Documentado em `05-seguranca-e-endurecimento.md` (secao "MFA TOTP" + como ligar enforcement).

#### C-RL (E2) — rate-limit persistido em PostgreSQL
- `package-release-rate-limit.guard.ts` deixou de usar mapa em memoria e passou a
  fazer upsert atomico em `package_release_rate_limits` (migration
  `20260624120000_package_release_rate_limit`). Sobrevive a restart/redeploy e a
  multiplas instancias; limites atuais mantidos (60 req/min por IP). Estrategia
  *fail-open* se o banco estiver indisponivel (prioriza disponibilidade do endpoint publico).

#### C-SA — `ingest.service.ts` syncAlerts em heartbeat parcial
- A resolucao automatica de alertas passou a ignorar `node_uid_conflict` (que so
  some por acao administrativa) e a tratar com cuidado heartbeats parciais/light
  (sem `services`/`gateways` no payload), evitando abrir/resolver alertas indevidamente.

#### C-PG — `permissions.guard.ts` default-deny
- Rotas sob `PermissionsGuard` sem `@RequirePermissions` agora sao **negadas por
  padrao**. Rotas que legitimamente so exigem sessao (ex.: "minha conta", logout,
  MFA self-service) usam o novo decorator `@AllowSessionOnly` como escape hatch
  explicito. Decisao: seguro por padrao; rotas legitimas mapeadas e marcadas.

#### C-HX — `node-request-auth.service.ts` HMAC
- A assinatura recebida e decodificada de hex para `Buffer` antes do
  `timingSafeEqual`, com validacao de formato/length, preservando o contrato HMAC
  homologado (`timestamp + "\n" + rawBody`) e o comportamento de rejeicao.

### Package pfSense (0.4.1 — PATCH)

#### P-RC (A7) — rc.d idiomatico
- `files/usr/local/etc/rc.d/monitor_pfsense_agent` reescrito no padrao rc.subr
  (`command`/`command_args`/`procname`). O supervisor `/usr/sbin/daemon -r -P`
  grava o proprio pid no pidfile, de modo que o `status` confere o processo REAL
  (corrige diagnostico que podia reportar "not running" com o agente no ar).
  Validado com `sh -n`.

#### P-GW (A9) — logs estruturados nos coletores
- `collect_gateways.php` e `collect_config_snapshot.php` passaram a logar em stderr
  (prefixos `[collect_gateways]` / `[collect_config_snapshot]`) quando
  includes/APIs do pfSense estao indisponiveis, sem quebrar a saida JSON em stdout.
  `MONITOR_AGENT_DEBUG=0` silencia. Validado com `php -l`.

#### P-CAT (A10) — catalogo embarcado no firewall
- `catalog/package-monitor-catalog.json` agora e instalado em
  `/usr/local/share/pfSense-pkg-systemup-monitor/` (Makefile `do-install` +
  `pkg-plist`), fonte unica em `catalog/`. A descricao do campo da GUI aponta para
  o caminho instalado.

#### P-UP (B10) — flag de upgrade honesta
- `run_pfsense_upgrade.sh`: cabecalho e mensagens deixam claro que
  `MONITOR_AGENT_PFSENSE_UPGRADE_EXEC_ENABLED=1` NAO executa upgrade nao-interativo
  (flags nao homologados ate o spike CE — `docs/97`). Qualquer valor mantem o fluxo
  seguro: atualizar repositorios + confirmacao manual em System → Update.

#### Legado `packages/pfsense-agent/` (B8/B9)
- Mantido DEPRECATED (aviso ja presente no README). Correcao trivial aplicada no
  loop: `sleep ... || true` para nao encerrar o loop em sinal (`set -e`). Nao reescrito.

## Versionamento

| Local | De | Para |
|-------|----|----|
| `apps/api/package.json` | 0.4.0 | 0.5.0 |
| `apps/web/package.json` (rodape) | 1.2.0 | 1.3.0 |
| `packages/pfsense-package/Makefile` (PORTVERSION) | 0.4.0 | 0.4.1 |
| `systemup_monitor.inc` (SYSTEMUP_MONITOR_AGENT_VERSION) | 0.4.0 | 0.4.1 |
| `config/package-release.env` (VERSION + SHA256) | 0.4.0 | 0.4.1 |
| `.env.api` REAL (SYSTEM_VERSION / PACKAGE_RELEASE_VERSION / SHA256) | 0.4.0 | 0.5.0 / 0.4.1 |

`.env.api` atualizado com backup `.env.api.bak` (ambos gitignored; sem segredos no repo).
Branding mantido: "Monitor-Pfsense v1.3.0 | Desenvolvido por Systemup" (rodape le `package.json`).

## Lints / builds / migrations

- `php -l` OK em `collect_gateways.php` e `collect_config_snapshot.php`.
- `sh -n` OK em `monitor_pfsense_agent` (rc.d), `run_pfsense_upgrade.sh` e loop legado.
- `bash -n` OK em `smoke-mfa.sh`, `run-smoke-suite.sh`, `purge-smoke-test-data.sh`.
- `prisma validate` OK; `prisma generate` OK.
- `npm run build` OK em `apps/api` (0.5.0) e `apps/web` (1.3.0, rotas `/api/mfa/*` presentes).
- Artefato `dist/pfsense-package/monitor-pfsense-package-v0.4.1.tar.gz`
  SHA256 `6f6946d5cebd7434ae688090115dc775adc863d83b6a44ac85fefb7794e6ac59`.
- Migrations aplicadas no deploy: `20260624120000_package_release_rate_limit` e
  `20260624130000_mfa_totp` (`prisma migrate status` → "Database schema is up to date").

## Deploy

- `compose.yaml` nao expoe portas do Zabbix (apenas nginx 8088 / interno 3031).
  `ss -ltnp`: 10050 segue do `zabbix_agent2`; 80/443 pre-existentes; nada alterado.
- `docker compose up -d --build api web`: api e web saudaveis; migrations aplicadas
  no boot (entrypoint `prisma migrate deploy`).
- `/healthz` → `200` com `"version":"0.5.0"`.

## Smoke suite

`scripts/run-smoke-suite.sh` — **14/14 verdes** (~38s), incluindo `smoke-mfa.sh`
(enroll → login TOTP 2 etapas → recovery code consumo unico). Purge oficial executado
ao final (`scripts/purge-smoke-test-data.sh`).

## Publicacao do package

Artefato `v0.4.1` e `config/package-release.env` (versao + SHA256) prontos. Publicacao
GitHub (commit do artefato + `gh release create`) feita na fase de git desta entrega.
