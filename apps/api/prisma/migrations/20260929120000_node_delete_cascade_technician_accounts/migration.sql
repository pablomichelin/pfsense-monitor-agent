ALTER TABLE "technician_node_accounts" DROP CONSTRAINT "technician_node_accounts_node_id_fkey";

ALTER TABLE "technician_node_accounts"
  ADD CONSTRAINT "technician_node_accounts_node_id_fkey"
  FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
