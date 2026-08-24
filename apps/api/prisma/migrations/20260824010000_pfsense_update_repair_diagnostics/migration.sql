-- Diagnóstico do check de OS + pedido de reparo oficial do repositório pkg.
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "pfsense_update_error_class" TEXT;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "pfsense_update_log_snippet" TEXT;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "pfsense_repo_repair_requested_at" TIMESTAMPTZ(6);
