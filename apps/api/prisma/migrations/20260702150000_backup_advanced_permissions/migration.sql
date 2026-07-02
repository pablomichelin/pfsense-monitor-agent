INSERT INTO "permissions" ("id", "description") VALUES
  ('backups.manage', 'Gerenciar politica de retencao e drift de backups')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'backups.manage'),
  ('admin', 'backups.manage')
ON CONFLICT DO NOTHING;
