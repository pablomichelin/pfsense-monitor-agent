# 146 - Requisitos refinados: revogação em lote de técnicos pfSense

Data: `2026-07-31`

Status: **MVP implementado** (2026-07-31) — ver `docs/148-ENTREGA-MVP-REVOCACAO-TECNICOS-LOTE-2026-07-31.md`. Piloto operacional pendente (flags off em produção).

Documentos relacionados:

- Plano mestre (atualizado): `docs/144-PLANO-GESTAO-CENTRALIZADA-USUARIOS-LOCAIS-PFSENSE-2026-07-31.md` — seção **1.1**
- Fundação Fase 0: `docs/145-ENTREGA-TECNICIAN-ACCOUNTS-FOUNDATION-2026-07-31.md`
- Padrão UX lote: `apps/web/components/nodes/fleet-batch-backup-panel.tsx`, `fleet-batch-package-upgrade-panel.tsx`
- Padrão API lote: `docs/126-ENTREGA-ACOES-OPERACIONAIS-2026-07-02.md` (`backup-batch`), `docs/133-ENTREGA-BATCH-UPGRADE-PACKAGE-2026-07-02.md`

## 1. Caso de uso principal — demissão do João

**Situação hoje:** ~70 pfSense compartilham **uma senha** de webConfigurator. Demitir João exige trocar senha manualmente em dezenas de firewalls e redistribuir credencial para quem continua.

**Situação desejada (MVP):**

1. João (`login_username: joao.silva`) está cadastrado como `Technician` no controlador, com registros `TechnicianNodeAccount` nos firewalls onde tinha conta local.
2. João é demitido. Superadmin abre o inventário `/nodes`, seleciona **todos os firewalls** (ou filtra por cliente e seleciona o subconjunto relevante).
3. No painel de ação em lote, escolhe o técnico **João**, ação **Desativar** ou **Remover**, confirma com `CONFIRMAR`.
4. O controlador enfileira `local_user_disable` ou `local_user_delete` **por firewall selecionado**, via `JobBatch`.
5. Cada agente (package ≥ 0.5.0 com flag habilitada) executa no pfSense; o painel mostra resultado por firewall (sucesso, falha, ignorado, pendente).
6. João perde acesso imediato em todos os firewalls processados; **outros técnicos não são afetados**.

Provisionar novos técnicos ou trocar senha compartilhada por contas individuais é **objetivo de médio prazo** (Fase 1b/3), não bloqueia o MVP de revogação.

## 2. Fluxo UX esperado (passo a passo)

Referência visual/comportamental: backup em lote e upgrade de package em lote no inventário.

| Passo | Ação do operador | Sistema |
|---|---|---|
| 1 | Acessa `/nodes` | Lista firewalls com checkboxes (já existente para outras ações em lote) |
| 2 | Marca N firewalls **ou** usa "selecionar todos visíveis" no filtro atual | `mode: 'selection'`, `nodeIds[]` passados ao painel filho |
| 3 | Expande card **"Revogar acesso de técnico"** (novo) | `FleetBatchTechnicianRevokePanel` — mesmo layout de card que backup/upgrade |
| 4 | Seleciona técnico (dropdown ou busca) | Lista `GET /api/v1/technicians` (`status: active`) |
| 5 | Escolhe **Desativar** (reversível) ou **Remover** (destrutivo) | Delete exige confirmação extra se aplicável por firewall |
| 6 | Clica "Revogar em lote…" → confirma digitando `CONFIRMAR` | Igual `BatchRevokeTechnicianDto` / padrão reboot |
| 7 | Acompanha progresso | Poll `JobBatch` / status por comando (padrão `fleet-batch-package-upgrade-panel.tsx`) |
| 8 | Lê tabela de outcome por firewall | hostname, status do comando, motivo de skip (offline, agente antigo, conta inexistente) |
| 9 | (Opcional) Marca técnico como `revoked` no controlador | `POST /api/v1/technicians/:id/revoke` após lote bem-sucedido ou em paralelo |

**Modos de seleção** (copiar de `fleet-batch-backup-panel.tsx`):

- `selection`: apenas firewalls marcados na tabela.
- `filter`: todos os firewalls visíveis no filtro atual (sem precisar marcar um a um).

## 3. O que simplifica — admin completo, sem lab de privilégio mínimo

| Antes (plano 144 original) | Depois (refinamento) |
|---|---|
| Lab obrigatório de `priv.defs.inc` para perfil operacional mínimo | **Eliminado do caminho crítico** |
| Allowlist `operational_default` | Um perfil: **`admin_full`** (admin completo no webConfigurator) |
| Risco de técnicos com páginas insuficientes para operar | Técnicos operam como hoje (acesso amplo), mas **por usuário individual** |
| MVP dependia de create + privilégio correto | MVP foca só em **disable/delete** — não precisa criar usuário para entregar valor na demissão |

