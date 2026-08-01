# 144 - Plano de execução: gestão centralizada de usuários locais pfSense (revogação rápida de acesso de técnicos)

Data: `2026-07-31`

Status: **MVP Fases 1–2 entregue em código** (2026-07-31) — ver `docs/148-ENTREGA-MVP-REVOCACAO-TECNICOS-LOTE-2026-07-31.md`. Fase 0: `docs/145-...md`. Requisitos: `docs/146-...md`. **Próximo: piloto operacional** no lab 254 (upgrade 0.5.0 + flags) antes de rollout; depois Fase 1b (create/set_password) e Fase 3 (`/admin/tecnicos`).

Este documento é uma especificação de implementação, não só um plano conceitual. Foi escrito para ser executado por um agente sem o contexto da conversa que o originou — por isso todo nome de arquivo, campo, endpoint, flag e migration citado abaixo é literal e deve ser seguido exatamente, exceto onde marcado explicitamente como **"a validar em laboratório"**.

## 0. Leitura obrigatória antes de tocar em código

Nesta ordem:

1. `AGENTS.md` (raiz do workspace `/Dados`, se disponível no contexto)
2. `CORTEX.md`
3. `LEITURA-INICIAL.md`
4. `docs/00-INDICE-OPERACIONAL.md`
5. Este documento (`docs/144-...md`), inteiro, antes de escrever a primeira linha de código
6. `docs/117-PLANO-EXECUCAO-MELHORIAS-SEGURAS-2026-07-02.md` — fundação de jobs/comandos reaproveitada aqui
7. `docs/126-ENTREGA-ACOES-OPERACIONAIS-2026-07-02.md` — módulo gêmeo mais próximo (`service_restart`/`node_reboot`), usar como referência de padrão de código, não copiar literalmente

## 1. Contexto e decisão (já fechada, não reabrir)

- Problema real: ~70 pfSense, ~10 técnicos, hoje **1 usuário/senha compartilhado por firewall** usado por todos os técnicos. Demitir 1 técnico hoje exige trocar a senha manualmente em ~70 firewalls e redistribuir a nova senha para os técnicos que continuam ativos.
- Acesso hoje é **só via interface web (webConfigurator)** — sem SSH nesta frota.
- Não existe hoje servidor central de identidade (AD/LDAP/RADIUS).
- Três direções foram avaliadas em sessão de análise anterior a este documento: (1) RADIUS/LDAP central, (2) módulo de usuários locais dentro do pfs-monitor, (3) híbrido. **Decisão fechada: seguir só com a opção (2) nesta trilha.** RADIUS/LDAP central foi descartado para agora porque exigiria VPN até ~70 redes de cliente distintas (RADIUS/LDAP não deve ser exposto direto na internet) e HA de um serviço de identidade novo — fica registrado como trilha futura separada, fora deste plano.
- **Decisão adicional fechada (2026-07-31, original):** o módulo também deve acabar com a senha compartilhada — 1 usuário próprio por técnico, por firewall.
- **Refinamento (2026-07-31):** privilégio mínimo **não é requisito** — técnicos podem ter **admin completo** no pfSense. Ver seção **1.1**.

### 1.1 Decisões refinadas (2026-07-31)

Refinamento solicitado pelo operador após Fase 0. Documento detalhado: `docs/146-REQUISITOS-REFINADOS-TECNICOS-REVOCACAO-LOTE-2026-07-31.md`.

| Tema | Decisão original (plano 144) | Decisão refinada |
|---|---|---|
| Privilégio do técnico | Perfil operacional mínimo (`operational_default`, sem `WebCfg - All pages`) | **Admin completo OK** — usar perfil `admin_full` (ou equivalente `page-all` confirmado em lab) como default único |
| Prioridade de entrega | Fase 1 individual → Fase 2 lote → Fase 3 painel | **Revogação/desativação em lote** é a feature principal do MVP — Fase 2 sobe e **merge com o MVP** |
| Caso de uso #1 | Acabar com senha compartilhada + provisionar por técnico | **Cortar acesso quando demitido** (ex.: João demitido → desativar/remover em todos os firewalls) |
| UX de lote | Fase 2/3, painel dedicado `/admin/tecnicos` | **Igual ao update/backup em lote** — seleção múltipla ou todos os firewalls visíveis no inventário (`/nodes`), ação remove/disable por técnico |
| Referência de UI | `fleet-batch-technician-*-panel.tsx` (planejados) | Reutilizar padrão existente: `fleet-batch-backup-panel.tsx`, `fleet-batch-package-upgrade-panel.tsx` |

