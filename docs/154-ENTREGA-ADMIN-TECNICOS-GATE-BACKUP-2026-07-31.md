# 154 — Entrega: página `/admin/tecnicos` + gate de backup recente

Data: `2026-07-31`
Versões finais: API `0.10.0`, painel `1.10.0`, package pfSense `0.5.3` (sem mudança nesta entrega).

Contexto: fecha a Fase 3 do plano mestre (`docs/144-PLANO-GESTAO-CENTRALIZADA-USUARIOS-LOCAIS-PFSENSE-2026-07-31.md`) e implementa um guardrail de segurança pendente desde a auditoria (`docs/153-AUDITORIA-CORRECOES-GESTAO-TECNICOS-2026-07-31.md`).

## 1) Página dedicada `/admin/tecnicos` (Fase 3 do plano 144)

Critério de saída do plano: o operador responde **"quem tem acesso a este firewall?"** e **"esse técnico ainda tem acesso em algum lugar?"** sem abrir o pfSense manualmente.

### O que foi implementado

**API**

- `apps/api/src/technicians/technicians.service.ts`: novo método `listNodeAccounts(nodeId)` — retorna todas as contas de técnico (ativas, pendentes, desativadas, removidas) de um node específico, com dados do técnico (nome, login, status do cadastro central).
- `apps/api/src/technicians/technician-node-accounts.controller.ts`: novo endpoint `GET /api/v1/nodes/:id/technician-accounts`, protegido por `technicians.view`. O controller antes só tinha `POST`/`DELETE` por conta individual; faltava uma listagem por node.

**Painel web**

- `apps/web/app/admin/tecnicos/page.tsx` (nova rota): página server component seguindo o padrão visual das demais páginas `/admin/*` (`PageHero`, `PageSection`, guarda de sessão/RBAC no server component antes de renderizar).
  - Guarda: exige `technicians.view`; sem essa permissão, redireciona para `/admin`.
  - **Matriz técnico × firewall**: um `<details>` expansível por técnico (evita carregar uma tabela gigante de cara), com resumo de contagem por status no cabeçalho e, ao expandir, uma tabela com cada firewall onde o técnico tem conta (nome, login, status, última sincronização, erro).
  - **Cadastro e ações em lote**: reaproveita `FleetTechnicianManagementPanel` (o mesmo componente usado embutido em `/nodes`) em `mode="filter"`, passando todos os `node_id` visíveis no inventário — sem duplicar a lógica de ~700 linhas de polling de lote, confirmação `CONFIRMAR` e exibição de senha gerada uma única vez.
- `apps/web/lib/technician-status.ts` (novo arquivo): funções utilitárias compartilhadas de rótulo/badge de status de conta de técnico (`technicianAccountStatusLabel`, `technicianAccountStatusBadgeVariant`, `technicianRegistryStatusLabel`), usadas tanto na página nova quanto no painel do detalhe do node — evita duplicar o `switch` de status em cada lugar.
- `apps/web/lib/api.ts`: novos tipos e funções de cliente — `getTechnician(id)` (detalhe com `node_accounts`), `getNodeTechnicianAccounts(nodeId)` (consumindo o novo endpoint).
- `apps/web/lib/route-policy.ts`: rota `/admin/tecnicos` adicionada às regras de acesso (`technicians.view`) e ao grupo de navegação "Administração".
- `apps/web/components/app-sidebar.tsx`: ícone adicionado para a nova entrada de menu.
- `apps/web/lib/technicians.ts`: `revalidatePath` das server actions de técnicos passou a invalidar também `/admin/tecnicos` (antes só invalidava `/nodes`), para que ações feitas em uma tela reflitam imediatamente na outra.

**Indicador no detalhe do firewall**