**Guardrails que permanecem:**

- Não desabilitar/remover a última conta admin **de recuperação** nativa do firewall (ex.: `admin` built-in).
- Confirmação forte em lote e em delete individual.
- RBAC `superadmin` + flags off por default + auditoria sem senha.

## 4. O que ainda precisa ser implementado

### 4.1 Agente pfSense (bloqueador principal)

Package atual **0.4.18**; `minAgentVersion` para `local_user_*` está em **0.5.0** (Fase 0).

| Item | Status | Notas |
|---|---|---|
| `manage_local_user.php` | Pendente | Ações `disable` e `delete` primeiro |
| `dispatch_local_user_disable` / `_delete` | Pendente | Padrão `dispatch_service_restart` |
| Payload 0600 em `process_heartbeat_commands` | Pendente | Nunca senha no dispatch_file tabulado |
| `MONITOR_AGENT_TECHNICIAN_ACCOUNTS_ENABLED` | Pendente | Default `0` |
| Lab CE 2.8.1: funções `auth.inc`, guardrail última admin | **Bloqueador** | Seção 6 do plano 144 — itens 1, 3, 4 |

### 4.2 API

| Item | Status | Notas |
|---|---|---|
| Models/RBAC/registry `local_user_*` | **Feito** (Fase 0, API 0.7.2) | Flags off, dispatch bloqueado por versão |
| `technicians.service.ts` + controllers | Pendente | CRUD mínimo + ações por node |
| `POST /api/v1/technician-accounts/batch-revoke` | Pendente | `JobBatch`, DTO `BatchRevokeTechnicianDto` |
| Integração `node-commands` audit prefix | Parcial | Registry existe; wiring completo na Fase 1 |

### 4.3 Painel web

| Item | Status | Notas |
|---|---|---|
| `lib/technicians.ts` | Pendente | Padrão `lib/package-upgrade.ts` |
| `fleet-batch-technician-revoke-panel.tsx` | Pendente | Embutir em `/nodes` junto aos painéis de backup/upgrade |
| `/admin/tecnicos` | Fase 3 | Não bloqueia MVP |

## 5. Ordem de implementação ajustada (valor para o operador)

```
Fase 0 ✅  Fundação DB/RBAC/registry (API 0.7.2)
    │
    ▼
Fase 1     Lab pfSense + agente disable/delete + API individual mínima
    │      (1–2 firewalls piloto, flags habilitadas só no lab)
    ▼
Fase 2 ★   batch-revoke API + UI lote no inventário  ← MVP entregável
    │
    ▼
Fase 1b    create/set_password + provisionamento individual (admin_full)
    │
    ▼
Fase 3     /admin/tecnicos, batch-provision, matriz técnico×firewall
    │
    ▼
Fase 4     smoke, rollout gradual, migração senha compartilhada → 1 user/técnico
```

**Critério de "MVP pronto":** superadmin revoga João em lote a partir do inventário, com feedback por firewall, sem abrir pfSense manualmente.

## 6. Contratos de referência (não reimplementar)

**API batch** — seguir:

- `POST /api/v1/operational-actions/backup-batch` → `createBackupBatchAction`
- `POST /api/v1/package-upgrade/batch` → `createPackageUpgradeBatchAction` + poll

**UI batch** — props e fluxo:

```tsx
// fleet-batch-backup-panel.tsx — seleção vs filtro
type Props = {
  nodeIds: string[];
  mode?: 'selection' | 'filter';
  totalVisibleCount?: number;
  clientId?: string;
  label?: string;
};
```

```tsx
// fleet-batch-package-upgrade-panel.tsx — poll + tabela de outcomes
createPackageUpgradeBatchAction → pollCommandBatchStatusAction (12s)
```

**Endpoint alvo (já especificado no plano 144):**

```
POST /api/v1/technician-accounts/batch-revoke
Body: { technician_id, node_ids?, confirm: 'CONFIRMAR' }
```

Se `node_ids` omitido: revogar em **todos** os firewalls onde existir conta ativa do técnico (comportamento a confirmar na implementação — preferência do operador: escopo = seleção do inventário).

## 7. Próximo passo concreto para implementação

1. **Lab pfSense CE 2.8.1** (firewall não crítico): script mínimo `manage_local_user.php` com `disable` e `delete`; validar `local_user_del()` / equivalente disable; confirmar guardrail "última conta admin"; documentar funções reais em nota de entrega Fase 1.
2. **Package 0.5.0**: implementar dispatchers + integração heartbeat; publicar artefato; manter `TECHNICIAN_ACCOUNTS_*` flags off em produção.
3. **API Fase 1**: `technicians.module` + disable/delete individual; testes RBAC.
4. **API + Web Fase 2**: `batch-revoke` + `FleetBatchTechnicianRevokePanel` no inventário; bump API/web semver minor.

Nenhum código além disso até lab validar disable/delete no pfSense real.
