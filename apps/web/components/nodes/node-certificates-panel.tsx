import { formatDateTime } from '@/lib/format';
import type { NodeDetailsResponse } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageSection } from '@/components/ui/page-section';

type NodeCertificate = NodeDetailsResponse['node']['certificates'][number];

function expiryBadgeTone(daysUntilExpiry: number): 'success' | 'warning' | 'danger' {
  if (daysUntilExpiry <= 0 || daysUntilExpiry <= 7) {
    return 'danger';
  }
  if (daysUntilExpiry <= 30) {
    return 'warning';
  }
  return 'success';
}

function expiryBadgeLabel(daysUntilExpiry: number): string {
  if (daysUntilExpiry <= 0) {
    return 'Expirado';
  }
  return `${daysUntilExpiry}d`;
}

export function NodeCertificatesPanel({
  certificates,
}: {
  certificates: NodeCertificate[];
}) {
  if (certificates.length === 0) {
    return (
      <PageSection
        title="Certificados"
        description="Inventário reportado pelo agente (somente metadados públicos)."
      >
        <Card>
          <p className="text-sm text-slate-500">
            Nenhum certificado reportado ainda. Requer agente ≥ 0.4.9 com{' '}
            <span className="font-mono text-slate-400">MONITOR_AGENT_CERTIFICATES_ENABLED=1</span>{' '}
            e flag <span className="font-mono text-slate-400">CERTIFICATES_ENABLED=true</span> na API.
          </p>
        </Card>
      </PageSection>
    );
  }

  return (
    <PageSection
      title="Certificados"
      description="Metadados coletados localmente — sem chaves privadas. Renovação manual no pfSense."
    >
      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 font-medium">Uso / Subject</th>
              <th className="px-3 py-2 font-medium">Emissor</th>
              <th className="px-3 py-2 font-medium">Válido de</th>
              <th className="px-3 py-2 font-medium">Expira em</th>
              <th className="px-3 py-2 font-medium">Restante</th>
            </tr>
          </thead>
          <tbody>
            {certificates.map((certificate) => (
              <tr
                key={certificate.cert_key}
                className="border-b border-slate-800/70 text-slate-300 last:border-0"
              >
                <td className="px-3 py-3 align-top">
                  <p className="font-medium text-slate-200">
                    {certificate.usage || certificate.subject}
                  </p>
                  {certificate.usage ? (
                    <p className="mt-1 font-mono text-xs text-slate-500">{certificate.subject}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 align-top font-mono text-xs text-slate-400">
                  {certificate.issuer || '—'}
                </td>
                <td className="px-3 py-3 align-top whitespace-nowrap text-slate-400">
                  {formatDateTime(certificate.not_before)}
                </td>
                <td className="px-3 py-3 align-top whitespace-nowrap text-slate-400">
                  {formatDateTime(certificate.not_after)}
                </td>
                <td className="px-3 py-3 align-top">
                  <Badge variant={expiryBadgeTone(certificate.days_until_expiry)}>
                    {expiryBadgeLabel(certificate.days_until_expiry)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </PageSection>
  );
}
