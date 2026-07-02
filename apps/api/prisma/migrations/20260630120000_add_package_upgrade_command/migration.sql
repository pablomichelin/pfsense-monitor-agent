-- AlterEnum
ALTER TYPE "node_command_type" ADD VALUE 'package_upgrade';

-- Permissions
INSERT INTO "permissions" ("id", "description")
VALUES ('package.upgrade.run', 'Disparar upgrade remoto do package SystemUp Monitor')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'package.upgrade.run'),
  ('admin', 'package.upgrade.run')
ON CONFLICT DO NOTHING;