**Implicações técnicas:**

1. **`privilege_profile`:** substituir ou renomear `operational_default` para `admin_full` na allowlist de `technician-accounts.util.ts` e nos DTOs. Não investir em lab de privilégios mínimos nesta trilha.
2. **Ordem de implementação:** lab pfSense (disable/delete) → handler agente (`local_user_disable`, `local_user_delete`) → API individual mínima → **`POST /api/v1/technician-accounts/batch-revoke`** → **`fleet-batch-technician-revoke-panel.tsx`** embutido no inventário. Provisionamento em lote (`batch-provision`) e painel `/admin/tecnicos` ficam **depois** do MVP de revogação.
3. **Guardrail 5 (seção 7):** continua válido para contas **administrativas de recuperação** do firewall — não confundir com contas de técnico que **podem** ter admin completo.
4. **Seção 6 item 2:** lab de privilégios mínimos **sai do caminho crítico** — só confirmar identificador de admin completo (`page-all` ou equivalente) se/quando implementar `local_user_create`.

## 2. Por que esta abordagem é segura (não é "comando remoto arbitrário")

O `CORTEX.md` proíbe "executar comandos remotos arbitrários nos firewalls" e "usar token compartilhado entre múltiplos firewalls" sem decisão explícita. Este plano não viola isso:

- Usa o canal já existente entre agente e controlador (HTTPS + HMAC por `node_uid`/`node_secret`, agente busca comando pendente e reporta resultado — nunca o controlador abre conexão de entrada para o pfSense).
- Adiciona **4 tipos de comando fechados e validados** ao enum `NodeCommandType` já existente (`local_user_create`, `local_user_set_password`, `local_user_disable`, `local_user_delete`) — nunca um campo livre de shell/payload.
- Cada firewall continua com seu próprio `node_secret`; nenhuma senha ou token novo é compartilhado entre firewalls.
- Segue exatamente o padrão de segurança já usado em `service_restart`/`node_reboot` (`docs/126-ENTREGA-ACOES-OPERACIONAIS-2026-07-02.md`): allowlist, feature flag off por padrão, RBAC dedicado, confirmação forte para ação destrutiva, auditoria completa.

## 3. Arquitetura técnica exata

### 3.1 Fluxo ponta a ponta

```
Painel (superadmin)
  -> POST /api/v1/technicians/:id/revoke  (ou provisionar/reset/disable/delete)
  -> API cria NodeCommand(type=local_user_*, payload_json) por firewall afetado, dentro de um JobBatch quando for lote
  -> Agente (heartbeat/poll já existente) busca comandos pendentes via GET já existente
  -> Agente grava o payload daquele comando em arquivo temporário 0600 (nunca em log, nunca no dispatch_file compartilhado)
  -> Agente invoca manage_local_user.php, que carrega o framework real do pfSense (config.inc + auth.inc) e chama as funções nativas de usuário local
  -> Agente apaga o arquivo temporário (trap EXIT/INT/TERM) e reporta resultado via POST já existente (sem eco de senha)
  -> API atualiza NodeCommand + TechnicianNodeAccount.status + audit_logs (sem valor de senha)
```

### 3.2 Onde cada peça vive (arquivo por arquivo)

**Backend (`apps/api/src`):**

- `prisma/schema.prisma` — novos enums `TechnicianStatus`, `TechnicianNodeAccountStatus`; novos models `Technician`, `TechnicianNodeAccount`; 4 novos valores em `enum NodeCommandType`.
- `auth/permission-keys.ts` — 3 novas chaves de permissão.
- `config/app-config.ts` — novo bloco `technicianAccounts` (flags/limites).
- `commands/command-registry.ts` — 4 novas entradas no `COMMAND_REGISTRY`.
- `technicians/` (módulo novo, mesma estrutura de `operational-actions/`):
  - `technicians.module.ts`
  - `technicians.controller.ts` (CRUD de técnico + revogação)
  - `technician-node-accounts.controller.ts` (ações por firewall: provisionar, resetar senha, desabilitar, remover)
  - `technician-accounts-batch.controller.ts` (lote: provisionar em N firewalls, revogar em N firewalls)
  - `technicians.service.ts`
  - `technician-accounts.util.ts` (validação de `login_username`, allowlist de `privilege_profile`, política de senha gerada, checagem de "não remover última conta admin local")
  - `dto/technicians.dto.ts`
