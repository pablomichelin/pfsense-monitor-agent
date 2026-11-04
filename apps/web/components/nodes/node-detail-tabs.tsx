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
  operations, history, access,
}: {
  tabs: TabDef[];
  initialTab?: NodeDetailTabId;
  overview: React.ReactNode;
  metrics: React.ReactNode;
  alerts: React.ReactNode;
  backup: React.ReactNode;
  config: React.ReactNode;
  operations?: React.ReactNode; history?: React.ReactNode; access?: React.ReactNode;
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
    operations, history, access,
  };

  return (
    <div className="space-y-section">
      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label="Seções do firewall">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            id={`node-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`node-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => {
              const movement = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (!movement) return;
              event.preventDefault();
              const index = tabs.findIndex((item) => item.id === tab.id);
              const next = tabs[(index + movement + tabs.length) % tabs.length];
              if (!next) return;
              selectTab(next.id);
              event.currentTarget.parentElement?.querySelector<HTMLElement>(`#node-tab-${next.id}`)?.focus();
            }}
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
      {tabs.map((tab) => <div key={tab.id} id={`node-panel-${tab.id}`} role="tabpanel" aria-labelledby={`node-tab-${tab.id}`} hidden={activeTab !== tab.id} tabIndex={0}>
        {tab.id === 'config' && activeTab !== tab.id ? null : panels[tab.id]}
      </div>)}
    </div>
  );
}
