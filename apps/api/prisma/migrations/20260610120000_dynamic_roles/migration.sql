-- Perfis dinamicos: tabela roles + role/users/audit em TEXT (substitui enum user_role)

CREATE TABLE "roles" (
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "status" "entity_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("code")
);

INSERT INTO "roles" ("code", "label", "is_system") VALUES
  ('superadmin', 'Superadministrador', true),
  ('admin', 'Administrador', true),
  ('operator', 'Operador', true),
  ('readonly', 'Somente leitura', true),
  ('client', 'Cliente', true);

CREATE TABLE "role_permissions_v2" (
  "role" TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,
  CONSTRAINT "role_permissions_v2_pkey" PRIMARY KEY ("role", "permission_id"),
  CONSTRAINT "role_permissions_v2_role_fkey" FOREIGN KEY ("role") REFERENCES "roles"("code") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permissions_v2_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "role_permissions_v2" ("role", "permission_id")
SELECT "role"::text, "permission_id" FROM "role_permissions";

DROP TABLE "role_permissions";
ALTER TABLE "role_permissions_v2" RENAME TO "role_permissions";

ALTER TABLE "users" ADD COLUMN "role_text" TEXT;
UPDATE "users" SET "role_text" = "role"::text;
ALTER TABLE "users" DROP COLUMN "role";
ALTER TABLE "users" RENAME COLUMN "role_text" TO "role";
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'readonly';
ALTER TABLE "users"
  ADD CONSTRAINT "users_role_fkey"
  FOREIGN KEY ("role") REFERENCES "roles"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD COLUMN "actor_role_text" TEXT;
UPDATE "audit_logs" SET "actor_role_text" = "actor_role"::text WHERE "actor_role" IS NOT NULL;
ALTER TABLE "audit_logs" DROP COLUMN "actor_role";
ALTER TABLE "audit_logs" RENAME COLUMN "actor_role_text" TO "actor_role";

DROP TYPE "user_role";
