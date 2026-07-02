import Link from 'next/link';
import {
  DataTable,
  dataTableHeadClassName,
  dataTableRowClassName,
} from '@/components/ui/data-table';
import type { FleetResponse } from '@/lib/api';
import { cn } from '@/lib/cn';

type FleetVersionMatrixProps = {
  matrix: FleetResponse['version_matrix'];
  packageTargetVersion: string | null;
};

const alignmentLabel: Record<
  NonNullable<FleetResponse['version_matrix']['package'][number]['alignment']>,
  string
> = {
  match: 'Alinhado',
  outdated: 'Desatualizado',
  newer: 'Acima do alvo',
  missing: 'Não informado',
  unknown: 'Sem alvo',
};

const alignmentClass: Record<
  NonNullable<FleetResponse['version_matrix']['package'][number]['alignment']>,
  string
> = {
  match: 'text-cyan-200',
  outdated: 'text-amber-300',
  newer: 'text-emerald-300',
  missing: 'text-slate-400',
  unknown: 'text-slate-400',
};

function VersionTable({
  title,
  description,
  rows,
  inventoryHref,
  showAlignment = false,
}: {
  title: string;
  description: string;
  rows: Array<{ version: string; count: number; alignment?: string }>;
  inventoryHref: string;
  showAlignment?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-display text-base font-semibold text-white">{title}</h3>
          <p className="text-sm text-slate-400">{description}</p>
        </div>
        <Link
          href={inventoryHref}
          className="text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
        >
          Ver inventário
        </Link>
      </div>

      <DataTable
        empty={rows.length === 0}
        emptyMessage="Nenhum firewall no escopo atual."
      >
        <thead>
          <tr className={dataTableHeadClassName}>
            <th className="px-4 py-3 font-medium">Versão</th>
            <th className="px-4 py-3 font-medium">Firewalls</th>
            {showAlignment ? (
              <th className="px-4 py-3 font-medium">Situação</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${title}-${row.version}`} className={dataTableRowClassName}>
              <td className="px-4 py-3 font-mono text-sm text-slate-100">
                {row.version}
              </td>
              <td className="px-4 py-3 text-sm text-slate-200">{row.count}</td>
              {showAlignment ? (
                <td className="px-4 py-3 text-sm">
                  {row.alignment ? (
                    <span
                      className={cn(
                        alignmentClass[
                          row.alignment as keyof typeof alignmentClass
                        ],
                      )}
                    >
                      {
                        alignmentLabel[
                          row.alignment as keyof typeof alignmentLabel
                        ]
                      }
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

export function FleetVersionMatrix({
  matrix,
  packageTargetVersion,
}: FleetVersionMatrixProps) {
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <VersionTable
        title="pfSense OS"
        description="Distribuição de versões do sistema operacional na frota visível."
        rows={matrix.pfsense}
        inventoryHref="/nodes?sort_by=version"
      />
      <VersionTable
        title="Package monitor"
        description={
          packageTargetVersion
            ? `Comparativo com release alvo ${packageTargetVersion}.`
            : 'Comparativo com a release alvo configurada no controlador.'
        }
        rows={matrix.package}
        inventoryHref="/nodes?sort_by=agent_version"
        showAlignment
      />
    </div>
  );
}
