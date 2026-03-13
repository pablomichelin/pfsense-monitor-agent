CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "entity_status" AS ENUM ('active', 'inactive');
CREATE TYPE "node_status" AS ENUM ('online', 'degraded', 'offline', 'maintenance', 'unknown');
CREATE TYPE "service_status" AS ENUM ('running', 'stopped', 'degraded', 'unknown', 'not_installed');
CREATE TYPE "gateway_status" AS ENUM ('online', 'degraded', 'down', 'unknown');
CREATE TYPE "alert_status" AS ENUM ('open', 'acknowledged', 'resolved');
CREATE TYPE "alert_type" AS ENUM (
  'heartbeat_missing',
  'service_down',
  'gateway_down',
  'version_change',
  'agent_error',
  'node_uid_conflict',
  'clock_skew',
  'auth_failure_repeated'
);
CREATE TYPE "alert_severity" AS ENUM ('critical', 'warning', 'info');
CREATE TYPE "node_uid_status" AS ENUM ('active', 'conflict', 'retired');
CREATE TYPE "node_credential_status" AS ENUM ('active', 'rotated', 'revoked');
CREATE TYPE "agent_token_status" AS ENUM ('active', 'expired', 'revoked');

CREATE TABLE "clients" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "entity_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "client_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "city" TEXT,
  "state" TEXT,
  "timezone" TEXT,
  "status" "entity_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nodes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "site_id" UUID NOT NULL,
  "node_uid" TEXT NOT NULL,
  "node_uid_status" "node_uid_status" NOT NULL DEFAULT 'active',
  "hostname" TEXT NOT NULL,
  "display_name" TEXT,
  "management_ip" TEXT,
  "wan_ip" TEXT,
  "pfsense_version" TEXT,
  "agent_version" TEXT,
  "ha_role" TEXT,
  "last_boot_at" TIMESTAMPTZ(6),
  "last_seen_at" TIMESTAMPTZ(6),
  "status" "node_status" NOT NULL DEFAULT 'unknown',
  "maintenance_mode" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "node_credentials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "node_id" UUID NOT NULL,
  "secret_hint" TEXT NOT NULL,
  "secret_hash" TEXT NOT NULL,
  "secret_encrypted" TEXT NOT NULL,
  "status" "node_credential_status" NOT NULL DEFAULT 'active',
  "rotated_at" TIMESTAMPTZ(6),
  "last_used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "node_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "node_id" UUID NOT NULL,
  "token_hint" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "status" "agent_token_status" NOT NULL DEFAULT 'active',
  "expires_at" TIMESTAMPTZ(6),
  "last_used_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "agent_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "heartbeats" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "node_id" UUID NOT NULL,
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMPTZ(6) NOT NULL,
  "heartbeat_id" TEXT NOT NULL,
  "latency_ms" INTEGER,
  "pfsense_version" TEXT,
  "agent_version" TEXT,
  "management_ip" TEXT,
  "wan_ip" TEXT,
  "uptime_seconds" INTEGER,
  "cpu_percent" DOUBLE PRECISION,
  "memory_percent" DOUBLE PRECISION,
  "disk_percent" DOUBLE PRECISION,
  "gateway_summary" JSONB,
  "schema_version" TEXT NOT NULL,
  "customer_code" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  CONSTRAINT "heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "node_service_status" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "node_id" UUID NOT NULL,
  "service_name" TEXT NOT NULL,
  "status" "service_status" NOT NULL,
  "message" TEXT,
  "observed_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "node_service_status_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "node_gateway_status" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "node_id" UUID NOT NULL,
  "gateway_name" TEXT NOT NULL,
  "status" "gateway_status" NOT NULL,
  "loss_percent" DOUBLE PRECISION,
  "latency_ms" DOUBLE PRECISION,
  "observed_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "node_gateway_status_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alerts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "node_id" UUID NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "type" "alert_type" NOT NULL,
  "severity" "alert_severity" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "alert_status" NOT NULL DEFAULT 'open',
  "metadata_json" JSONB,
  "opened_at" TIMESTAMPTZ(6) NOT NULL,
  "acknowledged_at" TIMESTAMPTZ(6),
  "acknowledged_by" TEXT,
  "resolved_at" TIMESTAMPTZ(6),
  "resolution_note" TEXT,
  CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "ip_address" TEXT,
  "metadata_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clients_code_key" ON "clients" ("code");
CREATE UNIQUE INDEX "sites_client_id_code_key" ON "sites" ("client_id", "code");
CREATE UNIQUE INDEX "nodes_node_uid_key" ON "nodes" ("node_uid");
CREATE INDEX "nodes_site_id_status_idx" ON "nodes" ("site_id", "status");
CREATE INDEX "node_credentials_node_id_status_idx" ON "node_credentials" ("node_id", "status");
CREATE INDEX "agent_tokens_node_id_status_idx" ON "agent_tokens" ("node_id", "status");
CREATE UNIQUE INDEX "heartbeats_heartbeat_id_key" ON "heartbeats" ("heartbeat_id");
CREATE INDEX "heartbeats_node_id_received_at_idx" ON "heartbeats" ("node_id", "received_at");
CREATE UNIQUE INDEX "node_service_status_node_id_service_name_key" ON "node_service_status" ("node_id", "service_name");
CREATE UNIQUE INDEX "node_gateway_status_node_id_gateway_name_key" ON "node_gateway_status" ("node_id", "gateway_name");
CREATE UNIQUE INDEX "alerts_fingerprint_key" ON "alerts" ("fingerprint");
CREATE INDEX "alerts_node_id_status_severity_idx" ON "alerts" ("node_id", "status", "severity");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" ("created_at");

ALTER TABLE "sites"
  ADD CONSTRAINT "sites_client_id_fkey"
  FOREIGN KEY ("client_id")
  REFERENCES "clients" ("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "nodes"
  ADD CONSTRAINT "nodes_site_id_fkey"
  FOREIGN KEY ("site_id")
  REFERENCES "sites" ("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "node_credentials"
  ADD CONSTRAINT "node_credentials_node_id_fkey"
  FOREIGN KEY ("node_id")
  REFERENCES "nodes" ("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "agent_tokens"
  ADD CONSTRAINT "agent_tokens_node_id_fkey"
  FOREIGN KEY ("node_id")
  REFERENCES "nodes" ("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "heartbeats"
  ADD CONSTRAINT "heartbeats_node_id_fkey"
  FOREIGN KEY ("node_id")
  REFERENCES "nodes" ("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "node_service_status"
  ADD CONSTRAINT "node_service_status_node_id_fkey"
  FOREIGN KEY ("node_id")
  REFERENCES "nodes" ("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "node_gateway_status"
  ADD CONSTRAINT "node_gateway_status_node_id_fkey"
  FOREIGN KEY ("node_id")
  REFERENCES "nodes" ("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "alerts"
  ADD CONSTRAINT "alerts_node_id_fkey"
  FOREIGN KEY ("node_id")
  REFERENCES "nodes" ("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