- `apps/web/components/nodes/node-technician-accounts-panel.tsx` (novo componente): tabela simples (técnico, login pfSense, status, última sincronização, erro) exibida na aba "Visão geral" do detalhe do node.
- `apps/web/app/nodes/[id]/page.tsx`: busca condicional (`canViewTechnicians`) dos dados via `getNodeTechnicianAccounts` e renderização do novo painel, sem custo para quem não tem a permissão `technicians.view`.

### Decisão de design: reuso vs. duplicação

Optei por **reaproveitar diretamente** `FleetTechnicianManagementPanel` na nova página (via prop `mode="filter"` já existente) em vez de extrair um hook/util compartilhado. O componente já era parametrizável para esse cenário (lista de nodes + modo filtro), então introduzir uma camada de abstração adicional só aumentaria a complexidade sem ganho real. A única duplicação evitada ativamente foi a lógica de rótulo/badge de status (extraída para `lib/technician-status.ts`), que antes só existia dentro do painel de lote.

## 2) Gate de backup recente antes de escrita em usuários locais

### Decisão de design (não havia spec fechada)

A tarefa original pedia bloquear a **primeira** escrita em um node que "nunca teve nenhuma escrita desse tipo antes". Optei pela alternativa mais simples explicitamente sugerida como aceitável: **exigir backup recente sempre**, não apenas na primeira vez, controlado por flag.

Motivos:

- **Correção**: definir "nunca teve escrita antes" exigiria rastrear estado histórico por node (ex.: nova coluna ou consulta ao histórico de comandos), com casos de borda (comando falhou? comando ainda `pending`? conta foi criada por fora do produto?). É mais lógica para acertar e mais fácil de ter um buraco de segurança.
- **Segurança**: um backup recente antes de qualquer escrita em usuários locais é sempre desejável — não há motivo real para relaxar a exigência depois da "primeira vez". Se a frota já tem rotina de backup periódico (o produto já tem backup em lote no inventário), a exigência sempre ativa tem custo operacional baixo.
- **Simplicidade de implementação**: uma única função pura (`evaluateRecentBackupSkipReason`) reaproveitada em todos os pontos de decisão, sem estado adicional no schema.

### O que foi implementado

**Configuração** (`apps/api/src/config/app-config.ts`, `.env.api`, `.env.api.example`):

- `TECHNICIAN_ACCOUNT_REQUIRE_RECENT_BACKUP_ENABLED` (default `true`)
- `TECHNICIAN_ACCOUNT_REQUIRE_BACKUP_MAX_AGE_HOURS` (default `168` = 7 dias)

**Lógica compartilhada** (`apps/api/src/technicians/technician-accounts.util.ts`):

```typescript
export function evaluateRecentBackupSkipReason(
  latestBackupAt: Date | null | undefined,
  maxAgeHours: number,
): string | null {
  if (!latestBackupAt) {
    return 'no recent config backup found';
  }
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  if (Date.now() - latestBackupAt.getTime() > maxAgeMs) {
    return 'no recent config backup found';
  }
  return null;
}
```

**Integração** (`apps/api/src/technicians/technicians.service.ts`):

- `fetchLatestBackupAtByNode(nodeIds)`: busca em lote (uma única query `groupBy`/`max`) o timestamp do backup mais recente de `config.xml` por node — evita N+1 em operações de lote.
- `getBackupSkipReason(nodeId, latestBackupAt)`: aplica a flag `requireRecentBackupEnabled` e delega para `evaluateRecentBackupSkipReason`.
- Integrado em todos os pontos de decisão de elegibilidade, individuais e em lote:
  - `getNodeEligibilitySkipReason` (base usada por várias checagens)
  - `getProvisionSkipReason` / `assertProvisionAllowed` → usado por `provisionNodeAccount` e `planBatchProvision`
  - `getPasswordResetSkipReason` / `assertPasswordResetAllowed` → usado por `resetNodeAccountPassword` e `planBatchPasswordReset`
  - `assertRevokeAllowed` → usado por `revokeOnNode` e `planBatchRevoke`
