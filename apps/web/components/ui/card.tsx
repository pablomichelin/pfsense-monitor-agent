import { cn } from '@/lib/cn';

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('glass-panel rounded-xl p-5', className)}>
      {children}
    </div>
  );
}
