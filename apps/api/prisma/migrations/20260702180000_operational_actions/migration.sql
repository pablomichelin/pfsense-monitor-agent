-- AlterEnum
ALTER TYPE "node_command_type" ADD VALUE 'service_restart';
ALTER TYPE "node_command_type" ADD VALUE 'node_reboot';

-- Permissions
INSERT INTO "permissions" ("id", "description") VALUES
  ('service.restart.run', 'Reiniciar serviços allowlistados no pfSense'),
  ('node.reboot.run', 'Reiniciar firewall (reboot) com confirmação')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'service.restart.run'),
  ('superadmin', 'node.reboot.run'),
  ('admin', 'service.restart.run'),
  ('admin', 'node.reboot.run')
ON CONFLICT DO NOTHING;
