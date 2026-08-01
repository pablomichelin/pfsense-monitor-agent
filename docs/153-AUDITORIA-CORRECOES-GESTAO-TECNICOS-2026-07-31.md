# 153 — Auditoria e correções: gestão centralizada de técnicos pfSense

**Data:** 2026-07-31
**Escopo:** revisão de código de ponta a ponta (API, agente pfSense, painel web) das entregas 148–152 (revogação, provisionamento, reset de senha e exclusão de cadastro de técnicos), a pedido do operador ("esse software deve ficar 10/10, verificar se tem erro de programação").
**Resultado:** 6 achados corrigidos nesta sessão (2 críticos, 3 de severidade média, 1 de consistência/qualidade). API **0.9.0**, painel **1.9.0**, package pfSense **0.5.3**.

---

## 1. Achados e correções

### 1.1 [CRÍTICO] Vazamento de senha em texto claro via histórico/detalhe de comando

**Onde:** `CommandOrchestratorService.serializeCommand()` (`apps/api/src/commands/command-orchestrator.service.ts`), usado por:
- `GET /api/v1/nodes/:nodeId/commands/history`
- `GET /api/v1/nodes/:nodeId/commands/:commandId`

**Problema:** o campo `payload_json` era serializado sem nenhuma sanitização. Para comandos `local_user_create` e `local_user_set_password`, esse payload contém a senha em texto claro **até o agente confirmar `picked_up`** (a varredura de senha em `NodeCommandsService.scrubCommandPassword()` só acontece nesse momento). Os dois endpoints acima exigem apenas a permissão `firewalls.view` — bem mais ampla que `technicians.manage`/`technicians.password_reset.run` — então qualquer usuário com acesso de visualização ao firewall (não necessariamente autorizado a gerir técnicos) podia abrir o histórico de comandos do node e ver a senha enquanto o comando estivesse `pending`.

**Correção:** `serializeCommand()` agora varre (`scrubPasswordFromPayload`) o campo `password` de `payload_json` sempre que o tipo do comando for `local_user_create`/`local_user_set_password`, independente do estado persistido no banco. Isso fecha a janela de exposição em qualquer endpoint de leitura, mantendo a varredura no banco (no `picked_up`) como camada adicional. `GET /api/v1/command-batches/:batchId` não foi afetado — ele só expõe `progress`, não o payload completo.

### 1.2 [CRÍTICO] `local_user_create` nunca atribuía `uid` ao novo usuário

**Onde:** `manage_local_user.php::handle_create()` (agente pfSense).

**Problema:** o fluxo de criação montava o array do usuário (`name`, `descr`, senha, `priv`) e chamava `local_user_set($user)` sem nunca definir `$user['uid']`. No pfSense, a atribuição de uid para um usuário novo é responsabilidade de quem chama `local_user_set()` (a GUI faz isso em `system_usermanager.php`, lendo/incrementando `system/nextuid`) — a função em si não gera nem reserva um uid. Sem isso, a conta criada ficaria sem identidade Unix consistente, arriscando falha silenciosa na sincronização do SO ou persistência de uma entrada inválida em `config.xml`. Esse era exatamente o fluxo que a última sessão havia deixado como "pendente de validação E2E no lab 254" — nunca chegou a ser testado contra um pfSense real.

**Correção:** nova função `allocate_next_local_uid()` replica o comportamento da GUI: lê `system/nextuid`; se ausente/inválido, deriva do maior uid existente em `system/user` (piso 2000, convenção pfSense para contas locais). `handle_create()` agora define `uid`/`scope` no array do usuário, acrescenta a entrada completa em `system/user` e persiste `system/nextuid` incrementado antes do `write_config()` — mesmo padrão já usado pelos fluxos de `disable`/`delete` neste arquivo.

**Pendência que permanece:** validar ponta-a-ponta em laboratório (254 read-only já mapeou as funções `auth.inc`; falta um teste de escrita real, idealmente em VM CE 2.8.1 descartável) antes do rollout em produção — já era um gate conhecido do plano 144, reforçado aqui pela gravidade do bug encontrado.

### 1.3 [MÉDIO] Erros de validação de senha/usuário retornavam 500 em vez de 400

**Onde:** `technician-accounts.util.ts` (`validatePfsenseUsername`, `validatePrivilegeProfile`, `validateTechnicianPassword`, `assertObjectPayload`).

**Problema:** essas funções lançavam `Error` genérico. Quando chamadas diretamente pelo `TechniciansService` (criar técnico, provisionar, resetar senha, lote de provisionamento/reset) — sem passar pelo wrapper de `command-registry.ts` que converte para `BadRequestException` — a exceção não tratada virava um `500 Internal Server Error` opaco. Na prática: cadastrar um técnico com login `admin`/`root`, ou informar uma senha com menos de 12 caracteres, quebrava com uma mensagem genérica em vez de um erro de validação claro.

