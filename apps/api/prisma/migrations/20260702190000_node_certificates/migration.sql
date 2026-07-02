-- AlterEnum
ALTER TYPE "alert_type" ADD VALUE 'certificate_expiring';

-- CreateTable
CREATE TABLE "node_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "cert_key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "issuer" TEXT,
    "usage_descriptor" TEXT,
    "not_before" TIMESTAMPTZ(6) NOT NULL,
    "not_after" TIMESTAMPTZ(6) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "node_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "node_certificates_node_id_cert_key_key" ON "node_certificates"("node_id", "cert_key");

-- CreateIndex
CREATE INDEX "node_certificates_node_id_not_after_idx" ON "node_certificates"("node_id", "not_after");

-- AddForeignKey
ALTER TABLE "node_certificates" ADD CONSTRAINT "node_certificates_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
