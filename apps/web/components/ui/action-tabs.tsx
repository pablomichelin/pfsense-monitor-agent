'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export type ActionTab = { id: string; label: string; description?: string; unmountOnHide?: boolean; content: ReactNode };

/** Panels stay mounted so changing tasks preserves form values and running work. */
export function ActionTabs({ id, label, tabs, initialTabId }: {
  id: string;
  label: string;
  tabs: ActionTab[];
  initialTabId?: string;
}) {
  const [selected, setSelected] = useState(initialTabId ?? tabs[0]?.id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => { if (initialTabId) setSelected(initialTabId); }, [initialTabId]);
  const active = tabs.some((tab) => tab.id === selected) ? selected : tabs[0]?.id;
  if (tabs.length === 0) return null;

  return <div className="min-w-0 space-y-4">
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2 border-b border-border">
      {tabs.map((tab, index) => <button key={tab.id}
        ref={(element) => { refs.current[tab.id] = element; }}
        type="button" role="tab" id={`${id}-tab-${tab.id}`} aria-selected={active === tab.id}
        aria-controls={`${id}-panel-${tab.id}`} tabIndex={active === tab.id ? 0 : -1}
        onClick={() => setSelected(tab.id)}
        onKeyDown={(event) => {
          const nextIndex: Record<string, number> = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 };
          const next = nextIndex[event.key];
          if (next === undefined) return;
          event.preventDefault();
          setSelected(tabs[next].id);
          refs.current[tabs[next].id]?.focus();
        }}
        className={`min-w-0 flex-1 basis-36 rounded-t-lg border-b-2 px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active === tab.id ? 'border-primary bg-primary/10 text-primary' : 'border-transparent text-fg-muted hover:bg-nav-hover hover:text-fg'}`}
      >
        <span className="block text-sm font-semibold">{tab.label}</span>
        {tab.description ? <span className="mt-1 block text-xs text-fg-muted">{tab.description}</span> : null}
      </button>)}
    </div>
    {tabs.map((tab) => <div key={tab.id} id={`${id}-panel-${tab.id}`} role="tabpanel" aria-labelledby={`${id}-tab-${tab.id}`} hidden={active !== tab.id}>{tab.unmountOnHide && active !== tab.id ? null : tab.content}</div>)}
  </div>;
}
