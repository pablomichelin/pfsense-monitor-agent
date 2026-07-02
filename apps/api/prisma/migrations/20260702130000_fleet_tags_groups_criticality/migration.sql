-- CreateEnum
CREATE TYPE "node_criticality" AS ENUM ('critical', 'standard', 'lab');

-- AlterTable
ALTER TABLE "nodes" ADD COLUMN "criticality" "node_criticality" NOT NULL DEFAULT 'standard';

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_tags" (
    "node_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_tags_pkey" PRIMARY KEY ("node_id","tag_id")
);

-- CreateTable
CREATE TABLE "node_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "node_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_group_members" (
    "group_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_group_members_pkey" PRIMARY KEY ("group_id","node_id")
);

-- CreateIndex
CREATE INDEX "nodes_criticality_idx" ON "nodes"("criticality");

-- CreateIndex
CREATE UNIQUE INDEX "tags_client_id_name_key" ON "tags"("client_id", "name");

-- CreateIndex
CREATE INDEX "tags_client_id_idx" ON "tags"("client_id");

-- CreateIndex
CREATE INDEX "node_tags_tag_id_idx" ON "node_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "node_groups_client_id_name_key" ON "node_groups"("client_id", "name");

-- CreateIndex
CREATE INDEX "node_groups_client_id_idx" ON "node_groups"("client_id");

-- CreateIndex
CREATE INDEX "node_group_members_node_id_idx" ON "node_group_members"("node_id");

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_tags" ADD CONSTRAINT "node_tags_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_tags" ADD CONSTRAINT "node_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_groups" ADD CONSTRAINT "node_groups_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_group_members" ADD CONSTRAINT "node_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "node_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_group_members" ADD CONSTRAINT "node_group_members_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permissions RBAC (Fase 3 plano 117)
INSERT INTO "permissions" ("id", "description") VALUES
  ('tags.view', 'Visualizar tags da frota'),
  ('tags.manage', 'Gerenciar tags e associacao a firewalls'),
  ('groups.view', 'Visualizar grupos ad-hoc de firewalls'),
  ('groups.manage', 'Gerenciar grupos ad-hoc e membros')
ON CONFLICT ("id") DO UPDATE SET
  description = EXCLUDED.description;

INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('superadmin', 'tags.view'),
  ('superadmin', 'tags.manage'),
  ('superadmin', 'groups.view'),
  ('superadmin', 'groups.manage'),
  ('admin', 'tags.view'),
  ('admin', 'tags.manage'),
  ('admin', 'groups.view'),
  ('admin', 'groups.manage'),
  ('operator', 'tags.view'),
  ('operator', 'groups.view')
ON CONFLICT DO NOTHING;
