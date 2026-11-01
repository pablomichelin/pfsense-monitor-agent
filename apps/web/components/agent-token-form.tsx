'use client';

import { NodeBrowserControls } from '@/components/node-browser-controls';
import { usePagedNodes } from '@/lib/use-paged-nodes';
import type { NodesListResponse } from '@/lib/api';
import { useState } from 'react';
import { createAgentTokenAction, type AgentTokenActionResult } from '@/lib/admin';
import { CopyButton } from '@/components/copy-button';
import { Alert } from '@/components/ui/alert';

type NodeOption = { id: string; node_uid: string; client: { code: string } };

export function AgentTokenForm({ nodes, initialPage }: { nodes: NodeOption[]; initialPage?: NodesListResponse }) {
  const browser = usePagedNodes(initialPage);
  const options = browser.result?.items ?? (browser.loading ? nodes : []);
  const [nodeId, setNodeId] = useState('');
  const [result, setResult] = useState<AgentTokenActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const fieldClass = 'w-full rounded-lg border border-border bg-panel-soft h-11 px-4 text-sm text-fg';

  return (
    <div className="mt-4 space-y-3">
      <NodeBrowserControls browser={browser} disabled={pending} onChange={() => { setNodeId(''); setResult(null); }} />
      <form action={async (formData) => {
        if (pending || browser.loading || browser.error || !options.some((node) => node.id === String(formData.get('node_id')))) return;
        setResult(null);
        setPending(true);
        try {
          setResult(await createAgentTokenAction(formData));
        } catch {
          setResult({ ok: false, error: 'Não foi possível emitir o token. Tente novamente.' });
        } finally {
          setPending(false);
        }
      }} className="space-y-3">
        <select name="node_id" aria-label="Firewall do token" required value={options.some((node) => node.id === nodeId) ? nodeId : ''} className={fieldClass} disabled={pending || browser.loading || !!browser.error} onChange={(event) => { setNodeId(event.target.value); setResult(null); }}>
          <option value="" disabled>Selecione o firewall</option>
          {options.map((node) => <option key={node.id} value={node.id}>{node.client.code} — {node.node_uid}</option>)}
        </select>
        <input type="datetime-local" name="expires_at" aria-label="Expiração do token" className={fieldClass} disabled={pending} />
        <button type="submit" disabled={pending || browser.loading || !!browser.error || !options.some((node) => node.id === nodeId)} className="w-full rounded-lg bg-cyan-500 h-11 px-5 text-sm font-medium text-slate-950 disabled:opacity-50">
          {pending ? 'Emitindo…' : 'Emitir token'}
        </button>
      </form>
      <div aria-live="polite">
        {result?.ok ? <div className="space-y-2">
          <p className="text-sm text-fg">Token {result.hint} emitido. Copie agora; o valor será ocultado ao fechar.</p>
          <code className="block break-all text-sm text-fg">{result.token}</code>
          <CopyButton value={result.token} />
          <button type="button" className="ml-3 text-sm text-primary" onClick={() => setResult(null)}>Ocultar token</button>
        </div> : result ? <Alert variant="error">{result.error}</Alert> : null}
      </div>
    </div>
  );
}
