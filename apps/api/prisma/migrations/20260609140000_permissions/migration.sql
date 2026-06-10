-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role" "user_role" NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role","permission_id")
);

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed catalog
INSERT INTO "permissions" ("id", "description") VALUES
  ('clients.view', 'Listar clientes'),
  ('clients.create', 'Criar clientes'),
  ('clients.update', 'Atualizar clientes'),
  ('clients.delete', 'Excluir clientes'),
  ('firewalls.view', 'Listar e ver firewalls'),
  ('firewalls.create', 'Criar firewalls'),
  ('firewalls.update', 'Atualizar firewalls e tokens'),
  ('firewalls.delete', 'Excluir firewalls'),
  ('backups.run', 'Solicitar backup config.xml'),
  ('backups.view', 'Listar backups config.xml'),
  ('backups.download', 'Baixar backup config.xml'),
  ('users.view', 'Listar usuarios'),
  ('users.create', 'Criar usuarios'),
  ('users.update', 'Atualizar usuarios e escopo'),
  ('users.delete', 'Excluir usuarios'),
  ('roles.manage', 'Gerenciar roles e permissoes'),
  ('audit.view', 'Visualizar auditoria'),
  ('settings.manage', 'Gerenciar configuracoes do sistema'),
  ('bootstrap.view', 'Ver comando de bootstrap'),
  ('bootstrap.execute', 'Rotacionar secret e tokens de agente'),
  ('alerts.view', 'Listar alertas'),
  ('alerts.acknowledge', 'Reconhecer alertas'),
  ('alerts.resolve', 'Resolver alertas')
ON CONFLICT ("id") DO NOTHING;

-- superadmin: todas as permissoes
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'superadmin'::"user_role", p.id FROM "permissions" p
ON CONFLICT DO NOTHING;

-- admin
INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('admin', 'clients.view'),
  ('admin', 'clients.create'),
  ('admin', 'clients.update'),
  ('admin', 'clients.delete'),
  ('admin', 'firewalls.view'),
  ('admin', 'firewalls.create'),
  ('admin', 'firewalls.update'),
  ('admin', 'firewalls.delete'),
  ('admin', 'backups.run'),
  ('admin', 'backups.view'),
  ('admin', 'audit.view'),
  ('admin', 'bootstrap.view'),
  ('admin', 'bootstrap.execute'),
  ('admin', 'alerts.view'),
  ('admin', 'alerts.acknowledge'),
  ('admin', 'alerts.resolve')
ON CONFLICT DO NOTHING;

-- operator
INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('operator', 'firewalls.view'),
  ('operator', 'backups.view'),
  ('operator', 'alerts.view'),
  ('operator', 'alerts.acknowledge'),
  ('operator', 'alerts.resolve')
ON CONFLICT DO NOTHING;

-- readonly
INSERT INTO "role_permissions" ("role", "permission_id") VALUES
  ('readonly', 'firewalls.view'),
  ('readonly', 'backups.view'),
  ('readonly', 'alerts.view')
ON CONFLICT DO NOTHING;
