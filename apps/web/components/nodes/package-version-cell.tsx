import { resolvePackageVersionState } from '@/lib/agent-version';
import { cn } from '@/lib/cn';

type Props = {
  agentVersion: string | null;
  targetPackageVersion?: string | null;
};

export function PackageVersionCell({ agentVersion, targetPackageVersion }: Props) {
  if (!agentVersion) {
    return <span className="text-sm text-slate-500">não instalado</span>;
  }

  const state = resolvePackageVersionState(agentVersion, targetPackageVersion);

  return (
    <div className="flex flex-col gap-1">
      <p
        className={cn(
          'font-mono text-sm',
          state === 'match' && 'text-cyan-200',
          state === 'outdated' && 'text-amber-300',
          state === 'newer' && 'text-emerald-300',
          (state === 'unknown' || state === 'missing') && 'text-slate-300',
        )}
      >
        {agentVersion}
      </p>
      {state === 'outdated' && targetPackageVersion ? (
        <p className="text-xs text-amber-400/90">atual: {targetPackageVersion}</p>
      ) : null}
    </div>
  );
}
