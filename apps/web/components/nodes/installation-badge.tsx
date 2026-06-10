import { Badge } from '@/components/ui/badge';

export function InstallationBadge({
  nodeUidStatus,
  agentVersion,
}: {
  nodeUidStatus: string;
  agentVersion: string | null;
}) {
  if (nodeUidStatus !== 'active') {
    return <Badge variant="danger">Bloqueado</Badge>;
  }

  if (agentVersion) {
    return <Badge variant="success">Agente ativo</Badge>;
  }

  return <Badge variant="warning">Pronto p/ bootstrap</Badge>;
}
