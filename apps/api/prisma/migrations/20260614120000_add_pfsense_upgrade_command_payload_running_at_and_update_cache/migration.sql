-- AlterEnum
ALTER TYPE "node_command_type" ADD VALUE 'pfsense_upgrade';

-- AlterTable
ALTER TABLE "node_commands" ADD COLUMN "payload_json" JSONB;
ALTER TABLE "node_commands" ADD COLUMN "running_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "nodes" ADD COLUMN "pfsense_update_available" BOOLEAN;
ALTER TABLE "nodes" ADD COLUMN "pfsense_update_target_version" TEXT;
ALTER TABLE "nodes" ADD COLUMN "pfsense_update_checked_at" TIMESTAMPTZ(6);
ALTER TABLE "nodes" ADD COLUMN "ha_detected_from_agent" BOOLEAN;

-- Permissions
INSERT INTO "permissions" ("id", "description")
VALUES ('pfsense.upgrade.run', 'Disparar upgrade pfSense OS')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'pfsense.upgrade.run'),
  ('admin', 'pfsense.upgrade.run')
ON CONFLICT DO NOTHING;
