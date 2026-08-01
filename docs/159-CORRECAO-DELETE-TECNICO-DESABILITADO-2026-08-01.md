# Correção — exclusão de técnico desabilitado

**Data:** 2026-08-01  
**Versões:** API **`0.10.2`** · painel `1.10.6` · package `0.5.6` (sem mudança)

## Problema

Ao excluir em lote um técnico **desabilitado** no User Manager do pfSense, o painel retornava *Ignorado* com “Usuário não encontrado no firewall”, embora o usuário existisse (ícone desabilitado).

## Causa

Em `apps/api/src/technicians/technician-accounts.util.ts`, `userExistsInSnapshot()` exigia `!entry.disabled`. Contas desativadas eram tratadas como inexistentes antes do enqueue do comando. O agente já conseguia apagar usuários desabilitados se o comando chegasse até ele.

## Correção

- Existência no snapshot: match só por nome (ativo ou desabilitado).
- “Já ativo” continua em `userAlreadyActiveInSnapshot()` (filtra `!disabled`).

## Validação

1. No pfSense: usuário técnico presente e **desabilitado**.
2. Em `/nodes`: selecionar o firewall → Gestão de técnicos → **Excluir**.
3. Esperado: lote confirmado (não “ignorado”) e usuário removido do User Manager.
