'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { NodeDetailTabId } from '@/lib/node-detail-helpers';

type TabDef = {
  id: NodeDetailTabId;
  label: string;
};

export function NodeDetailTabs({
  tabs,
  initialTab,
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
  const resolvedInitial =
    initialTab && validIds.includes(initialTab) ? initialTab : validIds[0] ?? 'overview';
  const [activeTab, setActiveTab] = useState<NodeDetailTabId>(resolvedInitial);

  const selectTab = useCallback(
    (tabId: NodeDetailTabId) => {
      setActiveTab(tabId);
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
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 border-b border-slate-700/80">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectTab(tab.id)}
            className={cn(
              'border-b-2 px-4 py-2.5 text-sm font-medium transition',
              activeTab === tab.id
                ? 'border-cyan-500 text-cyan-200'
                : 'border-transparent text-slate-400 hover:text-slate-200',
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
