-- Fase 6 plano 117: amostragem e rollups de metricas operacionais

-- CreateTable
CREATE TABLE "node_metric_samples" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "sampled_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "node_status" NOT NULL,
    "cpu_percent" DOUBLE PRECISION,
    "memory_percent" DOUBLE PRECISION,
    "disk_percent" DOUBLE PRECISION,
    "latency_ms" INTEGER,
    "availability_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_metric_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_metric_rollups_hourly" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "bucket_start" TIMESTAMPTZ(6) NOT NULL,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "cpu_avg" DOUBLE PRECISION,
    "cpu_min" DOUBLE PRECISION,
    "cpu_max" DOUBLE PRECISION,
    "memory_avg" DOUBLE PRECISION,
    "memory_min" DOUBLE PRECISION,
    "memory_max" DOUBLE PRECISION,
    "disk_avg" DOUBLE PRECISION,
    "disk_min" DOUBLE PRECISION,
    "disk_max" DOUBLE PRECISION,
    "latency_avg" DOUBLE PRECISION,
    "latency_min" DOUBLE PRECISION,
    "latency_max" DOUBLE PRECISION,
    "availability_pct" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "node_metric_rollups_hourly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_metric_rollups_daily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "bucket_start" TIMESTAMPTZ(6) NOT NULL,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "cpu_avg" DOUBLE PRECISION,
    "cpu_min" DOUBLE PRECISION,
    "cpu_max" DOUBLE PRECISION,
    "memory_avg" DOUBLE PRECISION,
    "memory_min" DOUBLE PRECISION,
    "memory_max" DOUBLE PRECISION,
    "disk_avg" DOUBLE PRECISION,
    "disk_min" DOUBLE PRECISION,
    "disk_max" DOUBLE PRECISION,
    "latency_avg" DOUBLE PRECISION,
    "latency_min" DOUBLE PRECISION,
    "latency_max" DOUBLE PRECISION,
    "availability_pct" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "node_metric_rollups_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_job_locks" (
    "lock_key" TEXT NOT NULL,
    "locked_until" TIMESTAMPTZ(6) NOT NULL,
    "owner_id" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_job_locks_pkey" PRIMARY KEY ("lock_key")
);

-- CreateIndex
CREATE INDEX "node_metric_samples_node_id_sampled_at_idx" ON "node_metric_samples"("node_id", "sampled_at");

-- CreateIndex
CREATE UNIQUE INDEX "node_metric_rollups_hourly_node_id_bucket_start_key" ON "node_metric_rollups_hourly"("node_id", "bucket_start");

-- CreateIndex
CREATE INDEX "node_metric_rollups_hourly_bucket_start_idx" ON "node_metric_rollups_hourly"("bucket_start");

-- CreateIndex
CREATE UNIQUE INDEX "node_metric_rollups_daily_node_id_bucket_start_key" ON "node_metric_rollups_daily"("node_id", "bucket_start");

-- CreateIndex
CREATE INDEX "node_metric_rollups_daily_bucket_start_idx" ON "node_metric_rollups_daily"("bucket_start");

-- AddForeignKey
ALTER TABLE "node_metric_samples" ADD CONSTRAINT "node_metric_samples_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_metric_rollups_hourly" ADD CONSTRAINT "node_metric_rollups_hourly_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_metric_rollups_daily" ADD CONSTRAINT "node_metric_rollups_daily_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
