import { NodeConfigBackupsSection } from '@/components/node-config-backups-section';
import type { NodeConfigBackupsResponse } from '@/lib/api';
import { PageSection } from '@/components/ui/page-section';

export function NodeDetailBackupTab({
  nodeId,
  nodeEffectiveStatus,
  canRequest,
  canDownload,
  initialBackups,
  auditHref,
}: {
  nodeId: string;
  nodeEffectiveStatus: string;
  canRequest: boolean;
  canDownload: boolean;
  initialBackups: NodeConfigBackupsResponse;
  auditHref?: string;
}) {
  return (
    <PageSection title="Backup" description="Backups de config.xml enviados por este firewall.">
      <NodeConfigBackupsSection
        nodeId={nodeId}
        nodeEffectiveStatus={nodeEffectiveStatus}
        canRequest={canRequest}
        canDownload={canDownload}
        initialBackups={initialBackups}
        auditHref={auditHref}
      />
    </PageSection>
  );
}
