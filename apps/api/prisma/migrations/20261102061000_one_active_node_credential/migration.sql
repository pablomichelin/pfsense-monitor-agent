-- The node lock in rotateNodeSecret serializes normal rotations; this
-- constraint also rejects accidental second actives from another writer.
CREATE UNIQUE INDEX "node_credentials_one_active_per_node"
    ON "node_credentials" ("node_id") WHERE "status" = 'active';
