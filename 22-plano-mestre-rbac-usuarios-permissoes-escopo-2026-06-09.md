# 22. Plano mestre: RBAC, usuários, permissões, escopo por cliente e usabilidade

Data: `2026-06-09`
Status: `planejamento aprovado para execução`
Próximo documento operacional: `docs/68-DIAGNOSTICO-RBAC-USUARIOS-PERMISSOES-2026-06-09.md`

## Objetivo

Reestruturar de forma segura, versionada e incremental a governança humana do Monitor-Pfsense:

- usuários e perfis;
- permissões granulares (RBAC);
- isolamento por cliente (escopo);
- usabilidade do painel por persona;
- auditoria consistente;
- compatibilidade com monitoramento, bootstrap e backup já existentes.

Este documento **não implementa código**. Define o plano completo, a ordem das trilhas, as regras de versionamento e os critérios de encerramento.

## Por que um novo bloco documental na raiz

A sequência `01` a `21` na raiz concentra visão, arquitetura, dados, API, painel, deploy e evolução de produto.

A numeração `22` segue essa linha: documento **estratégico e durável**, equivalente ao papel de `12-roadmap-de-fases.md` e `21-evolucao-servicos-e-fase-b-2026-03-13.md`.

As **trilhas executáveis** (análise, entrega, encerramento, smoke) ficam em `docs/68+`, no mesmo padrão das trilhas `47` a `58` e do bloco backup `63` a `67`.

Regra: não misturar numeração da raiz com numeração de `docs/` — são camadas diferentes.

## Diagnóstico resumido (estado em 2026-06-09)

Referência completa: `docs/68-DIAGNOSTICO-RBAC-USUARIOS-PERMISSOES-2026-06-09.md`

### O que já funciona

- autenticação humana com sessão em banco, cookie seguro e CSRF;
- quatro roles fixas: `superadmin`, `admin`, `operator`, `readonly`;
- RBAC básico em rotas `/api/v1/admin` e ações de alerta/backup;
- auditoria parcial em `audit_logs`;
- backup `config.xml` com criptografia em repouso e download restrito a `superadmin`;
- smokes: `scripts/smoke-rbac-roles.sh`, `scripts/run-smoke-suite.sh`.

### Gaps críticos

1. **Sem isolamento por cliente** — qualquer usuário autenticado vê todos os firewalls.
2. **Sem perfil Cliente final** — não existe role `client` nem vínculo `user ↔ client`.
3. **Sem permissões granulares** — só nomes fixos de role.
4. **Bug de UX/API** — `/nodes/[id]` e `/bootstrap` quebram para `operator`/`readonly` por depender de rota admin de bootstrap.
5. **Admin global** — `admin` opera todos os clientes sem escopo.
6. **Site fantasma** — entidade `Site` permanece no modelo, oculta na UX.

## Decisões fechadas para esta trilha

Não rediscutir durante a execução, salvo bloqueio técnico comprovado:

1. Toda permissão sensível será validada no **backend**; frontend só reflete.
2. Escopo por cliente será obrigatório para `admin`, `operator`, `readonly` e futuro `client`.
3. `superadmin` mantém acesso global (com auditoria).
4. Permissões granulares entram como catálogo fixo seedado; roles continuam como atalho inicial.
5. Não remover funcionalidades de monitoramento, bootstrap ou backup.
6. Cada trilha encerra com: doc de entrega, smoke, bump de versão quando aplicável, atualização de `LEITURA-INICIAL.md` e `00_inicio.md`.
7. Não mover documentos antigos em massa.
8. Não alterar ecossistema Zabbix.

## Modelo alvo

### Perfis (camada 1)

| Perfil produto | Role técnica | Escopo |
|----------------|--------------|--------|
| Super Admin | `superadmin` | global |
| Administrador | `admin` | clientes autorizados |
| Técnico | `operator` | clientes autorizados |
| Somente leitura interna | `readonly` | clientes autorizados |
| Cliente final | `client` (novo) | um cliente (`users.client_id`) |

### Permissões granulares (camada 2)

Catálogo inicial:

