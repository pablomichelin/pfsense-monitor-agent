-- CreateTable
CREATE TABLE "user_client_scopes" (
    "user_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "granted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_client_scopes_pkey" PRIMARY KEY ("user_id","client_id")
);

-- CreateIndex
CREATE INDEX "user_client_scopes_client_id_idx" ON "user_client_scopes"("client_id");

-- AddForeignKey
ALTER TABLE "user_client_scopes" ADD CONSTRAINT "user_client_scopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_client_scopes" ADD CONSTRAINT "user_client_scopes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_client_scopes" ADD CONSTRAINT "user_client_scopes_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Compatibilidade: usuarios nao-superadmin ativos recebem escopo em todos os clientes ativos
INSERT INTO "user_client_scopes" ("user_id", "client_id", "granted_by_user_id")
SELECT u.id, c.id, NULL
FROM "users" u
CROSS JOIN "clients" c
WHERE u.role <> 'superadmin'
  AND u.status = 'active'
  AND c.status = 'active'
ON CONFLICT ("user_id", "client_id") DO NOTHING;
