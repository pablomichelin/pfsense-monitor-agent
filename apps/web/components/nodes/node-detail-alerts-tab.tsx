import type { NodeDetailsResponse } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageSection } from '@/components/ui/page-section';

type Node = NodeDetailsResponse['node'];

export function NodeDetailAlertsTab({ node }: { node: Node }) {
  return (
    <PageSection title="Alertas" description="Alertas recentes abertos para este firewall.">
      {node.recent_alerts.length === 0 ? (
        <Alert variant="success">Nenhum alerta recente para este firewall.</Alert>
      ) : (
        <div className="space-y-3">
          {node.recent_alerts.map((alert) => (
            <Card key={alert.id} className="bg-panel-soft/60">
              <div className="flex items-center justify-between gap-4">
                <h3 className="font-display text-lg text-fg">{alert.title}</h3>
                <div className="flex shrink-0 gap-2">
                  <Badge variant="warning">{alert.severity}</Badge>
                  <Badge variant="neutral">{alert.status}</Badge>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-400">{alert.description}</p>
              <p className="mt-2 text-xs text-slate-500">
                Aberto em {formatDateTime(alert.opened_at)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </PageSection>
  );
}
