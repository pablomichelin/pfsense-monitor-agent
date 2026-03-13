CREATE TYPE "user_role" AS ENUM ('superadmin', 'admin', 'operator', 'readonly');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "display_name" TEXT,
  "role" "user_role" NOT NULL DEFAULT 'superadmin',
  "status" "entity_status" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "session_token_hash" TEXT NOT NULL,
  "csrf_token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(6),
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE UNIQUE INDEX "user_sessions_session_token_hash_key" ON "user_sessions" ("session_token_hash");
CREATE INDEX "user_sessions_user_id_expires_at_idx" ON "user_sessions" ("user_id", "expires_at");
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions" ("expires_at");

ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
