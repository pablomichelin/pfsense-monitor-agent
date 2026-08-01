# 156 — Correção: Server Action da gestão de técnicos derrubava `/nodes`

**Data:** 2026-08-01  
**Escopo:** painel web — fluxo de provisionar/resetar/revogar técnicos em lote em `/nodes` e `/admin/tecnicos`.  
**Versões:** API `0.10.0` (sem mudança) · painel **`1.10.1`** · package `0.5.4` (sem mudança).

## Sintoma

Ao confirmar “Provisionar” na seção **Gestão de técnicos pfSense**, a página `/nodes` exibia o banner genérico do Next.js:

> An error occurred in the Server Components render…

Logs do container web: `Error: password must be 12-64 characters` (digest `2710855152`).

## Causa

1. **Server Actions lançavam `ApiError`** (`apps/web/lib/technicians.ts`). No App Router do Next.js 15, exceção não serializada corretamente a partir de Server Action aparece como falha de Server Components, em vez de mensagem amigável no painel — mesmo com `try/catch` no cliente.
2. **Senha inválida (curta)** chegava à API (`password must be 12-64 characters`). Cenário típico: campo “opcional” preenchido sem o operador perceber (autofill do navegador/gerenciador de senhas com senha &lt; 12 caracteres), ou senha digitada curta demais. A API rejeita corretamente; o painel é que não tratava o erro sem derrubar a página.

## Correção

- Server Actions de técnicos passam a retornar `{ ok: true, data } | { ok: false, error }` (mesmo padrão de `package-upgrade.ts` / MFA / fleet-org), **sem throw** para o cliente.
- Mensagens de validação mapeadas para português.
- Validação client-side da senha (12–64 ou vazio = gerar) antes de abrir a confirmação e antes de enviar o lote.
- Payload omite `password` quando vazio (API gera automaticamente).
- Campo de senha com `autoComplete="off"` e atributos anti-autofill para reduzir preenchimento silencioso.

## Arquivos

- `apps/web/lib/technicians.ts`
- `apps/web/components/nodes/fleet-technician-management-panel.tsx`
- `apps/web/components/nodes/fleet-batch-technician-revoke-panel.tsx`
- `apps/web/package.json` → `1.10.1`

## Como retestar

1. Abrir `/nodes` → Ações em lote → Gestão de técnicos.
2. Deixar senha **vazia**, digitar `CONFIRMAR`, provisionar → deve enfileirar sem banner vermelho; senha gerada aparece uma vez.
3. Digitar senha com menos de 12 caracteres → alerta em português no painel, sem crash.
4. Digitar senha ≥ 12 caracteres → provisiona normalmente.
