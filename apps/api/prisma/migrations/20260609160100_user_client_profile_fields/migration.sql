-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "client_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_client_id_idx" ON "users"("client_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Perfil cliente: permissoes minimas (sem alertas internos nem admin)
INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('client', 'firewalls.view'),
  ('client', 'backups.view')
ON CONFLICT DO NOTHING;
