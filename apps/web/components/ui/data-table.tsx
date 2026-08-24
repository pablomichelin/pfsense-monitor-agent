import { cn } from '@/lib/cn';
import { Card } from './card';

export const dataTableHeadClassName =
  'sticky top-0 z-20 border-b border-border bg-table-head text-fg-muted shadow-sm';

export const dataTableRowClassName =
  'border-b border-border/80 text-fg transition hover:bg-table-hover/60';

export function DataTable({
  toolbar,
  empty,
  emptyMessage,
  className,
  children,
}: {
  toolbar?: React.ReactNode;
  empty?: boolean;
  emptyMessage?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn('overflow-hidden p-0', className)}>
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-4 border-b border-border bg-table-head/70 px-4 py-3">
          {toolbar}
        </div>
      ) : null}
      <div className="max-h-[70vh] overflow-auto">
        <table className="min-w-full text-left text-sm">{children}</table>
      </div>
      {empty && emptyMessage ? (
        <div className="px-5 py-10 text-center text-sm text-fg-subtle">{emptyMessage}</div>
      ) : null}
    </Card>
  );
}
