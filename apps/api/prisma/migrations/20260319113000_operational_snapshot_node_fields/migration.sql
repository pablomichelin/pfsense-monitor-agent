ALTER TABLE "nodes"
  ADD COLUMN "last_heartbeat_id" TEXT,
  ADD COLUMN "last_heartbeat_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "last_latency_ms" INTEGER,
  ADD COLUMN "uptime_seconds" INTEGER,
  ADD COLUMN "cpu_percent" DOUBLE PRECISION,
  ADD COLUMN "memory_percent" DOUBLE PRECISION,
  ADD COLUMN "disk_percent" DOUBLE PRECISION,
  ADD COLUMN "schema_version" TEXT,
  ADD COLUMN "customer_code" TEXT,
  ADD COLUMN "network_interfaces_json" JSONB;

UPDATE "nodes" AS n
SET
  "last_heartbeat_id" = latest."heartbeat_id",
  "last_heartbeat_sent_at" = latest."sent_at",
  "last_latency_ms" = latest."latency_ms",
  "uptime_seconds" = latest."uptime_seconds",
  "cpu_percent" = latest."cpu_percent",
  "memory_percent" = latest."memory_percent",
  "disk_percent" = latest."disk_percent",
  "schema_version" = latest."schema_version",
  "customer_code" = latest."customer_code",
  "network_interfaces_json" = latest."network_interfaces_json"
FROM (
  SELECT DISTINCT ON ("node_id")
    "node_id",
    "heartbeat_id",
    "sent_at",
    "latency_ms",
    "uptime_seconds",
    "cpu_percent",
    "memory_percent",
    "disk_percent",
    "schema_version",
    "customer_code",
    "payload_json"->'interfaces' AS "network_interfaces_json"
  FROM "heartbeats"
  ORDER BY "node_id", "received_at" DESC
) AS latest
WHERE latest."node_id" = n."id";
