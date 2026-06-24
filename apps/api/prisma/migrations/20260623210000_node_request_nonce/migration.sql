-- C2: anti-replay de assinaturas HMAC por node (TTL = janela de skew do heartbeat).
CREATE TABLE "node_request_nonces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "node_id" UUID NOT NULL,
    "signature_hash" TEXT NOT NULL,
    "seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "node_request_nonces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "node_request_nonces_node_id_signature_hash_key" ON "node_request_nonces"("node_id", "signature_hash");

CREATE INDEX "node_request_nonces_expires_at_idx" ON "node_request_nonces"("expires_at");

ALTER TABLE "node_request_nonces" ADD CONSTRAINT "node_request_nonces_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
