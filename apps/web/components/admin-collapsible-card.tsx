'use client';

import { Button, Card } from '@/components/ui';

export function AdminCollapsibleCard({
  title,
  description,
  section,
  isExpanded,
  onToggle,
  actionLabel,
  children,
  collapsible = true,
}: {
  title: string;
  description: string;
  section: string;
  isExpanded: boolean;
  onToggle: () => void;
  actionLabel: string;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  return (
    <Card className="p-6" aria-expanded={collapsible ? isExpanded : undefined}>
      <p className="font-mono text-xs uppercase tracking-wider text-cyan-400/90">Cadastro</p>
      <h2 className="mt-2 font-display text-2xl text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p>
      <div className="mt-5">
        {!collapsible ? (
          children
        ) : isExpanded ? (
          <>
            {children}
            <Button type="button" variant="ghost" size="sm" onClick={onToggle} className="mt-4">
              Fechar
            </Button>
          </>
        ) : (
          <Button type="button" onClick={onToggle} className="w-full">
            {actionLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}
