-- Firewall table management (Diagnostics > Tables) via agent commands.
INSERT INTO "permissions" ("id", "description") VALUES
  ('firewall.table.manage', 'Consultar e remover entradas em tabelas pf (Diagnostics > Tables)')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'firewall.table.manage'),
  ('admin', 'firewall.table.manage')
ON CONFLICT DO NOTHING;
