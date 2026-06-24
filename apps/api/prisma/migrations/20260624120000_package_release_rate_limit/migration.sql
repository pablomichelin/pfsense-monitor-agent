-- C-RL: rate-limit persistente do endpoint publico de release/artefato.
-- Substitui o contador in-memory por estado em PostgreSQL (sobrevive a restart
-- e e compartilhado entre instancias). Limite mantido em 60 req/min por origem.
CREATE TABLE "package_release_rate_limits" (
    "rate_key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "package_release_rate_limits_pkey" PRIMARY KEY ("rate_key")
);

CREATE INDEX "package_release_rate_limits_window_start_idx" ON "package_release_rate_limits"("window_start");
