ALTER TABLE "nodes" ADD COLUMN "recovery_version" TEXT, ADD COLUMN "recovery_seen_at" TIMESTAMPTZ(6);