- `node-commands/node-commands.service.ts` — estender `AUDIT_PREFIX_BY_TYPE` e `toAgentCommandPayload` para os 4 novos tipos (seguir exatamente o padrão já usado para `service_restart`/`node_reboot` nesse arquivo).

**Agente / package pfSense (`packages/pfsense-package/files/usr/local/libexec/monitor-pfsense-agent/`):**

- `monitor-pfsense-agent.sh`:
  - Novas funções `dispatch_local_user_create`, `dispatch_local_user_set_password`, `dispatch_local_user_disable`, `dispatch_local_user_delete`, seguindo o mesmo esqueleto de `dispatch_service_restart`/`dispatch_node_reboot` (linhas ~3171–3297 na versão atual): checar flag habilitada, adquirir lock operacional (`operational_action_acquire_lock`), fazer `agent_post_command_ack picked_up/running`, executar, reportar `succeeded`/`failed`, liberar lock.
  - Alterar `process_heartbeat_commands` (linhas ~3299–3373 na versão atual): o parser inline em PHP que hoje monta um `$dispatch_file` tabulado **não pode** ganhar um campo de senha nessa tabela. Para comandos `type` iniciando em `local_user_`, o parser deve em vez disso escrever o payload completo daquele comando em um arquivo próprio, criado com `umask 077` (0600), em `"$(backup_state_dir)/cmd-payload-<command_id>.json"`, e emitir na linha do `$dispatch_file` apenas `type<TAB>id<TAB>caminho_do_arquivo` (sem segredo). O `case "$command_type" in ...)` ganha 4 novos `local_user_*)` que chamam o dispatcher correspondente passando o caminho do arquivo, e o dispatcher deve remover esse arquivo (`rm -f`) em `trap ... EXIT` incondicionalmente, sucesso ou falha.
- Novo helper `manage_local_user.php` (mesmo diretório), invocado como `php manage_local_user.php <action> <payload_file>`, onde `action` ∈ `create|set_password|disable|delete` e `payload_file` é o JSON 0600 acima (`{username, full_name?, privilege_profile?, password?}`). Este script:
  1. Carrega o framework real do pfSense (`require_once('globals.inc'); require_once('config.inc'); require_once('auth.inc');`) para operar com as mesmas funções que a própria GUI do pfSense usa (`system_usermanager.php`) — **não** reimplementar hashing de senha nem escrita manual de `config.xml`.
  2. Usa as funções nativas de usuário local do pfSense (histórico do projeto: `local_user_set()` para criar/atualizar usuário e senha, `local_user_del()` para remover) e persiste via `write_config()` com uma descrição de mudança clara (ex. `"systemup-monitor: technician account <action>"`).
  3. Nunca imprime a senha em stdout/stderr/log — só um resultado JSON de sucesso/erro sem dados sensíveis.
  4. **Marcado como "a validar em laboratório" (ver seção 6):** os nomes exatos de função em `auth.inc` e os identificadores de privilégio mínimo em `priv.defs.inc` devem ser confirmados contra o pfSense real (CE 2.8.1, já homologado neste projeto) antes de codificar em definitivo — não assumir a assinatura exata sem checar o código-fonte do pfSense instalado no ambiente de laboratório.
- `monitor-pfsense-agent.conf` (exemplo) — nova variável `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED` (default `0`).

**Painel web (Fase 2/3, `apps/web`):**

- `lib/technicians.ts` (novo, mesmo padrão de `lib/package-upgrade.ts`) — chamadas de API.
- `components/technicians/` (novo diretório): `technician-list-panel.tsx`, `technician-detail-matrix.tsx`, `technician-node-account-actions.tsx`, `fleet-batch-technician-provision-panel.tsx`, `fleet-batch-technician-revoke-panel.tsx` — os dois últimos seguem literalmente o padrão de `components/nodes/fleet-batch-backup-panel.tsx` e `components/nodes/fleet-batch-package-upgrade-panel.tsx`.
- `app/admin/tecnicos/page.tsx` (novo, Fase 3).

## 4. Modelo de dados exato (Prisma)

Adicionar em `apps/api/prisma/schema.prisma`:

