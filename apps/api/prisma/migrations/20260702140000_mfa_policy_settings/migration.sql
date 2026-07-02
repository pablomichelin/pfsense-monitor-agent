CREATE TABLE "mfa_policy_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enforced_roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "enforcement_blocking" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mfa_policy_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "mfa_policy_settings" ("id", "enforced_roles", "enforcement_blocking", "updated_at")
VALUES ('default', ARRAY[]::TEXT[], false, CURRENT_TIMESTAMP);

INSERT INTO "permissions" ("id", "description") VALUES
  ('security.mfa_policy.view', 'Visualizar politica MFA e conformidade'),
  ('security.mfa_policy.manage', 'Gerenciar politica MFA (enforcement por perfil)')
ON CONFLICT ("id") DO UPDATE SET
  description = EXCLUDED.description;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'security.mfa_policy.view'),
  ('superadmin', 'security.mfa_policy.manage'),
  ('admin', 'security.mfa_policy.view')
ON CONFLICT DO NOTHING;
