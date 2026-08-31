import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NotificationsAdminPanel } from '@/components/notifications-admin-panel';
import { PageHero } from '@/components/page-hero';
import { PageSection } from '@/components/ui';
import { getSession } from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';
import {
  getNotificationsStatus,
  listNotificationChannels,
  listNotificationDeliveries,
  listNotificationRules,
} from '@/lib/notifications';
import { getNodesFilters } from '@/lib/api';
import { adminNavLinkClassName } from '@/lib/admin-nav-styles';

export const dynamic = 'force-dynamic';

export default async function AdminNotificacoesPage() {
  let session;

  try {
    session = await getSession();
  } catch (error) {
    handlePageApiError(error);
  }

  if (!hasPermission(session.permissions ?? [], 'notifications.view')) {
    redirect('/conta?access=denied');
  }

  const canManage = hasPermission(session.permissions ?? [], 'notifications.manage');
  const canTest = hasPermission(session.permissions ?? [], 'notifications.test');

  let status;
  let channels;
  let rules;
  let deliveries;
  let filterOptions;

  try {
    [status, channels, rules, deliveries, filterOptions] = await Promise.all([
      getNotificationsStatus(),
      listNotificationChannels(),
      listNotificationRules(),
      listNotificationDeliveries(),
      getNodesFilters(),
    ]);
  } catch (error) {
    handlePageApiError(error);
  }

  const activeClients = filterOptions.clients.filter((client) => client.status === 'active');

  return (
    <div className="space-y-section">
      <PageHero
        eyebrow="Administração"
        title="Notificações externas"
        description="Canais, regras e histórico de entregas para alertas do controlador. Envio real exige feature flag habilitada na API."
        stats={[
          { label: 'Canais', value: String(channels.items.length) },
          { label: 'Regras', value: String(rules.items.length) },
          { label: 'Flag', value: status.enabled ? 'Ligada' : 'Desligada' },
        ]}
      />

      <PageSection title="Navegação">
        <Link href="/admin/usuarios" className={adminNavLinkClassName}>
          ← Usuários
        </Link>
      </PageSection>

      <NotificationsAdminPanel
        status={status}
        channels={channels.items}
        rules={rules.items}
        deliveries={deliveries.items}
        clients={activeClients.map((client) => ({
          id: client.id,
          name: client.name,
          code: client.code,
        }))}
        canManage={canManage}
        canTest={canTest}
      />
    </div>
  );
}
