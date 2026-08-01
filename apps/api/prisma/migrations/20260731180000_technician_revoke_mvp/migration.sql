-- Snapshot de usuarios locais pfSense (guardrail ultima conta admin)
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "local_users_snapshot_json" JSONB;

-- Default admin_full para novas contas de tecnico
ALTER TABLE "technician_node_accounts" ALTER COLUMN "privilege_profile" SET DEFAULT 'admin_full';
