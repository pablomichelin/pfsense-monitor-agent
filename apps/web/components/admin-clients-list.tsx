'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { getURLFromRedirectError } from 'next/dist/client/components/redirect';
import { ClientDeleteButton } from '@/components/client-delete-button';
import { Button } from '@/components/ui';
import { updateClientAction } from '@/lib/admin';
import {
  formInputCompactClassName,
  formSelectCompactClassName,
} from '@/lib/form-field-styles';
import { statusLabel } from '@/lib/rbac-labels';

// Compartilhado pelos dois editores administrativos. Não persiste dados de
// identidade/senha no armazenamento do navegador.
export function useAdminDraftGuard(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!dirtyRef.current || !(anchor instanceof HTMLAnchorElement)
        || anchor.target === '_blank' || anchor.hasAttribute('download')
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      if (anchor.href === window.location.href) return;
      if (!window.confirm('Descartar alterações não salvas?')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else dirtyRef.current = false;
    };
    const submit = (event: SubmitEvent) => {
      if (!dirtyRef.current || !(event.target instanceof HTMLFormElement) || event.target.method.toLowerCase() !== 'get') return;
      if (!window.confirm('Descartar alterações não salvas?')) {
        event.preventDefault(); event.stopImmediatePropagation();
      } else dirtyRef.current = false;
    };
    // Captura antes do roteador: ao cancelar, URL e formulário permanecem juntos.
    let previous = { url: window.location.href, state: window.history.state };
    const popstate = (event: PopStateEvent) => {
      if (dirtyRef.current && !window.confirm('Descartar alterações não salvas?')) {
        event.stopImmediatePropagation();
        window.history.pushState(previous.state, '', previous.url);
        return;
      }
      dirtyRef.current = false;
      previous = { url: window.location.href, state: window.history.state };
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', popstate, true);
    document.addEventListener('click', click, true);
    document.addEventListener('submit', submit, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', popstate, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('submit', submit, true);
    };
  }, [dirty]);
  return dirtyRef;
}

type ClientItem = {
  id: string;
  name: string;
  code: string;
  status: string;
  node_count: number;
};