```
clients.view | clients.create | clients.update | clients.delete
firewalls.view | firewalls.create | firewalls.update | firewalls.delete
backups.run | backups.view | backups.download | backups.restore
users.view | users.create | users.update | users.delete
roles.manage
audit.view
settings.manage
bootstrap.view | bootstrap.execute
alerts.view | alerts.acknowledge | alerts.resolve
```

`backups.restore` fica reservada para fase futura (restore automático fora do MVP atual).

### Escopo (camada 3)

Nova entidade: `user_client_scopes (user_id, client_id, granted_by, created_at)`.

Resolução de acesso a um `Node`:

```
node.site.client_id → client_id
permitido se:
  - role = superadmin, ou
  - exists user_client_scopes(user, client_id), ou
  - role = client AND users.client_id = client_id
```

### Auditoria enriquecida (camada 4)

Campos padronizados em `metadata_json` (e colunas futuras se necessário):

- `actor_role`
- `client_id`
- `node_id`
- `permission_used`
- `result` (`ok` | `denied` | `error`)
- `error_message` (sem dados sensíveis)

## Mapa documental desta iniciativa

### Raiz (estratégico)

| Arquivo | Papel |
|---------|-------|
| `22-plano-mestre-rbac-usuarios-permissoes-escopo-2026-06-09.md` | este plano mestre |
| `23-matriz-permissoes-e-escopo-rbac-2026-06-09.md` | matriz role × permission × escopo (criar na Fase A) |
| `24-modelo-dados-rbac-e-escopo-2026-06-09.md` | entidades, migrations, seeds (criar na Fase B) |

### docs/ (operacional)

| Arquivo | Fase | Tipo |
|---------|------|------|
| `docs/68-DIAGNOSTICO-RBAC-USUARIOS-PERMISSOES-2026-06-09.md` | 0 | diagnóstico |
| `docs/69-TRILHA-RBAC-FASE-A-CORRECOES-URGENTES-2026-06-09.md` | A | trilha |
| `docs/70-TRILHA-RBAC-FASE-B-ESCOPO-POR-CLIENTE-2026-06-09.md` | B | trilha |
| `docs/71-TRILHA-RBAC-FASE-C-PERMISSOES-GRANULARES-2026-06-09.md` | C | trilha |
| `docs/72-TRILHA-RBAC-FASE-D-PERFIL-CLIENTE-2026-06-09.md` | D | trilha |
| `docs/73-TRILHA-RBAC-FASE-E-UX-ADMINISTRATIVA-2026-06-09.md` | E | trilha |
| `docs/74-TRILHA-RBAC-FASE-F-AUDITORIA-E-ENDURECIMENTO-2026-06-09.md` | F | trilha |
| `docs/75-CHECKLIST-TESTES-RBAC-ESCOPO-2026-06-09.md` | todas | checklist |
| `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md` | final | encerramento |

Cada trilha `69` a `74` deve conter:

1. Escopo e pré-requisitos
2. Alterações previstas (API, DB, UI, scripts)
3. Critérios de aceite
4. Smoke obrigatório
5. Riscos de regressão
6. Seção **Encerramento** (preenchida ao concluir)

## Fases de implementação

### Fase 0 — Baseline documental (esta entrega)

**Entregas:**

- plano mestre `22` (este arquivo);
- diagnóstico `docs/68`;
- atualização de índices: `00_inicio.md`, `00-README.md`, `docs/00-INDICE-OPERACIONAL.md`, `LEITURA-INICIAL.md`.

**Critério de saída:** qualquer novo chat consegue retomar só lendo `00_inicio.md` → `22` → trilha corrente.

---

### Fase A — Correções urgentes (sem migration)

**Objetivo:** corrigir inconsistências atuais sem mudar modelo de dados.

**Trilha:** `docs/69`

**Escopo técnico:**

