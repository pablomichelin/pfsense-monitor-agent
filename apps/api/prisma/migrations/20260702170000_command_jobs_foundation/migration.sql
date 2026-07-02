-- Fase 7 plano 117: fundacao jobs/comandos (aditivo)

CREATE TYPE "job_batch_status" AS ENUM ('pending', 'running', 'completed', 'cancelled', 'failed');

CREATE TABLE "job_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "command_type" "node_command_type" NOT NULL,
    "status" "job_batch_status" NOT NULL DEFAULT 'pending',
    "requested_by_user_id" UUID,
    "client_id" UUID,
    "label" TEXT,
    "metadata_json" JSONB,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "succeeded_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "cancelled_count" INTEGER NOT NULL DEFAULT 0,
    "expired_count" INTEGER NOT NULL DEFAULT 0,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_batches_status_idx" ON "job_batches"("status");
CREATE INDEX "job_batches_requested_at_idx" ON "job_batches"("requested_at");

ALTER TABLE "node_commands" ADD COLUMN "batch_id" UUID;
ALTER TABLE "node_commands" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "node_commands" ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "node_commands" ADD COLUMN "max_retries" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "node_commands" ADD COLUMN "next_retry_at" TIMESTAMPTZ(6);
ALTER TABLE "node_commands" ADD COLUMN "cancelled_at" TIMESTAMPTZ(6);
ALTER TABLE "node_commands" ADD COLUMN "cancelled_by_user_id" UUID;

CREATE INDEX "node_commands_batch_id_idx" ON "node_commands"("batch_id");
CREATE INDEX "node_commands_next_retry_at_idx" ON "node_commands"("next_retry_at");

CREATE UNIQUE INDEX "node_commands_idempotency_active_key"
ON "node_commands"("node_id", "type", "idempotency_key")
WHERE "idempotency_key" IS NOT NULL
  AND "status" IN ('pending', 'picked_up', 'running');

ALTER TABLE "node_commands" ADD CONSTRAINT "node_commands_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "job_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
