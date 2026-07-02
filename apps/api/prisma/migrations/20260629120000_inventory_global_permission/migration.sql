INSERT INTO "permissions" ("id", "description") VALUES
  ('inventory.global', 'Menu Cadastro: criar clientes e firewalls')
ON CONFLICT ("id") DO UPDATE SET
  description = EXCLUDED.description;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'inventory.global')
ON CONFLICT DO NOTHING;
