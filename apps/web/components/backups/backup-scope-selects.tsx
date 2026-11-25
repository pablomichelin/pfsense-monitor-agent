'use client';

import { useState } from 'react';
import type { NodesFiltersResponse } from '@/lib/api';

type BackupScopeSelectsProps = Pick<NodesFiltersResponse, 'clients' | 'sites'> & {
  initialClientId?: string;
  initialSiteId?: string;
};

const selectClass =
  'h-11 min-w-0 rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none';

export function BackupScopeSelects({
  clients,
  sites,
  initialClientId,
  initialSiteId,
}: BackupScopeSelectsProps) {
  const [clientId, setClientId] = useState(initialClientId ?? '');
  const [siteId, setSiteId] = useState(initialSiteId ?? '');
  const availableSites = clientId ? sites.filter((site) => site.client_id === clientId) : sites;

  function changeClient(nextClientId: string) {
    setClientId(nextClientId);
    if (nextClientId && !sites.some((site) => site.id === siteId && site.client_id === nextClientId)) {
      setSiteId('');
    }
  }

  return (
    <>
      <select
        name="client_id"
        aria-label="Cliente"
        value={clientId}
        onChange={(event) => changeClient(event.currentTarget.value)}
        className={selectClass}
      >
        <option value="">Todos os clientes</option>
        {clientId && !clients.some((client) => client.id === clientId) ? (
          <option value={clientId}>Cliente da consulta (indisponível na lista)</option>
        ) : null}
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name} ({client.node_count})
          </option>
        ))}
      </select>
      <select
        name="site_id"
        aria-label="Local"
        value={siteId}
        onChange={(event) => setSiteId(event.currentTarget.value)}
        className={selectClass}
      >
        <option value="">Todos os sites</option>
        {siteId && !availableSites.some((site) => site.id === siteId) ? (
          <option value={siteId}>Local da consulta (indisponível na lista)</option>
        ) : null}
        {availableSites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.client_name} / {site.name} ({site.node_count})
          </option>
        ))}
      </select>
    </>
  );
}
