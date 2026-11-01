'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NodeBrowserControls } from './node-browser-controls';
import { usePagedNodes } from '@/lib/use-paged-nodes';
import { updateGroupMembersAction } from '@/lib/fleet-org-actions';
import { Alert, Button } from './ui';

export function GroupMemberPicker({ groupId, clientId, memberIds }: {
  groupId: string; clientId: string; memberIds: string[];
}) {
  const browser = usePagedNodes(undefined, clientId);
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(memberIds));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // All existing memberships survive paging/search. Only explicit toggles change them.
  return <div className="space-y-3">
    <NodeBrowserControls browser={browser} />
    <p className="text-sm text-fg-muted">{selected.size} membros selecionados, incluindo outras páginas.</p>
    <div className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border border-border p-3 md:grid-cols-2">
      {(browser.result?.items ?? []).map((node) => <label key={node.id} className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={selected.has(node.id)} disabled={pending || browser.loading} onChange={() => setSelected((current) => {
          const next = new Set(current);
          if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
          return next;
        })} />
        {node.display_name || node.hostname}
      </label>)}
    </div>
    {message ? <Alert variant="info">{message}</Alert> : null}
    <Button type="button" disabled={pending || browser.loading || !!browser.error} onClick={async () => {
      setPending(true); setMessage(null);
      try {
        const result = await updateGroupMembersAction(groupId, [...selected]);
        setMessage(result.ok ? 'Membros do grupo atualizados.' : result.error);
        if (result.ok) router.refresh();
      } catch { setMessage('Não foi possível salvar os membros. Tente novamente.'); }
      finally { setPending(false); }
    }}>Salvar membros</Button>
  </div>;
}