```prisma
enum TechnicianStatus {
  active
  revoked

  @@map("technician_status")
}

enum TechnicianNodeAccountStatus {
  pending_create
  active
  password_reset_pending
  disabled
  removed
  failed

  @@map("technician_node_account_status")
}

model Technician {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  fullName        String    @map("full_name")
  loginUsername   String    @unique @map("login_username")
  status          TechnicianStatus @default(active)
  notes           String?
  createdByUserId String?   @map("created_by_user_id") @db.Uuid
  revokedByUserId String?   @map("revoked_by_user_id") @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  revokedAt       DateTime? @map("revoked_at") @db.Timestamptz(6)
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  nodeAccounts    TechnicianNodeAccount[]

  @@map("technicians")
}

model TechnicianNodeAccount {
  id               String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  technicianId     String                      @map("technician_id") @db.Uuid
  nodeId           String                      @map("node_id") @db.Uuid
  pfsenseUsername  String                      @map("pfsense_username")
  privilegeProfile String                      @default("admin_full") @map("privilege_profile")
  status           TechnicianNodeAccountStatus @default(pending_create)
  lastCommandId    String?                     @map("last_command_id") @db.Uuid
  lastSyncedAt     DateTime?                   @map("last_synced_at") @db.Timestamptz(6)
  lastError        String?                     @map("last_error")
  createdAt        DateTime                    @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime                    @updatedAt @map("updated_at") @db.Timestamptz(6)

  technician       Technician @relation(fields: [technicianId], references: [id])
  node             Node       @relation(fields: [nodeId], references: [id])

  @@unique([technicianId, nodeId])
  @@index([nodeId])
  @@index([status])
  @@map("technician_node_accounts")
}
```

Também adicionar a relação inversa `technicianAccounts TechnicianNodeAccount[]` no `model Node` já existente (mesmo padrão da relação `commands NodeCommand[]` que já existe lá).

Adicionar 4 valores ao enum já existente:

```prisma
enum NodeCommandType {
  config_backup_now
  pfsense_upgrade
  package_upgrade
  service_restart
  node_reboot
  local_user_create
  local_user_set_password
  local_user_disable
  local_user_delete

  @@map("node_command_type")
}
```

Gerar a migration com `npx prisma migrate dev --name technician_accounts_foundation` (não escrever timestamp manualmente — deixar o Prisma gerar).

## 5. RBAC, permissões e feature flags exatas

### 5.1 `apps/api/src/auth/permission-keys.ts`

Adicionar ao array `PERMISSION_KEYS` (não remover nem reordenar as existentes):

```ts
'technicians.view',
'technicians.manage',
'technicians.password_reset.run',
```

### 5.2 Migration SQL (seguir literalmente o padrão de `apps/api/prisma/migrations/20260702180000_operational_actions/migration.sql`)

```sql
-- Permissions
INSERT INTO "permissions" ("id", "description") VALUES
  ('technicians.view', 'Ver técnicos e contas locais pfSense associadas'),
  ('technicians.manage', 'Criar, provisionar, desabilitar e remover técnicos e contas locais pfSense'),
  ('technicians.password_reset.run', 'Resetar senha de conta local de técnico no pfSense')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'technicians.view'),
  ('superadmin', 'technicians.manage'),
  ('superadmin', 'technicians.password_reset.run')
ON CONFLICT DO NOTHING;
```

**Decisão fechada:** reservar as 3 permissões só a `superadmin` (mesma régua já usada para governança de usuários humanos no `CORTEX.md`). Abrir para `admin` só com decisão futura explícita e documentada.

### 5.3 `apps/api/src/config/app-config.ts` — novo bloco

```ts
technicianAccounts: {
  enabled: parseBoolean(process.env.TECHNICIAN_ACCOUNTS_ENABLED, false),
  createEnabled: parseBoolean(process.env.TECHNICIAN_ACCOUNT_CREATE_ENABLED, false),
  passwordResetEnabled: parseBoolean(
    process.env.TECHNICIAN_ACCOUNT_PASSWORD_RESET_ENABLED,
    false,
  ),
  disableEnabled: parseBoolean(process.env.TECHNICIAN_ACCOUNT_DISABLE_ENABLED, false),
  deleteEnabled: parseBoolean(process.env.TECHNICIAN_ACCOUNT_DELETE_ENABLED, false),
  commandExpireMinutes: parseNumber(
    process.env.TECHNICIAN_ACCOUNT_COMMAND_EXPIRE_MINUTES,
    15,
    'TECHNICIAN_ACCOUNT_COMMAND_EXPIRE_MINUTES',
  ),
  minAgentVersion:
    process.env.TECHNICIAN_ACCOUNT_MIN_AGENT_VERSION?.trim() || '0.5.0',
  batchMaxSize: parseNumber(
    process.env.TECHNICIAN_ACCOUNT_BATCH_MAX_SIZE,
    10,
    'TECHNICIAN_ACCOUNT_BATCH_MAX_SIZE',
  ),
},
```

