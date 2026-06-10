# 69. Trilha RBAC — Fase A: correções urgentes (sem migration)

Data de abertura: `2026-06-09`
Data de encerramento: `2026-06-09`
Status: `encerrada`
Plano mestre: `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md`
Pré-requisito: `docs/68-DIAGNOSTICO-RBAC-USUARIOS-PERMISSOES-2026-06-09.md`

## Objetivo

Corrigir inconsistências RBAC/UX **sem alterar schema do banco**, preparando o terreno para escopo por cliente na Fase B.

## Escopo

### Inclui

1. Desacoplar bootstrap do carregamento obrigatório em `/nodes/[id]`.
2. Tratar `403` de bootstrap como seção ausente, não erro fatal.
3. Aplicar mesma lógica em `/bootstrap` para não-admin.
4. Ocultar item de menu **Instalação** para quem não é `admin`/`superadmin`.
5. Smoke dedicado: operator/readonly abrem detalhe do node.
6. Bump versão painel `0.1.21`, API `0.1.7` se houver alteração backend mínima.

### Não inclui

- `user_client_scopes`
- permissões granulares
- novo role `client`
- alteração em ingest/heartbeat/backup

## Alterações previstas

### Frontend (`apps/web`)

| Arquivo | Mudança |
|---------|---------|
| `app/nodes/[id]/page.tsx` | Carregar bootstrap condicionalmente; tratar 403 |
| `app/bootstrap/page.tsx` | Tratar 403; mensagem para perfil sem acesso |
| `app/layout.tsx` | Instalação só para `ADMIN_ROLES` |
| `lib/api.ts` | Helper opcional `getNodeBootstrapCommandIfAllowed` (se necessário) |

### Backend (`apps/api`)

Nenhuma alteração obrigatória nesta fase. Opcional: documentar que bootstrap permanece em `/api/v1/admin/nodes/:id/bootstrap-command`.

### Scripts

| Script | Ação |
|--------|------|
| `scripts/smoke-rbac-node-detail.sh` | **criar** |
| `scripts/smoke-rbac-roles.sh` | estender passo node detail |
| `scripts/run-smoke-suite.sh` | incluir novo smoke se estável |

## Critérios de aceite

1. `operator` e `readonly` abrem `/nodes/:id` com HTTP 200 (via smoke ou curl autenticado indireto).
2. Seção bootstrap visível apenas para admin/superadmin.
3. Menu não mostra Instalação para operator/readonly.
4. `admin`/`superadmin` mantêm fluxo bootstrap intacto.
5. Suite de smokes existente continua verde.

## Smoke obrigatório

```bash
scripts/smoke-rbac-roles.sh
scripts/smoke-rbac-node-detail.sh   # após criar
scripts/run-smoke-suite.sh
```

## Build e deploy

```bash
cd apps/web && npm run build
docker compose up -d --build
```

## Riscos de regressão

| Risco | Mitigação |
|-------|-----------|
| Admin perde bootstrap no detalhe | testar com sessão admin no smoke |
| Página node sem dados | manter Promise.all apenas para APIs permitidas |

## Encerramento

- [x] Data de encerramento: `2026-06-09`
- [x] Versões: API `0.1.6` (inalterada) / painel `0.1.21`
- [x] Smokes executados: `smoke-rbac-node-detail.sh`, `smoke-rbac-roles.sh` (passo 8/8)
- [ ] Commit: pendente (aguardando solicitacao)
- [x] `LEITURA-INICIAL.md` atualizado
- [x] `00_inicio.md` trilha encerrada registrada

### Alteracoes entregues

- `apps/web/app/nodes/[id]/page.tsx`: bootstrap carregado apenas para admin/superadmin; secao Instalar agente condicional
- `apps/web/app/bootstrap/page.tsx`: redirect para `/dashboard` se perfil nao-admin
- `apps/web/app/layout.tsx`: menu Instalacao apenas para admin/superadmin
- `apps/web/lib/api.ts`: helper `getNodeBootstrapCommandIfAllowed` (403 → null)
- `scripts/smoke-rbac-node-detail.sh`: novo smoke
- `scripts/smoke-rbac-roles.sh`: passo 8/8 detalhe do node
- `scripts/run-smoke-suite.sh`: inclui `smoke-rbac-node-detail.sh`

### Proxima trilha

Abrir `docs/70-TRILHA-RBAC-FASE-B-ESCOPO-POR-CLIENTE-2026-06-09.md` (escopo por cliente).
