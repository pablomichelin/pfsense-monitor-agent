-- Pedido do portal para o agente atualizar repositórios pkg e rechecar o OS.
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "pfsense_update_force_check_at" TIMESTAMPTZ(6);