`minAgentVersion` deve ficar **acima** da versão de package publicada até o agente realmente suportar os comandos, para impedir dispatch prematuro (mesmo mecanismo de gate já usado para `pfsense_upgrade`/`package_upgrade`/`operational_actions`).

Agente (`.conf` de exemplo e `monitor-pfsense-agent.sh`): `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED` (default `0`).

### 5.4 `apps/api/src/commands/command-registry.ts` — 4 novas entradas

Cada uma com `permission`, `minAgentVersion: appConfig.technicianAccounts.minAgentVersion`, `expireMinutes: appConfig.technicianAccounts.commandExpireMinutes`, `maxConcurrentPerNode: 1`, `maxConcurrentGlobal: 0`, `auditPrefix` próprio (`technician.create`, `technician.password_reset`, `technician.disable`, `technician.delete`), e `validatePayload` vindo de `technician-accounts.util.ts`:

- `local_user_create` → exige `technician_id`, `pfsense_username` (validado), `privilege_profile` (allowlist), e a senha gerada é anexada pelo `technicians.service.ts` no momento do enqueue, não pelo `validatePayload` puro.
- `local_user_set_password` → exige `pfsense_username`; senha gerada anexada da mesma forma.
- `local_user_disable` → exige `pfsense_username`.
- `local_user_delete` → exige `pfsense_username` + confirmação já validada na camada de API (não repetir lógica de confirmação dentro do payload do comando).

**Regra crítica de auditoria:** o `payloadJson` persistido em `NodeCommand` **não pode conter a senha em texto puro** de forma permanente. Estratégia obrigatória: gerar a senha, enviá-la ao agente via o mecanismo de entrega de comando pendente (que já é assinado/HTTPS), e não persistir esse campo específico no banco — ou, se a coluna `payload_json` for reaproveitada por conveniência de implementação, o campo de senha deve ser removido/sobrescrito do registro imediatamente após a entrega bem-sucedida ao agente (nunca ficar de forma duradoura em `payload_json` nem em `result_json`). Documentar a escolha final na entrega da Fase 1.

## 6. Itens que exigem validação em laboratório antes de codificar em definitivo

Estes pontos **não devem ser assumidos como certos** — são a parte do plano com menor certeza e devem ser confirmados em um pfSense CE real (mesma versão já homologada no projeto, CE 2.8.1) antes de finalizar o código do agente:

1. Nome exato e assinatura das funções em `/etc/inc/auth.inc` usadas para criar/atualizar senha/remover usuário local (histórico do projeto aponta para `local_user_set()` e `local_user_del()`, mas o comportamento exato — se aceita senha em texto puro no array e faz o hash internamente, se exige `local_user_set_password()` separado, se precisa de `local_user_set_groups()` à parte — deve ser confirmado lendo o código-fonte real instalado, não assumido por memória).
2. ~~Identificadores de privilégio mínimo~~ **Refinado (2026-07-31):** para o MVP de revogação, **não bloqueia**. Quando implementar `local_user_create`, confirmar identificador de **admin completo** (`page-all` ou equivalente em `priv.defs.inc`) — documentar na entrega. Lab de privilégios mínimos **fora de escopo** desta trilha.
3. Se o script `manage_local_user.php`, ao dar `require_once('config.inc')` fora do contexto normal de requisição da GUI, precisa de ajustes de ambiente (ex. `$g` globals, sessão fake) — testar isoladamente antes de integrar ao dispatcher do agente.
4. Comportamento ao tentar desabilitar/remover a última conta administrativa local do firewall — confirmar que o guardrail da seção 7 item 6 realmente impede isso antes de liberar em produção.

