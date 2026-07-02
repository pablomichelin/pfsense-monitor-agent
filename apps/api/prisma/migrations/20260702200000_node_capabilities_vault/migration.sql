-- CreateEnum
CREATE TYPE "node_capability_access_mode" AS ENUM ('unknown', 'direct', 'agent', 'manual');
CREATE TYPE "node_external_credential_type" AS ENUM ('pfrest_api');
CREATE TYPE "node_external_credential_auth_method" AS ENUM ('api_key', 'bearer_token');
CREATE TYPE "node_external_credential_status" AS ENUM ('active', 'rotated', 'revoked');
CREATE TYPE "node_credential_event_type" AS ENUM ('created', 'rotated', 'revoked', 'test_success', 'test_failure');

-- CreateTable
CREATE TABLE "node_capabilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "pfrest_enabled" BOOLEAN,
    "pfrest_version" TEXT,
    "api_base_url" TEXT,
    "access_mode" "node_capability_access_mode" NOT NULL DEFAULT 'unknown',
    "auth_method" TEXT,
    "capabilities_json" JSONB,
    "last_reported_at" TIMESTAMPTZ(6),
    "last_probe_at" TIMESTAMPTZ(6),
    "last_success_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "node_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "node_external_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "credential_type" "node_external_credential_type" NOT NULL DEFAULT 'pfrest_api',
    "auth_method" "node_external_credential_auth_method" NOT NULL,
    "secret_hint" TEXT NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "status" "node_external_credential_status" NOT NULL DEFAULT 'active',
    "scope_description" TEXT,
    "rotated_at" TIMESTAMPTZ(6),
    "last_tested_at" TIMESTAMPTZ(6),
    "last_test_result" TEXT,
    "created_by" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "node_external_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "node_credential_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "credential_id" UUID,
    "event_type" "node_credential_event_type" NOT NULL,
    "actor_id" UUID,
    "result" TEXT NOT NULL DEFAULT 'success',
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_credential_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "node_capabilities_node_id_key" ON "node_capabilities"("node_id");
CREATE INDEX "node_external_credentials_node_id_status_idx" ON "node_external_credentials"("node_id", "status");
CREATE INDEX "node_external_credentials_node_id_credential_type_status_idx" ON "node_external_credentials"("node_id", "credential_type", "status");
CREATE INDEX "node_credential_events_node_id_created_at_idx" ON "node_credential_events"("node_id", "created_at");
CREATE INDEX "node_credential_events_credential_id_idx" ON "node_credential_events"("credential_id");

-- AddForeignKey
ALTER TABLE "node_capabilities" ADD CONSTRAINT "node_capabilities_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "node_external_credentials" ADD CONSTRAINT "node_external_credentials_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "node_credential_events" ADD CONSTRAINT "node_credential_events_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "node_credential_events" ADD CONSTRAINT "node_credential_events_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "node_external_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permissions (Fase 10)
INSERT INTO "permissions" ("id", "description") VALUES
  ('pfsense.api.view', 'Visualizar capacidades pfREST e inventário read-only'),
  ('pfsense.credentials.manage', 'Cadastrar, rotacionar e testar credenciais pfREST')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'pfsense.api.view'),
  ('superadmin', 'pfsense.credentials.manage'),
  ('admin', 'pfsense.api.view'),
  ('admin', 'pfsense.credentials.manage')
ON CONFLICT DO NOTHING;
