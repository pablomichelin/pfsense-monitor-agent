import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FleetOrgAdminPanel } from '@/components/fleet-org-admin-panel';
import { PageHero } from '@/components/page-hero';
import { PageSection } from '@/components/ui';
import {
  ApiError,
  getActiveAdminClientOptions,
  getFleetGroup,
  getNodesFilters,
  getSession,
  listFleetGroups,
  listFleetTags,
} from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';
import { adminNavLinkClassName } from '@/lib/admin-nav-styles';

export const dynamic = 'force-dynamic';

export default async function AdminGruposPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  let session;

  try {
    session = await getSession();
  } catch (error) {
    handlePageApiError(error);
  }

  const permissions = session.permissions ?? [];
  const canViewTags = hasPermission(permissions, 'tags.view');
  const canViewGroups = hasPermission(permissions, 'groups.view');

  if (!canViewTags && !canViewGroups) {
    redirect('/conta?access=denied');
  }

  const canManageTags = hasPermission(permissions, 'tags.manage');
  const canManageGroups = hasPermission(permissions, 'groups.manage');
  const canViewFirewalls = hasPermission(permissions, 'firewalls.view');
  const canViewClients = hasPermission(permissions, 'clients.view');
  const canEditGroupMembers = canManageGroups && canViewFirewalls;

  let tags;
  let groups;
  let activeClients;

  try {
    [tags, groups, activeClients] = await Promise.all([
      canViewTags ? listFleetTags() : Promise.resolve({ items: [], generated_at: '' }),
      canViewGroups ? listFleetGroups() : Promise.resolve({ items: [], generated_at: '' }),
      canManageTags || canManageGroups
        ? canViewFirewalls
          ? getNodesFilters().then(({ clients }) => clients.filter((client) => client.status === 'active'))
          : canViewClients ? getActiveAdminClientOptions() : []
        : [],
    ]);
  } catch (error) {
    handlePageApiError(error);
  }

  const selectedGroupId = typeof params.group === 'string' ? params.group : groups.items[0]?.id;
  const selectedGroup = canEditGroupMembers
    ? groups.items.find((group) => group.id === selectedGroupId)
    : undefined;
  let groupMemberIds: string[] | null = null;
  let groupMembershipRevision: string | undefined;
  if (selectedGroup) {
    try {
      const detail = await getFleetGroup(selectedGroup.id);
      groupMemberIds = detail.members.map((member) => member.node_id);
      groupMembershipRevision = detail.membership_revision;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        handlePageApiError(error);
      }
    }
  }

  return (
    <div className="space-y-section">
      <PageHero
        eyebrow="Administração"
        title="Grupos e tags"
        description="Organização flexível da frota: tags livres, grupos ad-hoc e criticidade por firewall (editável no detalhe)."
        stats={[
          { label: 'Tags', value: String(tags.items.length) },
          { label: 'Grupos', value: String(groups.items.length) },
        ]}
      />

      {hasPermission(permissions, 'notifications.view') ? (
        <PageSection title="Navegação">
          <Link href="/admin/notificacoes" className={adminNavLinkClassName}>
            ← Notificações
          </Link>
        </PageSection>
      ) : null}

      <FleetOrgAdminPanel
        tags={tags.items}
        groups={groups.items}
        clients={activeClients.map((client) => ({
          id: client.id,
          name: client.name,
        }))}
        selectedGroupId={selectedGroup?.id}
        groupMemberIds={groupMemberIds}
        groupMembershipRevision={groupMembershipRevision}
        canManageTags={canManageTags}
        canManageGroups={canManageGroups}
        canEditGroupMembers={canEditGroupMembers}
      />
    </div>
  );
}