> **Lab read-only 2026-07-31 (`192.168.100.254`, node `systemupfw.system.up`):** detalhes em [`docs/147-LAB-READONLY-PFSENSE-254-AUTH-LOCAL-USERS-2026-07-31.md`](147-LAB-READONLY-PFSENSE-254-AUTH-LOCAL-USERS-2026-07-31.md).
>
> | Item §6 | Validado? | Evidência |
> |---------|-----------|-----------|
> | **1** Funções `auth.inc` | **Sim (disco Plus 26.03.1)** | SSH read-only `221`→`254` — linhas **351, 406, 713, 879, 908, 967, 2028** em `/etc/inc/auth.inc` (doc 147 §4.2) |
> | **2** Admin `page-all` | **Sim** | `priv.defs.inc:16-21` no host + backup XML 254 (grupo `admins`) |
> | **3** Bootstrap CLI | **Parcial** | Padrão `systemup_monitor_cli.php`; **pendente** dry-run `php -l` / `config.inc` no 254 |
> | **4** Guardrail última admin | **Parcial** | Regra no controlador; 2 admins no snapshot 254; pfSense não impede sozinho |
>
> **Lab 254 (2026-07-31):** SSH **`root@192.168.100.254`** OK a partir do controlador **`192.168.100.221`** (menu **8**). Versão **`26.03.1-RELEASE`** (`cat /etc/version`). Agente em `/usr/local/libexec/monitor-pfsense-agent/` (**sem** `manage_local_user.php`). **Gate piloto escrita:** implementar agente + dry-run CLI; homologar CE 2.8.1 antes de flags.

Nenhuma Fase além da 0 deve ser considerada "pronta para piloto real" sem esses 4 pontos resolvidos e documentados.

## 7. Guardrails obrigatórios (não negociar sem decisão explícita)

1. Nenhuma exposição de rede nova — tudo via canal agente→controlador já existente.
2. Sem comando arbitrário — só os 4 tipos fechados listados.
3. Sem segredo compartilhado entre firewalls.
4. Senha nunca persiste em texto puro de forma duradoura no controlador; exibida uma única vez na resposta HTTP do endpoint que a gerou.
5. ~~Privilégio mínimo por padrão~~ **Refinado (2026-07-31):** contas de técnico podem ter **admin completo** (`admin_full`). Guardrail permanece: nunca desabilitar/remover a última conta admin **de recuperação** do firewall (conta nativa `admin` ou equivalente de emergência — ver seção 6 item 4).
6. **Nunca permitir que o módulo desabilite ou remova a última conta administrativa local ativa de um firewall.** `technician-accounts.util.ts` deve checar isso antes de qualquer `local_user_disable`/`local_user_delete`, consultando o snapshot de usuários locais coletado pelo agente (se ainda não existir essa coleta, ela precisa ser adicionada na Fase 0/1 como pré-requisito).
7. Bloquear `login_username`/`pfsense_username` reservados (`admin`, `root`, e qualquer nome já usado por conta administrativa de recuperação).
8. Confirmação forte (`confirm_hostname` = hostname do node ou `"CONFIRMAR"`, mesmo padrão de `NodeRebootRequestDto`) obrigatória para `local_user_delete` individual e para qualquer revogação em lote.
9. Backup `config.xml` recente exigido antes da primeira escrita de usuários em um firewall (reaproveitar `configBackup`/`requireRecentBackupHours`, mesmo padrão já usado em `pfsenseUpgrade`).
10. Feature flags todas off por padrão; nenhuma liberada em produção sem piloto em 1-2 firewalls não críticos primeiro.
11. Auditoria completa (quem pediu, quando, em qual firewall, resultado) — nunca o valor da senha, nunca em `metadataJson` do `audit_logs`.

## 8. Endpoints exatos (Fases 1 e 2)

Todos sob `@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)`, seguindo literalmente o padrão de `operational-actions.controller.ts`.

| Método | Rota | Permissão | Fase |
|---|---|---|---|
| `GET` | `/api/v1/technicians` | `technicians.view` | 1 |
| `POST` | `/api/v1/technicians` | `technicians.manage` | 1 |
| `GET` | `/api/v1/technicians/:id` | `technicians.view` | 1 |
| `POST` | `/api/v1/technicians/:id/revoke` | `technicians.manage` | 2 (dispara lote de `local_user_disable` em todas as contas ativas) |
| `POST` | `/api/v1/nodes/:id/technician-accounts` | `technicians.manage` | 1 (provisionar 1 técnico neste firewall) |
| `POST` | `/api/v1/nodes/:id/technician-accounts/:accountId/password-reset` | `technicians.password_reset.run` | 1 |
| `POST` | `/api/v1/nodes/:id/technician-accounts/:accountId/disable` | `technicians.manage` | 1 |
| `DELETE` | `/api/v1/nodes/:id/technician-accounts/:accountId` | `technicians.manage` | 1 |
| `POST` | `/api/v1/technician-accounts/batch-provision` | `technicians.manage` | 2 |
| `POST` | `/api/v1/technician-accounts/batch-revoke` | `technicians.manage` | 2 |

DTOs em `dto/technicians.dto.ts`, usando `class-validator` como em `operational-actions.dto.ts`:

