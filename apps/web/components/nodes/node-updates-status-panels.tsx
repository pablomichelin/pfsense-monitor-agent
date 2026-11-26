'use client';

import { useEffect, useState } from 'react';
import { NodePackageUpgradeSection } from '@/components/node-package-upgrade-section';
import { NodePfsenseUpgradeSection } from '@/components/node-pfsense-upgrade-section';
import { Alert } from '@/components/ui/alert';
import { ActionTabs } from '@/components/ui/action-tabs';
import type { PackageUpgradeStatusResponse, PfsenseUpgradeStatusResponse } from '@/lib/api';

function useLastAvailableStatus<T>(snapshot: T | null): T | null {
  const [lastStatus, setLastStatus] = useState(snapshot);
  useEffect(() => {
    if (snapshot) setLastStatus(snapshot);
  }, [snapshot]);
  return snapshot ?? lastStatus;
}

export function NodeUpdatesStatusPanels({
  nodeId,
  nodeEffectiveStatus,
  canRunUpgrade,
  canRunPackageUpgrade,
  upgradeStatus,
  packageUpgradeStatus,
}: {
  nodeId: string;
  nodeEffectiveStatus: string;
  canRunUpgrade: boolean;
  canRunPackageUpgrade: boolean;
  upgradeStatus: PfsenseUpgradeStatusResponse | null;
  packageUpgradeStatus: PackageUpgradeStatusResponse | null;
}) {
  // A revalidation error must not unmount a panel already tracking an accepted request.
  const firmware = useLastAvailableStatus(upgradeStatus);
  const agent = useLastAvailableStatus(packageUpgradeStatus);
  return (
    <ActionTabs
      id="node-updates"
      label="Tipo de atualização"
      tabs={[
        {
          id: 'agent',
          label: 'Agente Monitor',
          description: 'Pacote de monitoramento',
          content: agent ? (
            <NodePackageUpgradeSection
              nodeId={nodeId}
              canRunPackageUpgrade={canRunPackageUpgrade}
              initialStatus={agent}
            />
          ) : <Alert variant="warning">A consulta do agente Monitor está indisponível.</Alert>,
        },
        {
          id: 'os',
          label: 'pfSense OS',
          description: 'Sistema operacional',
          content: firmware ? (
            <NodePfsenseUpgradeSection
              nodeId={nodeId}
              nodeEffectiveStatus={nodeEffectiveStatus}
              canRunUpgrade={canRunUpgrade}
              initialStatus={firmware}
            />
          ) : <Alert variant="warning">A consulta do pfSense OS está indisponível.</Alert>,
        },
      ]}
    />
  );
}
