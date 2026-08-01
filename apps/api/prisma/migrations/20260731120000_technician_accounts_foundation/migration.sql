-- Fase 0 doc 144: fundacao gestao centralizada de usuarios locais pfSense (tecnicos)

CREATE TYPE "technician_status" AS ENUM ('active', 'revoked');

CREATE TYPE "technician_node_account_status" AS ENUM (
  'pending_create',
  'active',
  'password_reset_pending',
  'disabled',
  'removed',
  'failed'
);

ALTER TYPE "node_command_type" ADD VALUE 'local_user_create';
ALTER TYPE "node_command_type" ADD VALUE 'local_user_set_password';
ALTER TYPE "node_command_type" ADD VALUE 'local_user_disable';
ALTER TYPE "node_command_type" ADD VALUE 'local_user_delete';

CREATE TABLE "technicians" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" TEXT NOT NULL,
    "login_username" TEXT NOT NULL,
    "status" "technician_status" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_by_user_id" UUID,
    "revoked_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technician_node_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "technician_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "pfsense_username" TEXT NOT NULL,
    "privilege_profile" TEXT NOT NULL DEFAULT 'operational_default',
    "status" "technician_node_account_status" NOT NULL DEFAULT 'pending_create',
    "last_command_id" UUID,
    "last_synced_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "technician_node_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "technicians_login_username_key" ON "technicians"("login_username");

CREATE INDEX "technician_node_accounts_node_id_idx" ON "technician_node_accounts"("node_id");

CREATE INDEX "technician_node_accounts_status_idx" ON "technician_node_accounts"("status");

CREATE UNIQUE INDEX "technician_node_accounts_technician_id_node_id_key"
ON "technician_node_accounts"("technician_id", "node_id");

ALTER TABLE "technician_node_accounts" ADD CONSTRAINT "technician_node_accounts_technician_id_fkey"
FOREIGN KEY ("technician_id") REFERENCES "technicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "technician_node_accounts" ADD CONSTRAINT "technician_node_accounts_node_id_fkey"
FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permissions (doc 144 §5.2 — superadmin only)
INSERT INTO "permissions" ("id", "description") VALUES
  ('technicians.view', 'Ver técnicos e contas locais pfSense associadas'),
  ('technicians.manage', 'Criar, provisionar, desabilitar e remover técnicos e contas locais pfSense'),
  ('technicians.password_reset.run', 'Resetar senha de conta local de técnico no pfSense')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'technicians.view'),
  ('superadmin', 'technicians.manage'),
  ('superadmin', 'technicians.password_reset.run')
ON CONFLICT DO NOTHING;