```ts
export class CreateTechnicianDto {
  @IsString() full_name!: string;
  @IsString() @Matches(/^[a-z][a-z0-9._-]{2,31}$/) login_username!: string;
  @IsOptional() @IsString() notes?: string;
}

export class RevokeTechnicianDto {
  @IsString() @IsIn(['CONFIRMAR']) confirm!: string;
}

export class ProvisionTechnicianAccountDto {
  @IsUUID() technician_id!: string;
  @IsOptional() @IsIn(['admin_full']) privilege_profile?: string;
}

export class DeleteTechnicianAccountDto {
  @IsString() confirm_hostname!: string;
}

export class BatchProvisionTechnicianDto {
  @IsUUID() technician_id!: string;
  @IsString({ each: true }) node_ids!: string[];
}

export class BatchRevokeTechnicianDto {
  @IsUUID() technician_id!: string;
  @IsOptional() @IsString({ each: true }) node_ids?: string[];
  @IsString() @IsIn(['CONFIRMAR']) confirm!: string;
}
```

(A allowlist de `privilege_profile` fica com um único valor `admin_full` — refinamento 2026-07-31; ver seção 1.1.)

## 9. Fases e critérios de saída

> **Nota (refinamento 2026-07-31):** a ordem abaixo foi ajustada. O **MVP operacional** entrega revogação em lote (antiga Fase 2 + UI lote) **antes** do painel dedicado e do provisionamento em massa. Ver `docs/146-...md` para fluxo UX e ordem de implementação.

### Fase 0 — Fundação de dados e RBAC

- Migration Prisma (seção 4), `permission-keys.ts` (seção 5.1), migration SQL de permissões (seção 5.2), bloco `app-config.ts` (seção 5.3), 4 entradas em `command-registry.ts` (seção 5.4) com `validatePayload` mínimo.
- Sem UI, sem handler real no agente ainda — comandos nunca serão de fato despachados porque `minAgentVersion` fica acima da versão publicada e as flags ficam `false`.
- **Critério de saída:** `npx prisma migrate dev` limpo, `npm run build` limpo em `apps/api`, nenhuma mudança de comportamento visível em produção, smoke suite atual (`scripts/run-smoke-suite.sh`) continua 100% verde.

### Fase 1 — Lab + agente disable/delete + API individual mínima (**MVP — parte 1**)

- Resolver seção 6 itens **1, 3 e 4** em laboratório (funções `auth.inc`, ambiente CLI, guardrail última conta admin). Item 2 (privilégios mínimos) **fora do caminho crítico**.
- Implementar `manage_local_user.php` com ações **`disable` e `delete` primeiro**; `create`/`set_password` podem vir na Fase 1b.
- Implementar `dispatch_local_user_disable`, `dispatch_local_user_delete` e mudança no `process_heartbeat_commands` (arquivo temporário 0600).
- API mínima: `GET /technicians`, `POST .../disable`, `DELETE .../technician-accounts/:id` (seção 8, linhas de Fase 1 relevantes a revogação).
- Bump package/agente (`minAgentVersion` 0.5.0+).
- **Critério de saída:** desabilitar ou remover 1 conta de técnico em 1-2 firewalls piloto, ponta a ponta, com auditoria.

### Fase 2 — Revogação em lote + UI no inventário (**MVP — parte 2, prioridade máxima**)

- `POST /api/v1/technician-accounts/batch-revoke` + `technician-accounts-batch.controller.ts`, reaproveitando `JobBatch` (mesmo padrão de `POST /api/v1/operational-actions/backup-batch` e `package-upgrade/batch`).
- UI: `fleet-batch-technician-revoke-panel.tsx` no inventário `/nodes` — seleção múltipla ou todos os firewalls visíveis (props `mode: 'selection' | 'filter'`, igual `fleet-batch-backup-panel.tsx`); escolha do técnico + ação disable ou delete; confirmação forte (`CONFIRMAR`); polling de resultado por firewall (padrão `fleet-batch-package-upgrade-panel.tsx`).
- **Critério de saída:** operador revoga técnico "João" em lote (5–70 firewalls selecionados ou todos visíveis), vê resultado por firewall, sem afetar outros técnicos.

### Fase 1b — Provisionamento individual (pós-MVP revogação)

- Completar `local_user_create`, `local_user_set_password` no agente; endpoints de provisionar e reset de senha; perfil `admin_full`.
- **Critério de saída:** criar conta de técnico com admin completo em firewall piloto, senha exibida uma vez, sem persistência de senha no banco.

### Fase 3 — Painel dedicado, provisionamento em lote e visibilidade

