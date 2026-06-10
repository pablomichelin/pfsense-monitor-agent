-- Fase F: campos padronizados em audit_logs
ALTER TABLE "audit_logs" ADD COLUMN "actor_role" "user_role";
ALTER TABLE "audit_logs" ADD COLUMN "client_id" UUID;
ALTER TABLE "audit_logs" ADD COLUMN "result" TEXT NOT NULL DEFAULT 'success';

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "audit_logs_client_id_created_at_idx" ON "audit_logs"("client_id", "created_at");
CREATE INDEX "audit_logs_result_created_at_idx" ON "audit_logs"("result", "created_at");
