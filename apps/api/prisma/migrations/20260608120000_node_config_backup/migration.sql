-- CreateEnum
CREATE TYPE "config_backup_status" AS ENUM ('stored', 'duplicate', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "node_command_type" AS ENUM ('config_backup_now');

-- CreateEnum
CREATE TYPE "node_command_status" AS ENUM ('pending', 'picked_up', 'running', 'succeeded', 'failed', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "node_commands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "type" "node_command_type" NOT NULL,
    "status" "node_command_status" NOT NULL DEFAULT 'pending',
    "requested_by_user_id" UUID,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "picked_up_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "result_json" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_config_backups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "command_id" UUID,
    "backup_uid" TEXT NOT NULL,
    "attempt_id" TEXT,
    "status" "config_backup_status" NOT NULL DEFAULT 'stored',
    "source" TEXT NOT NULL DEFAULT 'scheduled',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "config_sha256" TEXT NOT NULL,
    "payload_sha256" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "payload_size_bytes" INTEGER NOT NULL,
    "compression" TEXT,
    "storage_path" TEXT,
    "encryption_version" TEXT,
    "agent_version" TEXT,
    "pfsense_version" TEXT,
    "failure_reason" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_config_backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "node_commands_node_id_status_idx" ON "node_commands"("node_id", "status");

-- CreateIndex
CREATE INDEX "node_commands_expires_at_idx" ON "node_commands"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "node_config_backups_backup_uid_key" ON "node_config_backups"("backup_uid");

-- CreateIndex
CREATE INDEX "node_config_backups_node_id_received_at_idx" ON "node_config_backups"("node_id", "received_at");

-- CreateIndex
CREATE INDEX "node_config_backups_node_id_config_sha256_idx" ON "node_config_backups"("node_id", "config_sha256");

-- CreateIndex
CREATE INDEX "node_config_backups_command_id_idx" ON "node_config_backups"("command_id");

-- CreateIndex
CREATE INDEX "node_config_backups_attempt_id_idx" ON "node_config_backups"("attempt_id");

-- AddForeignKey
ALTER TABLE "node_commands" ADD CONSTRAINT "node_commands_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_config_backups" ADD CONSTRAINT "node_config_backups_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_config_backups" ADD CONSTRAINT "node_config_backups_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "node_commands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
