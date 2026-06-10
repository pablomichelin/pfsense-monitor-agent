import { cn } from '@/lib/cn';
import { Card } from './card';

export const dataTableHeadClassName =
  'border-b border-slate-800 bg-slate-950/40 text-slate-400';

export const dataTableRowClassName =
  'border-b border-slate-900/80 text-slate-200 transition hover:bg-slate-950/20';

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
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-800 bg-slate-950/40 px-4 py-3">
          {toolbar}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">{children}</table>
      </div>
      {empty && emptyMessage ? (
        <div className="px-5 py-10 text-center text-sm text-slate-500">{emptyMessage}</div>
      ) : null}
    </Card>
  );
}
