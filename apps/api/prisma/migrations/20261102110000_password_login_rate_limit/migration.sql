-- R202-17: dedicated SQL-managed buckets; no user FK or account-wide lockout.
-- Requires a validated release: the API image entrypoint runs prisma migrate deploy.
-- Prepared only in this round; application belongs to separately authorized release/QA.
CREATE TABLE "password_login_rate_limits" (
  "rate_key" TEXT PRIMARY KEY,
  "window_start" TIMESTAMPTZ(6) NOT NULL,
  "attempts" INTEGER NOT NULL CHECK ("attempts" > 0)
);
CREATE INDEX "password_login_rate_limits_window_start_idx"
  ON "password_login_rate_limits" ("window_start");
