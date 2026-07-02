-- Permissions (Fase 11)
INSERT INTO "permissions" ("id", "description") VALUES
  ('pfsense.alias.view', 'Listar aliases pfREST read-only e comparar com backup'),
  ('pfsense.alias.manage', 'Preparar alterações de aliases (preview)'),
  ('pfsense.alias.apply', 'Aplicar aliases no pfSense via pfREST (piloto)')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'pfsense.alias.view'),
  ('superadmin', 'pfsense.alias.manage'),
  ('superadmin', 'pfsense.alias.apply'),
  ('admin', 'pfsense.alias.view'),
  ('admin', 'pfsense.alias.manage')
ON CONFLICT DO NOTHING;