1. Desacoplar bootstrap do carregamento obrigatório em `/nodes/[id]` — carregar bootstrap apenas para roles com `bootstrap.view`.
2. Tratar `403` graciosamente em `/nodes/[id]` e `/bootstrap` (seção opcional, não erro fatal).
3. Ocultar menu **Instalação** para perfis sem `bootstrap.view`.
4. Criar `scripts/smoke-rbac-node-detail.sh` — operator/readonly abrem detalhe do node.
5. Estender `scripts/smoke-rbac-roles.sh` com casos de node detail.

**Versão sugerida:** painel `0.1.21`, API `0.1.7` (patch funcional).

**Não fazer nesta fase:** escopo por cliente, novas tabelas, renomear roles.

---

### Fase B — Escopo por cliente (núcleo de segurança)

**Objetivo:** impedir acesso cross-cliente.

**Trilhas:** `docs/70`, `24-modelo-dados-rbac-e-escopo`

**Escopo técnico:**

1. Migration `user_client_scopes`.
2. `AccessPolicyService` + `ScopeGuard` no backend.
3. Filtrar: `GET /nodes`, `GET /nodes/:id`, `GET /dashboard/summary`, `GET /alerts`, `GET /nodes/:id/config-backups`, `GET /admin/audit`.
4. Validar todo `:id` contra escopo (anti-IDOR).
5. Seed/migração de dados: usuários `admin`/`operator`/`readonly` existentes recebem escopo em todos os clientes ativos (compatibilidade).
6. UI mínima: atribuição de clientes na tela `/admin/usuarios` (superadmin).
7. Feature flag `RBAC_SCOPE_ENABLED` (default `true` após validação).

**Versão sugerida:** API `0.2.0`, painel `0.2.0` (minor — mudança de contrato de acesso).

**Smoke novo:** `scripts/smoke-rbac-client-scope.sh`

---

### Fase C — Permissões granulares

**Objetivo:** sair da dependência exclusiva de nomes de role.

**Trilhas:** `docs/71`, `23-matriz-permissoes-e-escopo-rbac`

**Escopo técnico:**

1. Tabelas `permissions`, `role_permissions`.
2. Seed do catálogo de permissões.
3. `PermissionsGuard` ou extensão do `RolesGuard`.
4. Substituir checks críticos: backup download/request, delete client/node, user management.
5. Endpoint `GET /api/v1/auth/me` retorna permissões efetivas da sessão.
6. Frontend usa permissões para botões (mantendo validação server-side).

**Versão sugerida:** API `0.2.1`, painel `0.2.1`.

**Smoke novo:** `scripts/smoke-rbac-permissions.sh`

---

### Fase D — Perfil Cliente final

**Objetivo:** permitir acesso restrito do cliente à própria empresa.

**Trilha:** `docs/72`

**Escopo técnico:**

1. Novo `UserRole.client` + campo `users.client_id`.
2. Dashboard simplificado (sem admin, sem instalação, sem alertas internos).
3. Detalhe do firewall reduzido: status, último backup, saúde básica.
4. Bloquear download e ações administrativas.

**Versão sugerida:** API `0.2.2`, painel `0.2.2`.

---

### Fase E — UX administrativa

**Objetivo:** painel profissional por persona.

**Trilha:** `docs/73`

**Escopo técnico:**

1. Reorganizar menu: **Operação** vs **Administração**.
2. Tela de permissões (matriz read-only inicial).
3. Fluxo de cadastro de usuário com escopo e perfil.
4. Confirmações padronizadas para rekey, delete, download backup.
5. Labels em português na UI (mantendo enums técnicos em inglês no banco).
6. `middleware.ts` no Next.js para proteção centralizada de rotas.

**Versão sugerida:** painel `0.2.3`.

---

### Fase F — Auditoria e endurecimento

**Objetivo:** rastreabilidade corporativa e redução de superfície.

**Trilha:** `docs/74`

**Escopo técnico:**

1. Padronizar `audit_logs` com `actor_role`, `client_id`, `result`.
2. Auditar negações de acesso relevantes (`access.denied`).
3. Flag `AUTH_BOOTSTRAP_LOGIN_ENABLED` para desabilitar backdoor de env em produção.
4. Revisar `GET /api/v1/agent/package-release` (autenticação opcional ou rate limit).
5. Documentar política de retenção e acesso a backups em `05-seguranca-e-endurecimento.md` (atualização pontual).

