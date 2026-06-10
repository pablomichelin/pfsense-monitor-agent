# Entrega pós-RBAC — UX escopo de clientes e layout responsivo

**Data:** 2026-06-09  
**Escopo:** apenas painel web e script operacional (sem mudança de contrato da API).

## Versões

| Componente | Versão | Motivo |
|------------|--------|--------|
| API | `0.2.4` | Sem alteração de código nesta microtrilha |
| Painel web | `0.2.5` | Escopo multi-coluna + shell fluido responsivo |

### Histórico de bumps (painel)

| Versão | Entrega |
|--------|---------|
| `0.2.4` | `ClientScopePicker` lista Explorer multi-coluna; script `scripts/purge-smoke-test-data.sh`; layout formulário usuários |
| `0.2.5` | Shell `.app-shell` fluido com breakpoints; `PageHero` e cards em largura total; Tailwind escaneia `components/` |

## O que foi entregue

1. **Clientes permitidos** (`apps/web/components/client-scope-picker.tsx` + `globals.css`)
   - Grid `grid-auto-flow: column` com 16 linhas fixas
   - Scroll horizontal no quadro; sem crescimento vertical ilimitado
   - Seleção individual, selecionar todos, remover seleção preservados

2. **Limpeza smoke** (`scripts/purge-smoke-test-data.sh`)
   - Remove clientes/usuários de teste RBAC e backup
   - `DRY_RUN=1` para simulação

3. **Layout responsivo** (`globals.css` `.app-shell`, `layout.tsx`)
   - Largura adaptável: 1280px → 1520px → 1760px → 1920px por breakpoint
   - Mobile: `calc(100vw - 24px)`
   - `overflow-x-hidden` na página; scroll horizontal só em componentes internos

## Arquivos principais

- `apps/web/app/globals.css`
- `apps/web/app/layout.tsx`
- `apps/web/components/client-scope-picker.tsx`
- `apps/web/components/role-scope-fields.tsx`
- `apps/web/components/page-hero.tsx`
- `scripts/purge-smoke-test-data.sh`

## Testes manuais sugeridos

- [ ] `/admin/usuarios` — lista de clientes em múltiplas colunas com scroll horizontal
- [ ] Selecionar todos / remover seleção / salvar escopo
- [ ] Ultrawide (≥1920px) — conteúdo mais largo que `max-w-7xl` antigo
- [ ] Notebook (1366px) — sem scroll horizontal na página inteira

## Referência de versionamento

Regra Cursor: `.cursor/rules/versioning.mdc`
