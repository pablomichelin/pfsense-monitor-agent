'use client';

import { useCallback, useState } from 'react';

type UpgradeReceipt = { command_id: string; expires_at: string };
type UpgradeStatus = {
  active_command: { command_id: string } | null;
  last_result: { command_id: string } | null;
};

export function useUpgradeReceipt() {
  const [receipt, rememberReceipt] = useState<UpgradeReceipt | null>(null);
  const observeStatus = useCallback((status: UpgradeStatus) => {
    rememberReceipt((current) => current && (
      status.active_command?.command_id === current.command_id
      || status.last_result?.command_id === current.command_id
      || Date.parse(current.expires_at) <= Date.now()
    ) ? null : current);
  }, []);

  return { receipt, rememberReceipt, observeStatus };
}