**Versão sugerida:** API `0.2.4`.

---

### Fase G — Opcional / futura (fora do MVP desta trilha)

- `Node.client_id` direto e deprecação gradual de `Site`;
- `backups.restore` com fluxo controlado;
- roles customizáveis editáveis na UI;
- página global `/backups`.

Registrar em trilha separada apenas se houver decisão explícita.

## Regras de versionamento

### Documentação

- cada fase encerrada atualiza `LEITURA-INICIAL.md` e secção **Trilhas encerradas** em `00_inicio.md`;
- doc da trilha ganha seção **Encerramento** com data, versões e smoke executado;
- `docs/HISTORICO-E-LINHA-DO-TEMPO.md` recebe entrada resumida por fase concluída.

### Código

| Tipo de mudança | API | Painel |
|-----------------|-----|--------|
| Fase A (fix UX) | 0.1.x | 0.1.x |
| Fase B (escopo) | 0.2.0 | 0.2.0 |
| Fases C–F | 0.2.x | 0.2.x |

### Git

- um commit por trilha encerrada (ou por sub-entrega testável dentro da trilha);
- mensagem: `feat(rbac): Fase B escopo por cliente` / `fix(rbac): desacoplar bootstrap do node detail`;
- push para `origin main` ao encerrar trilha (regra do projeto neste host).

## Gates obrigatórios por fase

Antes de marcar uma fase como encerrada:

1. `cd apps/api && npm run build` (se API alterada)
2. `cd apps/web && npm run build` (se web alterada)
3. `docker compose up -d --build` na raiz
4. Smokes da fase + `scripts/run-smoke-suite.sh` (regressão)
5. Checklist `docs/75` atualizado com itens marcados
6. Documento de trilha com seção Encerramento

## Ordem de execução recomendada

```text
Fase 0 (docs) → Fase A → Fase B → Fase C → Fase D → Fase E → Fase F → Encerramento (doc 76)
```

**Não paralelizar** Fase B e C na mesma entrega — escopo deve estar estável antes de granular permissões.

## Riscos de regressão (top 5)

| # | Risco | Mitigação |
|---|-------|-----------|
| 1 | Usuários existentes perdem acesso após escopo | seed all-clients para não-superadmin |
| 2 | Smokes antigos quebram | manter feature flag temporária na Fase B |
| 3 | Agente/heartbeat afetado | Fases A–F não alteram ingest |
| 4 | Páginas novas sem proteção | Fase E introduz middleware |
| 5 | Download de backup exposto | Fase C mantém `backups.download` só superadmin + audit |

## Compatibilidade com trilhas em andamento

- **Backup pfSense (`docs/63–67`):** módulo já implementado; esta trilha RBAC **reforça** download/escopo, não substitui backup.
- **Fase B serviços (`21-evolucao-servicos`):** independente; não reabrir.
- **Site invisível (`docs/54`):** manter até Fase G opcional.

## Encerramento (2026-06-09)

Trilha **concluída** (Fases A–F). Documento formal: `docs/76-ENCERRAMENTO-TRILHA-RBAC-2026-06-09.md`.

Versões finais da trilha: API `0.2.4`, painel `0.2.3`. Ajustes pós-trilha (escopo multi-coluna, layout responsivo): painel `0.2.5` — ver `docs/77-ENTREGA-POS-RBAC-UX-LAYOUT-2026-06-09.md`.

Fase G permanece opcional e fora do MVP desta trilha.

## Referências

- Diagnóstico: `docs/68-DIAGNOSTICO-RBAC-USUARIOS-PERMISSOES-2026-06-09.md`
- Governança: `CORTEX.md`, `05-seguranca-e-endurecimento.md`, `13-frontend-ui-ux-e-seguranca.md`
- RBAC atual: `scripts/smoke-rbac-roles.sh`, `apps/api/src/auth/roles.guard.ts`
- Backup sensível: `docs/64-ESPECIFICACAO-MODULO-BACKUP-PFSENSE-2026-06-08.md`