- Rota `/admin/tecnicos`, `batch-provision`, matriz técnico × firewall, indicador no detalhe do node.
- **Critério de saída:** operador responde "quem tem acesso a este firewall?" e "esse técnico ainda tem acesso em algum lugar?" sem abrir pfSense manualmente.

### Fase 4 — Homologação, migração e fechamento

- Smoke dedicado `scripts/smoke-technician-accounts.sh`.
- Rollout gradual de flags (1 cliente piloto → ampliar).
- Migração assistida do modelo atual (senha compartilhada) para usuário por técnico nos firewalls em produção, com checklist por cliente.
- Documento de entrega (`docs/NNN-ENTREGA-...md`), atualização de `LEITURA-INICIAL.md`, `00_inicio.md`, `docs/00-INDICE-OPERACIONAL.md`, bump de versão em `apps/api/package.json`/`apps/web/package.json` conforme aplicável.

## 10. Testes obrigatórios

- Unit: `technician-accounts.util.ts` (validação de username, allowlist de privilégio, guardrail de última conta admin, geração/validação de política de senha).
- Integration: `POST /api/v1/technicians`, ciclo completo provisionar → resetar senha → desabilitar → remover, com RBAC (`superadmin` ok, `admin`/`operator`/`readonly` bloqueados).
- Teste de auditoria: garantir que nenhum registro em `audit_logs` ou em `resultJson`/`payloadJson` persistido contém a senha em texto puro.
- Teste de concorrência: 2 comandos `local_user_*` no mesmo node não podem rodar em paralelo (mesma trava operacional já usada em `service_restart`/`node_reboot`).
- Smoke de agente: `sh -n` e `php -l` em todos os arquivos novos do package (mesma checagem já feita hoje nesse pacote).
- Teste manual documentado em laboratório real antes de qualquer piloto em cliente.

## 11. Regras de versionamento e deploy (lembrete — regra já existente do projeto)

Qualquer fase que altere `apps/api` ou `apps/web` deve, antes de encerrar essa fase:

1. Bumpar `apps/api/package.json` e/ou `apps/web/package.json` (semver — ver `.cursor/rules/versioning.mdc`).
2. Atualizar `docs/00-INDICE-OPERACIONAL.md`, `00_inicio.md`, `LEITURA-INICIAL.md` (bloco "Versões atuais").
3. Registrar em `docs/HISTORICO-E-LINHA-DO-TEMPO.md`.
4. Gerar `docs/NNN-ENTREGA-...md` da fase.
5. `cd apps/api && npm run build` e/ou `cd apps/web && npm run build`, depois `docker compose up -d --build` na raiz — não encerrar a fase com o sistema fora do ar ou com build pendente.

## 12. Fora de escopo (não fazer nesta trilha)

- Autenticação centralizada via RADIUS/LDAP — trilha futura separada; pré-requisitos antes de reconsiderar: decisão de malha de VPN até as redes de cliente ou RadSec, plano de HA do serviço de identidade, conta de emergência local por firewall.
- Qualquer forma de expor RADIUS/LDAP direto na internet pública sem túnel.
- SSO real (mapeamento de grupos AD/LDAP para privilégios pfSense).
- Gestão de usuários via pfREST.
- Lab ou entrega de **privilégio mínimo/restrito** — refinamento 2026-07-31: técnicos usam **admin completo**; perfis granulares ficam fora de escopo.
- Mais de um `privilege_profile` além de `admin_full` nesta trilha, salvo decisão explícita futura.

## 13. Instruções para o agente executor

- Executar **uma fase por vez**, na ordem 0 → **1 (disable/delete)** → **2 (lote + UI)** → 1b → 3 → 4. **Não adiar Fase 2** — revogação em lote é o valor principal para o operador (refinamento 2026-07-31).
- Antes de editar: `git status` para não colidir com mudanças de outra sessão; não revertar trabalho de terceiros.
- Não implementar nada listado na seção 12.
- Não assumir como fato os 4 pontos da seção 6 — resolver em laboratório antes de codificar em definitivo, e documentar o que foi encontrado.
- Toda API nova precisa de RBAC + validação + teste, seguindo o padrão exato de `operational-actions/`.
- Toda informação nova precisa aparecer no painel em local coerente antes de a fase ser considerada concluída (a partir da Fase 2/3).
- Ao final de cada fase: aplicar a seção 11 (versionamento/build/deploy), gerar documento de entrega, e relatar arquivos alterados, testes executados e risco residual.
