-- Firmware branch reportado pelo agente + pedido remoto de troca allowlistada.
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "pfsense_firmware_branch" TEXT;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "pfsense_firmware_branch_descr" TEXT;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "pfsense_update_branches" TEXT;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "pfsense_update_branch_requested_at" TIMESTAMPTZ(6);
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "pfsense_update_branch_target" TEXT;
