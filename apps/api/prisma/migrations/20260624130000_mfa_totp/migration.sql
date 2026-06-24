-- C-MFA: MFA TOTP para usuarios humanos.
-- Campos no usuario (segredo TOTP cifrado em repouso) + tabelas de codigos de
-- recuperacao (hash, consumo unico) e de desafio transitorio de login.

ALTER TABLE "users"
    ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "mfa_secret" TEXT,
    ADD COLUMN "mfa_enrolled_at" TIMESTAMPTZ(6);

CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mfa_recovery_codes_user_id_code_hash_key" ON "mfa_recovery_codes"("user_id", "code_hash");
CREATE INDEX "mfa_recovery_codes_user_id_idx" ON "mfa_recovery_codes"("user_id");

ALTER TABLE "mfa_recovery_codes"
    ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mfa_login_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "challenge_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "mfa_login_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mfa_login_challenges_challenge_token_hash_key" ON "mfa_login_challenges"("challenge_token_hash");
CREATE INDEX "mfa_login_challenges_user_id_idx" ON "mfa_login_challenges"("user_id");
CREATE INDEX "mfa_login_challenges_expires_at_idx" ON "mfa_login_challenges"("expires_at");

ALTER TABLE "mfa_login_challenges"
    ADD CONSTRAINT "mfa_login_challenges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
