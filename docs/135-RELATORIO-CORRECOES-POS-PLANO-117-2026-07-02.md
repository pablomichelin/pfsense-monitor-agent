# 135 — Relatório de correções pós-plano 117

**Data:** 2026-07-02  
**Escopo:** Varredura sistemática frontend + backend após implementação do plano 117  
**Metodologia:** builds, testes unitários, smoke suite (15 scripts), Prisma validate, grep de padrões doc 131

---

## Resumo executivo

| Categoria | Encontrados | Corrigidos | Pendências |
|-----------|-------------|------------|------------|
| Scripts operacionais (syntax / versão) | 2 | 2 | 0 |
| Backend RBAC / segurança | 1 | 1 | 0 |
| Config desalinhada (`.env.api` vs release) | 1 | 1 | 0 |
| Build TypeScript (API + web) | 0 | — | 0 |
| Testes unitários API (65 casos) | 0 | — | 0 |
| Client Components + `lib/api` (doc 131) | 0 | — | 0 (já corrigido em 131) |
| Variants UI inválidos (doc 131) | 0 | — | 0 (já corrigido em 131) |
| Prisma validate | 0* | — | 0 |
| ESLint (`next lint`) | 1 | 0 | 1 |

\* `prisma validate` exige `DATABASE_URL`; com placeholder válido: schema OK.

**Smoke suite pós-correção:** **15/15 OK** em ~39s (`BASE_URL=http://127.0.0.1:8088`).

---

## Erros encontrados e correções

### 1 — Crítico: `run-smoke-suite.sh` com heredoc quebrado

- **Sintoma:** `syntax error: unexpected end of file` — suite inteira inexecutável.
- **Causa:** Linha 54 fechava `usage()` com `}` em vez de `EOF`.
- **Correção:** `scripts/run-smoke-suite.sh` — fechamento correto do heredoc.

### 2 — Alto: admin escopado criava clientes (C4 RBAC)

- **Sintoma:** `smoke-rbac-client-scope.sh` recebia HTTP **201** em `POST /api/v1/admin/clients` para admin com escopo restrito.
- **Causa:** `assertCanCreateClient` liberava criação quando o papel tinha `inventory.global` (presente no DB para `admin`, além do escopo por cliente).
- **Correção:** `apps/api/src/auth/access-policy.service.ts` — bloqueio explícito para atores com escopo por cliente (`getAllowedClientIds !== null`), independente de `inventory.global`.
- **Deploy:** container `monitor-pfsense-api-1` reconstruído (`docker compose build api && up -d api`).

### 3 — Médio: smoke de package usava versão/artefato obsoleto

- **Sintoma:** `smoke-agent-release.sh` falhava em `print-config` com `Syntax error: redirection unexpected` (artefato **0.4.5** desatualizado em `dist/`).
- **Causa:** `.env.api` com `PACKAGE_RELEASE_VERSION=0.4.5` enquanto release canônica é **0.4.10** (`config/package-release.env`).
- **Correções:**
  - `scripts/smoke-agent-release.sh` — prioriza `config/package-release.env` antes de `.env.api`.
  - `.env.api` — alinhado para `0.4.10` + SHA256 de `config/package-release.env`.
  - Artefato `dist/.../monitor-pfsense-package-v0.4.10.tar.gz` regerado a partir do código atual.

### 4 — Baixo: Prisma validate sem `DATABASE_URL`

- **Sintoma:** `P1012 Environment variable not found: DATABASE_URL`.
- **Ação:** Documentado; não é bug de schema. Com `DATABASE_URL` placeholder: schema válido.

### 5 — Pendência: ESLint interativo

- **Sintoma:** `npm run lint` no web abre prompt interativo (Next.js 15 deprecou `next lint` sem config).
- **Pendência:** Migrar para ESLint CLI ou adicionar `eslint.config.js` — fora do escopo desta correção (build + typecheck já passam).

### 6 — Pendência infra (doc 131, inalterada)

- TLS self-signed em pfREST interno — decisão de CA/infra, não bug de código.

---

## Arquivos alterados

| Arquivo | Fix |
|---------|-----|
| `scripts/run-smoke-suite.sh` | Heredoc `usage()` corrigido |
| `apps/api/src/auth/access-policy.service.ts` | C4: bloqueio createClient para escopo restrito |
| `scripts/smoke-agent-release.sh` | Versão canônica via `config/package-release.env` |
| `.env.api` | `PACKAGE_RELEASE_*` alinhado a 0.4.10 |
| `dist/pfsense-package/monitor-pfsense-package-v0.4.10.tar.gz` (+ `.sha256`) | Regerado do source atual |

---

## Verificação pós-correção

| Check | Resultado |
|-------|-----------|
| `npm run build` (API) | OK |
| `npm run build` (web) | OK |
| `npx tsc --noEmit` (API + web) | OK |
| `node --test apps/api/test/*.test.mjs` | **65/65** OK |
| `npx prisma validate` (com `DATABASE_URL`) | OK |
| `./scripts/run-smoke-suite.sh` | **15/15** OK |

---

## Pendências operacionais (não corrigidas automaticamente)

1. **ESLint web** — configurar ESLint CLI para CI/local sem prompt interativo.
2. **TLS pfREST** — certificados self-signed em lab (doc 131).
3. **Permissão `inventory.global` no papel `admin` no DB** — pode ter sido concedida via matriz UI; o fix de API impede abuso, mas recomenda-se revisar matriz se a intenção for manter admin sem cadastro global.
