-- CreateEnum
CREATE TYPE "notification_channel_type" AS ENUM ('email', 'webhook', 'telegram');

-- CreateEnum
CREATE TYPE "notification_channel_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "notification_delivery_status" AS ENUM ('pending', 'sending', 'delivered', 'failed');

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" "notification_channel_type" NOT NULL,
    "status" "notification_channel_status" NOT NULL DEFAULT 'active',
    "config_public_json" JSONB NOT NULL,
    "secrets_encrypted" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "severity" "alert_severity",
    "alert_type" "alert_type",
    "client_id" UUID,
    "channel_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "alert_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "notification_delivery_status" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_channels_status_type_idx" ON "notification_channels"("status", "type");

-- CreateIndex
CREATE INDEX "notification_rules_enabled_channel_id_idx" ON "notification_rules"("enabled", "channel_id");

-- CreateIndex
CREATE INDEX "notification_rules_client_id_idx" ON "notification_rules"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_idempotency_key_key" ON "notification_deliveries"("idempotency_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_alert_id_created_at_idx" ON "notification_deliveries"("alert_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_channel_id_status_idx" ON "notification_deliveries"("channel_id", "status");

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "notification_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "notification_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permissions RBAC (Fase 1 plano 117)
INSERT INTO "permissions" ("id", "description") VALUES
  ('notifications.view', 'Visualizar canais, regras e entregas de notificacao'),
  ('notifications.manage', 'Gerenciar canais e regras de notificacao'),
  ('notifications.test', 'Testar envio de canais de notificacao')
ON CONFLICT ("id") DO UPDATE SET
  description = EXCLUDED.description;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'notifications.view'),
  ('superadmin', 'notifications.manage'),
  ('superadmin', 'notifications.test'),
  ('admin', 'notifications.view'),
  ('admin', 'notifications.manage'),
  ('admin', 'notifications.test')
ON CONFLICT DO NOTHING;
