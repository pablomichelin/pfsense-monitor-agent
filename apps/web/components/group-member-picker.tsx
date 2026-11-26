'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { NodeBrowserControls } from './node-browser-controls';
import { usePagedNodes } from '@/lib/use-paged-nodes';
import { updateGroupMembersAction } from '@/lib/fleet-org-actions';
import { Alert, Button } from './ui';

export function GroupMemberPicker({ groupId, clientId, memberIds, membershipRevision }: {
  groupId: string; clientId: string; memberIds: string[]; membershipRevision?: string;
}) {
  const browser = usePagedNodes(undefined, clientId);
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(memberIds));
  const [revision, setRevision] = useState(membershipRevision);
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [notice, setNotice] = useState<{ text: string; error?: boolean; conflict?: boolean } | null>(null);
  // All existing memberships survive paging/search. Only explicit toggles change them.
  return <div className="space-y-3">
    <NodeBrowserControls browser={browser} />
    <p className="text-sm text-fg-muted">{selected.size} membros selecionados, incluindo outras páginas.</p>
    <div className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border border-border p-3 md:grid-cols-2">
      {(browser.result?.items ?? []).map((node) => <label key={node.id} className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={selected.has(node.id)} disabled={pending || refreshing || browser.loading} onChange={() => setSelected((current) => {
          const next = new Set(current);
          if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
          return next;
        })} />
        {node.display_name || node.hostname}
      </label>)}
    </div>
    {notice ? <Alert variant={notice.error ? 'error' : 'info'}>{notice.text}</Alert> : null}
    {notice?.conflict ? <Button type="button" variant="secondary" disabled={refreshing} onClick={() => startRefresh(() => {
      router.refresh();
      setNotice(null);
    })}>
      Recarregar membros
    </Button> : null}
    <Button type="button" disabled={pending || refreshing || browser.loading || !!browser.error || notice?.conflict} onClick={async () => {
      setPending(true); setNotice(null);
      try {
        const result = await updateGroupMembersAction(groupId, [...selected], revision);
        if (result.ok) {
          setRevision(result.data?.membershipRevision ?? revision);
          setNotice({ text: 'Membros do grupo atualizados.' });
          router.refresh();
        } else {
          setNotice({ text: result.error, error: true, conflict: result.status === 409 });
        }
      } catch { setNotice({ text: 'Não foi possível salvar os membros. Tente novamente.', error: true }); }
      finally { setPending(false); }
    }}>Salvar membros</Button>
  </div>;
}