**Correção:** as funções agora lançam `BadRequestException` (NestJS). Compatível com o wrapper existente em `command-registry.ts` (que já tratava `error instanceof Error`) e corrige diretamente os fluxos de criação/provisionamento/reset no painel, que agora mostram a mensagem real do erro (ex.: "password must be 12-64 characters").

### 1.4 [MÉDIO] Login revogado ficava bloqueado para sempre

**Onde:** `TechniciansService.createTechnician()`.

**Problema:** `login_username` é único globalmente na tabela `technicians`, inclusive para registros com `status = revoked`. Depois de remover um técnico do cadastro central (ex.: engano do operador, ou o técnico é recontratado depois), não era possível recriar um cadastro com o mesmo login — a API retornava `409 login_username already registered` para sempre.

**Correção:** ao detectar conflito de login com um técnico **revogado**, o cadastro é reativado (nome/observações atualizados, `status=active`, `revokedAt`/`revokedByUserId` limpos) em vez de bloquear. Conflito com técnico **ativo** continua bloqueado normalmente. Auditoria registra a ação `technician.reactivate`.

### 1.5 [MÉDIO] Provisionar/resetar senha em lote não pedia confirmação

**Onde:** `BatchProvisionTechnicianDto`/`BatchPasswordResetTechnicianDto` (API) e `FleetTechnicianManagementPanel` (painel).

**Problema:** ao contrário de "Revogar" (que exige digitar `CONFIRMAR`), um clique único em "Provisionar em N firewall(s)" já criava um usuário administrador com senha (gerada ou informada) em todos os firewalls do filtro/seleção — potencialmente dezenas de produção — sem nenhuma etapa de confirmação. O mesmo valia para reset de senha em lote, que invalida a senha atual do técnico imediatamente nesses firewalls.

**Correção:** as duas ações passaram a exigir `confirm: "CONFIRMAR"` no corpo da requisição (novo campo obrigatório nos DTOs, validado pelo `ValidationPipe` global) e o painel agora mostra a mesma etapa de confirmação por texto usada em "Revogar" antes de disparar o lote.

### 1.6 [BAIXO] Inconsistência de fail-open/fail-closed em `userExistsInSnapshot`

**Onde:** `technician-accounts.util.ts`.

**Problema:** `userExistsInSnapshot()` retornava `true` (assume que o usuário existe) quando o snapshot estava vazio/ausente, enquanto a função irmã `userAlreadyActiveInSnapshot()` retorna `false` no mesmo cenário. Hoje isso é inofensivo porque todos os pontos de chamada já bloqueiam antes por "snapshot indisponível" — mas é uma armadilha para qualquer novo fluxo que reaproveite a função sem essa checagem prévia (poderia permitir uma revogação/reset prosseguir sem confirmação real de que o usuário existe no firewall).

**Correção:** default alterado para `false` (fail-closed), sem mudança de comportamento observável hoje (todos os chamadores atuais já têm o guard prévio).

---

## 2. O que foi verificado e está correto (sem necessidade de mudança)

- Varredura de senha do banco (`scrubCommandPassword`) disparada exatamente no ack de `picked_up`, coberta por transição de estado com CAS (evita corrida de ack duplicado).
- Limpeza do payload no disco do pfSense: `dispatch_local_user_action()` usa `trap cleanup_payload EXIT INT TERM`, removendo o arquivo de payload (que contém a senha em texto claro) assim que a execução termina, com ou sem sucesso.
- Guardrail de "última conta admin ativa" (`wouldViolateLastAdminGuardrail`) aplicado tanto no lote quanto na ação individual de revogar/desativar.
- Auditoria (`audit_logs`) nunca inclui a senha em `metadataJson` em nenhum dos fluxos (criar, provisionar, resetar, revogar, reativar).
- `password_display_once` é retornado apenas uma vez na resposta HTTP da própria ação (não fica em nenhuma tabela em texto claro).
- Build de API e painel sem erros de tipagem após todas as correções.

## 3. Pendências que continuam em aberto (fora do escopo desta auditoria)

- Validação E2E de `local_user_create`/`local_user_set_password` em pfSense real (254 read-only ou VM CE 2.8.1 descartável) — agora ainda mais importante por causa do achado 1.2.
- Rollout do package pfSense (agora **0.5.3**) na frota — responsabilidade operacional do usuário.
- Página dedicada `/admin/tecnicos` (Fase 3 do plano 144) — cadastro hoje vive embutido no painel de `/nodes`.
- Gate de backup recente antes da primeira escrita por node (guardrail do plano 144, ainda não implementado).

---

## 4. Versões desta entrega

| Componente | Antes | Depois |
|---|---|---|
| API | `0.8.5` | `0.9.0` |
| Painel web | `1.8.1` | `1.9.0` |
| Package pfSense | `0.5.2` | `0.5.3` |