- Nas operações em lote, `fetchLatestBackupAtByNode` é chamado **uma vez** para todos os nodes do lote (não por node dentro do loop).

**Mensagem ao operador**: motivo curto `'no recent config backup found'`, no mesmo formato dos demais motivos de skip já existentes (`'agent below minimum version'`, etc.), mapeado no painel:

- `apps/web/components/nodes/fleet-technician-management-panel.tsx` (`mapSkipReason`): `'Bloqueado — sem backup recente do config.xml (rode um backup manual)'`.
- A nova página `/admin/tecnicos` reaproveita o mesmo `FleetTechnicianManagementPanel`, portanto herda automaticamente o mesmo mapeamento — não foi necessário duplicar em outro lugar do front.

### Escopo do bloqueio

O gate cobre as quatro operações de escrita em usuários locais mencionadas na tarefa: `local_user_create` (provisionar), `local_user_set_password` (resetar senha), `local_user_disable` e `local_user_delete` (as duas últimas via revogação `disable`/`delete`).

### Validação

- `cd apps/api && npm run build` — sem erros de tipagem.
- Inspeção manual da tabela `node_config_backups` no Postgres deste ambiente: parte relevante dos nodes já possui backup dentro da janela de 7 dias, confirmando que o gate, com a configuração default, não bloqueia operação normal em nodes com rotina de backup em dia.
- Não existe script de smoke automatizado dedicado a este módulo (`technicians`) no repositório; a validação foi manual (build + revisão de código + leitura de dados reais do banco). **Risco residual**: recomenda-se criar um smoke `scripts/smoke-technician-accounts.sh` cobrindo provisionamento, reset, revogação e o novo gate de backup em uma sessão futura.

## Arquivos novos

- `apps/web/app/admin/tecnicos/page.tsx`
- `apps/web/components/nodes/node-technician-accounts-panel.tsx`
- `apps/web/lib/technician-status.ts`
- `docs/154-ENTREGA-ADMIN-TECNICOS-GATE-BACKUP-2026-07-31.md` (este documento)

## Arquivos alterados

- `apps/api/src/config/app-config.ts`
- `apps/api/src/technicians/technician-accounts.util.ts`
- `apps/api/src/technicians/technicians.service.ts`
- `apps/api/src/technicians/technician-node-accounts.controller.ts`
- `apps/api/package.json` (versão)
- `.env.api`, `.env.api.example`
- `apps/web/lib/api.ts`
- `apps/web/lib/route-policy.ts`
- `apps/web/lib/technicians.ts`
- `apps/web/components/app-sidebar.tsx`
- `apps/web/components/nodes/fleet-technician-management-panel.tsx`
- `apps/web/app/nodes/[id]/page.tsx`
- `apps/web/package.json` (versão)
- `.cursor/rules/versioning.mdc`, `docs/00-INDICE-OPERACIONAL.md`, `00_inicio.md`, `LEITURA-INICIAL.md`, `docs/HISTORICO-E-LINHA-DO-TEMPO.md` (governança documental)

## Limitações e riscos residuais

- Não existe suite automatizada de teste unitário para `technicians.service.ts` neste repositório; a validação do gate de backup e da nova listagem por node foi feita por build + revisão manual, não por teste automatizado.
- A opção de design "exigir backup sempre" (em vez de só na primeira escrita) é mais simples e segura, mas tem custo operacional: se um node não tiver rotina de backup automatizado ativa, toda escrita de usuário técnico ficará bloqueada até um backup manual ser rodado. Isso é intencional (o produto já expõe backup em lote no inventário como solução), mas deve ser comunicado às equipes operacionais antes do rollout.
- A validação E2E do gate de backup contra um pfSense real (bloqueio efetivo de `local_user_create`/`set_password`/`disable`/`delete` sem backup recente) não foi executada nesta sessão — apenas a lógica de decisão foi validada via build e leitura de dados reais do banco local.
