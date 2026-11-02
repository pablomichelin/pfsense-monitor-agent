'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { NodeDetailTabId } from '@/lib/node-detail-helpers';

type TabDef = {
  id: NodeDetailTabId;
  label: string;
};

export function NodeDetailTabs({
  tabs,
  initialTab: _initialTab,
  overview,
  metrics,
  alerts,
  backup,
  config,
}: {
  tabs: TabDef[];
  initialTab?: NodeDetailTabId;
  overview: React.ReactNode;
  metrics: React.ReactNode;
  alerts: React.ReactNode;
  backup: React.ReactNode;
  config: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const validIds = tabs.map((t) => t.id);
  const requestedTab = searchParams.get('tab');
  const activeTab = requestedTab && validIds.includes(requestedTab as NodeDetailTabId)
    ? requestedTab as NodeDetailTabId
    : validIds[0] ?? 'overview';

  const selectTab = useCallback(
    (tabId: NodeDetailTabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tabId === 'overview') {
        params.delete('tab');
      } else {
        params.set('tab', tabId);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const panels: Record<NodeDetailTabId, React.ReactNode> = {
    overview,
    metrics,
    alerts,
    backup,
    config,
  };

  return (
    <div className="space-y-section">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectTab(tab.id)}
            className={cn(
              'border-b-2 px-4 py-2.5 text-sm font-medium transition',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{panels[activeTab]}</div>
    </div>
  );
}
