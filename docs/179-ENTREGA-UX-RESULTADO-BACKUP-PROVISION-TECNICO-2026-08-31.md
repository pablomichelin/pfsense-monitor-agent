# 179 — Resultado do lote de técnicos após backup automático

**Data:** 2026-08-31  
**Versões:** API **0.11.0** (sem mudança) · painel **1.12.3**

## Problema

No Recon (`pfSense.recon.firewall`), o lote de provisionar o técnico `erick` enfileirou backup automático (gate de 7 dias) e **concluiu no backend**: `config_backup_now` succeeded e `local_user_set_password` succeeded, conta `active`.

A tela de resultado não acompanhava o pipeline:

- alerta amarelo (“erro”) quando o lote só tinha `backup_queued` (`enqueued = 0`);
- coluna Resultado presa em **Backup enfileirado**;
- Detalhe preso em **Backup enfileirado — provisionamento após conclusão**, mesmo com status **Concluído**.

Parecia falha de backup que “não ajusta”.

## Solução

O painel passa a resolver o resultado ao vivo:

1. Enquanto o backup roda: **Backup em andamento** / “Gerando backup do config.xml…”.
2. Após o backup: **Backup concluído — aplicando usuário no firewall**.
3. Conta `active`: **Provisionado** / **Usuário aplicado no firewall** (alerta verde).
4. Falha de backup ou do follow-up: resultado e detalhe com o erro real.

O polling do pipeline caiu de 12s para 5s.

## Operacional

- A senha gerada no lote do Recon **já foi aplicada** no firewall; não é necessário reprovisionar só por causa da tela antiga.
- Backup agendado “só se mudou” não gera linha `stored` nova; o gate de 7 dias pode enfileirar backup de novo. Isso é o guardrail, não falha.

## Arquivos

- `apps/web/components/nodes/fleet-technician-management-panel.tsx`
- `apps/web/package.json` → `1.12.3`