export function AdminClientsList({
  clients,
  returnTo,
  canUpdate = false,
  canDelete = false,
  canViewFirewalls = false,
}: {
  clients: ClientItem[];
  returnTo: string;
  canUpdate?: boolean;
  canDelete?: boolean;
  canViewFirewalls?: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, Pick<ClientItem, 'name' | 'code' | 'status'>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useAdminDraftGuard(Object.keys(drafts).length > 0);
  const discard = (id: string) => setDrafts((current) => {
    const next = { ...current }; delete next[id]; return next;
  });
  const change = (client: ClientItem, field: 'name' | 'code' | 'status', value: string) => {
    setDrafts((current) => {
      const baseline = current[client.id] ?? { name: client.name, code: client.code, status: client.status };
      const next = { ...baseline, [field]: value };
      if (next.name === client.name && next.code === client.code && next.status === client.status) {
        const remaining = { ...current }; delete remaining[client.id]; return remaining;
      }
      return { ...current, [client.id]: next };
    });
  };
  const save = async (client: ClientItem, data: FormData) => {
    setSaving(client.id); setError(null);
    try {
      await updateClientAction(data);
      discard(client.id);
    } catch (cause) {
      if (isRedirectError(cause)) {
        const target = getURLFromRedirectError(cause);
        if (target && new URL(target, 'https://local.invalid').searchParams.get('status') === 'ok') discard(client.id);
        throw cause;
      }
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar cliente. O rascunho foi mantido.');
    } finally { setSaving(null); }
  };

  return (
    <div className="space-y-2">
      {error ? <p role="alert" className="text-sm text-danger-fg">{error}</p> : null}
      {Object.keys(drafts).length > 0 ? <p role="status" className="text-xs text-warning-fg">Há alterações não salvas. Salve ou cancele antes de sair.</p> : null}
      {clients.map((client) => (
        <div
          key={client.id}
          className="rounded-lg border border-slate-700/80 bg-panel-soft/50 px-3 py-2"
        >
          {!canUpdate ? (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg">
              <span>{client.name} ({client.code}) · {statusLabel(client.status)} · {client.node_count} firewall(s)</span>
              <div className="flex flex-wrap items-center gap-2">
                {canViewFirewalls ? <Link href={`/nodes?client_id=${client.id}`} className="text-primary">Ver inventário</Link> : null}
                {canDelete && client.node_count === 0 ? (
                  <ClientDeleteButton clientId={client.id} clientName={client.name} returnTo={returnTo} compact />
                ) : null}
              </div>
            </div>
          ) : (
          <form
            action={(data) => save(client, data)}
            onSubmit={(event) => {
              if (saving) { event.preventDefault(); return; }
              const nextStatus = drafts[client.id]?.status ?? client.status;
              if (nextStatus !== client.status && !window.confirm(`${nextStatus === 'active' ? 'Reativar' : 'Desativar'} ${client.name}? Os vínculos existentes serão preservados.`)) event.preventDefault();
            }}
            className="flex flex-wrap items-center gap-x-3 gap-y-2"
          >
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="client_id" value={client.id} />

            <label className="flex min-w-[10rem] flex-1 items-center gap-2 sm:max-w-[14rem]">
              <span className="w-10 shrink-0 text-xs font-medium text-slate-400">Nome</span>
              <input
                type="text"
                name="name"
                value={drafts[client.id]?.name ?? client.name}
                onChange={(event) => change(client, 'name', event.target.value)}
                className={`${formInputCompactClassName} min-w-0 flex-1`}
              />
            </label>

            <label className="flex min-w-[8rem] items-center gap-2 sm:max-w-[11rem]">
              <span className="w-12 shrink-0 text-xs font-medium text-slate-400">Código</span>
              <input
                type="text"
                name="code"
                value={drafts[client.id]?.code ?? client.code}
                onChange={(event) => change(client, 'code', event.target.value)}
                className={`${formInputCompactClassName} min-w-0 flex-1 font-mono uppercase`}
              />
            </label>

            <label className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-medium text-slate-400">Status</span>
              <select
                name="status"
                value={drafts[client.id]?.status ?? client.status}
                onChange={(event) => change(client, 'status', event.target.value)}
                className={`${formSelectCompactClassName} w-[7.5rem]`}
              >
                <option value="active">{statusLabel('active')}</option>
                <option value="inactive">{statusLabel('inactive')}</option>
              </select>
            </label>

            <p className="shrink-0 text-xs text-slate-500">
              {client.node_count} fw
              {canViewFirewalls ? <Link
                href={`/nodes?client_id=${client.id}`}
                className="ml-1.5 text-cyan-400 hover:text-cyan-300"
              >
                Inventário
              </Link> : null}
            </p>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                type="submit"
                disabled={saving !== null}
                variant="secondary"
                size="sm"
                className="border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
              >
                {saving === client.id ? 'Salvando…' : client.status === 'inactive' && drafts[client.id]?.status === 'active' ? 'Salvar reativação' : 'Salvar'}
              </Button>
              {drafts[client.id] ? <Button type="button" variant="secondary" size="sm" disabled={saving !== null} onClick={() => discard(client.id)}>Cancelar</Button> : null}
              {canDelete && client.node_count === 0 ? (
                <ClientDeleteButton
                  clientId={client.id}
                  clientName={client.name}
                  returnTo={returnTo}
                  compact
                />
              ) : canDelete ? (
                <span
                  className="hidden text-xs text-slate-500 xl:inline"
                  title="Remova os firewalls antes de excluir o cliente."
                >
                  Sem exclusão (tem firewalls)
                </span>
              ) : null}
            </div>
          </form>
          )}
        </div>
      ))}

    </div>
  );
}
