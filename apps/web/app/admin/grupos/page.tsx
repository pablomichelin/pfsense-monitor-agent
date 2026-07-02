import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FleetOrgAdminPanel } from '@/components/fleet-org-admin-panel';
import { PageHero } from '@/components/page-hero';
import { PageSection } from '@/components/ui';
import {
  getFleetGroup,
  getNodesFilters,
  getNodesList,
  getSession,
  listFleetGroups,
  listFleetTags,
} from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';
import { adminNavLinkClassName } from '@/lib/admin-nav-styles';

export const dynamic = 'force-dynamic';

export default async function AdminGruposPage() {
  let session;

  try {
    session = await getSession();
  } catch (error) {
    handlePageApiError(error);
  }

  const canViewTags = hasPermission(session.permissions ?? [], 'tags.view');
  const canViewGroups = hasPermission(session.permissions ?? [], 'groups.view');

  if (!canViewTags && !canViewGroups) {
    redirect('/conta?access=denied');
  }

  const canManageTags = hasPermission(session.permissions ?? [], 'tags.manage');
  const canManageGroups = hasPermission(session.permissions ?? [], 'groups.manage');

  let tags;
  let groups;
  let filterOptions;
  let nodes;

  try {
    [tags, groups, filterOptions, nodes] = await Promise.all([
      canViewTags ? listFleetTags() : Promise.resolve({ items: [], generated_at: '' }),
      canViewGroups ? listFleetGroups() : Promise.resolve({ items: [], generated_at: '' }),
      getNodesFilters(),
      getNodesList({ limit: 1000 }),
    ]);
  } catch (error) {
    handlePageApiError(error);
  }

  const activeClients = filterOptions.clients.filter((client) => client.status === 'active');

  const groupMemberIds: Record<string, string[]> = {};
  if (canManageGroups && groups.items.length > 0) {
    const details = await Promise.all(
      groups.items.map((group) => getFleetGroup(group.id)),
    );
    for (const detail of details) {
      groupMemberIds[detail.group.id] = detail.members.map((member) => member.node_id);
    }
  }

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Administração"
        title="Grupos e tags"
        description="Organização flexível da frota: tags livres, grupos ad-hoc e criticidade por firewall (editável no detalhe)."
        stats={[
          { label: 'Tags', value: String(tags.items.length) },
          { label: 'Grupos', value: String(groups.items.length) },
        ]}
      />

      <PageSection title="Navegação">
        <Link href="/admin/notificacoes" className={adminNavLinkClassName}>
          ← Notificações
        </Link>
      </PageSection>

      <FleetOrgAdminPanel
        tags={tags.items}
        groups={groups.items}
        clients={activeClients.map((client) => ({
          id: client.id,
          name: client.name,
        }))}
        nodes={nodes.items.map((node) => ({
          id: node.id,
          client_id: node.client.id,
          label: node.display_name ?? node.hostname,
        }))}
        groupMemberIds={groupMemberIds}
        canManageTags={canManageTags}
        canManageGroups={canManageGroups}
      />
    </div>
  );
}
