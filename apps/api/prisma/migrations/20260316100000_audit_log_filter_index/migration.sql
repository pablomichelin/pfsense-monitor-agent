-- Índice para listagem de auditoria filtrada por action e target_type (melhora performance)
CREATE INDEX IF NOT EXISTS "audit_logs_action_target_type_created_at_idx" ON "audit_logs" ("action", "target_type", "created_at");
