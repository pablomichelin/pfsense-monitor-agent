# 29. Plano de execução — Fase 6: Conta separada + polimento PT-BR

Data: `2026-06-09`  
Status: `encerrado` — ver `docs/88-ENCERRAMENTO-ROADMAP-UX-FASE0-FASE8-2026-06-09.md`  
Próximo passo operacional: `docs/85-TRILHA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md`

## Documentos relacionados

| Documento | Papel |
|-----------|--------|
| `24-plano-fase0-fase1-layout-navegacao-ui-foundation-2026-06-09.md` | Roadmap UX — Fase 6 |
| `docs/84-ENTREGA-FRONTEND-FASE5-BACKUPS-FROTA-MENU-2026-06-09.md` | Entrega anterior (backups frota) |
| `docs/SISTEMA-VISUAL-PAINEL.md` | Design system |
| `apps/web/app/sessions/page.tsx` | Conteúdo atual (mistura conta + sessões) |

## Objetivo

Separar **perfil do usuário** (`/conta`) de **sessões ativas** (`/sessions`), corrigir duplicata no menu Conta e aplicar polimento PT-BR pontual em labels e breadcrumbs.

## Versões alvo

| Componente | Versão atual | Versão alvo | Tipo |
|------------|--------------|-------------|------|
| API | `0.2.6` | `0.2.6` | Sem alteração (sem endpoint novo) |
| Painel web | `0.6.0` | `0.7.0` | **minor** — nova rota + separação de fluxo |

## Decisão de API

Não existe endpoint de troca de senha self-service (`POST /auth/change-password` ou similar). A página `/conta` exibe perfil via `GET /api/v1/auth/me` e informa que alteração de senha é feita pelo administrador. **Não criar endpoint nesta fase.**

## Escopo autorizado

### Nova rota `/conta`

- `PageHero` com e-mail, perfil (role) e contagem de permissões
- Seção identificação: e-mail, perfil (`roleLabel`)
- Seção senha: texto informativo (sem formulário — API inexistente)
- Link para `/sessions` para gestão de sessões

### Ajuste `/sessions`

- Foco exclusivo em sessões ativas/revogação
- `PageHero`: título **Sessões**, descrição PT-BR correta
- Cabeçalhos de tabela com acentos (Última atividade, Criação, Expiração, Ação)

### Menu e navegação

- Grupo **Conta**: **Minha conta** → `/conta`, **Sessões** → `/sessions` (sem duplicata)
- Breadcrumbs: Conta › Minha conta (`/conta`), Conta › Sessões (`/sessions`)
- `logoutAction` / `revokeSessionAction`: `revalidatePath('/conta')`

### Polimento PT-BR (limitado)

Corrigir acentos óbvios encontrados por grep em:

- `sessions/page.tsx`, `lib/auth.ts`, `lib/rbac-labels.ts`
- `components/node-config-backups-section.tsx` (detalhe firewall)
- Mensagens de redirect de sessão

**Fora deste bloco:** refatoração completa de admin, auditoria, bootstrap.

## Arquivos novos

- `apps/web/app/conta/page.tsx`
- `29-plano-fase6-conta-separada-polimento-ptbr-2026-06-09.md`
- `docs/85-TRILHA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md`
- `docs/85-ENTREGA-FRONTEND-FASE6-CONTA-SEPARADA-POLIMENTO-PTBR-2026-06-09.md`

## Arquivos alterados

- `apps/web/app/sessions/page.tsx`
- `apps/web/lib/route-policy.ts`
- `apps/web/components/breadcrumbs.tsx`
- `apps/web/lib/auth.ts`
- `apps/web/lib/rbac-labels.ts`
- `apps/web/components/node-config-backups-section.tsx`
- `apps/web/package.json` → `0.7.0`
- Índices + histórico

## Fora de escopo

- Fase 7 (Auditoria filtros)
- Fase 8 (adoção global DataTable)
- Endpoint API troca de senha
- Refatoração admin completa

## Critérios de aceite

- [ ] `/conta` exibe e-mail e perfil do usuário logado
- [ ] `/sessions` lista e revoga sessões (comportamento preservado)
- [ ] Menu Conta: dois itens com rotas distintas
- [ ] Breadcrumbs PT-BR corretos em `/conta` e `/sessions`
- [ ] Login/logout/sessões funcionam
- [ ] Build web OK; deploy OK; rodapé `v0.7.0`
