-- Persist both budgets. User row locking serializes parallel challenges,
-- while challenge counters limit retries of a single token.
ALTER TABLE "mfa_login_challenges"
    ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "users"
    ADD COLUMN "mfa_failed_attempt_count" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "mfa_failed_window_start" TIMESTAMPTZ(6);
