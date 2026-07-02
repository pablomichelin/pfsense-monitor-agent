'use client';

import { useCallback, useState, useTransition } from 'react';
import type { NodeCapabilitiesResponse } from '@/lib/api';
import {
  fetchNodeCapabilities,
  revokePfrestCredentialAction,
  savePfrestCredentialAction,
  testPfrestCredentialAction,
} from '@/lib/pfsense-capabilities-actions';
import { formatDateTime } from '@/lib/format';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageSection } from '@/components/ui/page-section';

type Props = {
  nodeId: string;
  canManageCredentials: boolean;
  initialData: NodeCapabilitiesResponse;
};

export function NodeCapabilitiesPanel({
  nodeId,
  canManageCredentials,
  initialData,
}: Props) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState(data.capability?.api_base_url ?? '');
  const [authMethod, setAuthMethod] = useState<'api_key' | 'bearer_token'>('api_key');
  const [pending, startTransition] = useTransition();

  const refreshFrom = useCallback((next: NodeCapabilitiesResponse) => {
    setData(next);
    setApiBaseUrl(next.capability?.api_base_url ?? '');
  }, []);

  const saveCredential = () => {
    if (!secret.trim()) {
      setError('Informe o segredo da credencial pfREST');
      return;
    }

    startTransition(async () => {
      try {
        await savePfrestCredentialAction(nodeId, {
          auth_method: authMethod,
          secret: secret.trim(),
          api_base_url: apiBaseUrl.trim() || undefined,
        });
        setSecret('');
        setError(null);
        setMessage('Credencial salva (segredo cifrado — não exibido).');
        const refreshed = await fetchNodeCapabilities(nodeId);
        refreshFrom(refreshed);
      } catch (err) {
        setMessage(null);
        setError(err instanceof Error ? err.message : 'Falha ao salvar credencial');
      }
    });
  };

  const testCredential = () => {
    startTransition(async () => {
      try {
        const result = await testPfrestCredentialAction(nodeId);
        setError(result.ok ? null : result.message);
        setMessage(
          result.ok
            ? `Teste OK (${result.latency_ms}ms)${result.version ? ` — pfREST ${result.version}` : ''}`
            : null,
        );
        const refreshed = await fetchNodeCapabilities(nodeId);
        refreshFrom(refreshed);
      } catch (err) {
        setMessage(null);
        setError(err instanceof Error ? err.message : 'Falha no teste de credencial');
      }
    });
  };

  const revokeCredential = () => {
    startTransition(async () => {
      try {
        await revokePfrestCredentialAction(nodeId);
        setMessage('Credencial revogada.');
        setError(null);
        const refreshed = await fetchNodeCapabilities(nodeId);
        refreshFrom(refreshed);
      } catch (err) {
        setMessage(null);
        setError(err instanceof Error ? err.message : 'Falha ao revogar credencial');
      }
    });
  };

  const capability = data.capability;
  const credential = data.credential;

  return (
    <PageSection
      title="Capacidades pfREST"
      description="Inventário reportado pelo agente e cofre de credenciais (segredos nunca retornam à UI)."
    >
      <Card className="space-y-4 p-4 text-sm text-slate-300">
        {!capability ? (
          <p className="text-slate-500">
            Nenhum inventário reportado. Requer{' '}
            <span className="font-mono text-slate-400">NODE_CAPABILITIES_ENABLED=true</span> na API e{' '}
            <span className="font-mono text-slate-400">MONITOR_AGENT_CAPABILITIES_ENABLED=1</span> no agente.
          </p>
        ) : (
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">pfREST instalado</dt>
              <dd>
                {capability.pfrest_enabled === null
                  ? 'Desconhecido'
                  : capability.pfrest_enabled
                    ? 'Sim'
                    : 'Não'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Versão</dt>
              <dd>{capability.pfrest_version || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">URL base</dt>
              <dd className="font-mono text-xs">{capability.api_base_url || '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Modo de acesso</dt>
              <dd>{capability.access_mode}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Último reporte</dt>
              <dd>
                {capability.last_reported_at
                  ? formatDateTime(capability.last_reported_at)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Último teste</dt>
              <dd>
                {capability.last_probe_at
                  ? `${formatDateTime(capability.last_probe_at)}${capability.last_error ? ` — ${capability.last_error}` : ''}`
                  : '—'}
              </dd>
            </div>
          </dl>
        )}

        {credential ? (
          <div className="rounded-lg border border-slate-800 bg-panel-soft/40 p-3">
            <p>
              <span className="text-slate-500">Credencial ativa:</span>{' '}
              {credential.auth_method} · hint {credential.secret_hint}
            </p>
            {credential.last_test_result ? (
              <p className="mt-1 text-xs text-slate-500">
                Último teste: {credential.last_test_result}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-slate-500">Nenhuma credencial pfREST cadastrada.</p>
        )}

        {canManageCredentials ? (
          <div className="space-y-3 border-t border-slate-800 pt-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Cadastro / rotação (vault)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-slate-500">Método</span>
                <select
                  className="w-full rounded-md border border-slate-700 bg-panel px-2 py-2"
                  value={authMethod}
                  onChange={(event) =>
                    setAuthMethod(event.target.value as 'api_key' | 'bearer_token')
                  }
                >
                  <option value="api_key">API Key (X-API-Key)</option>
                  <option value="bearer_token">Bearer token</option>
                </select>
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-slate-500">URL base pfREST</span>
                <input
                  className="w-full rounded-md border border-slate-700 bg-panel px-2 py-2 font-mono text-xs"
                  value={apiBaseUrl}
                  onChange={(event) => setApiBaseUrl(event.target.value)}
                  placeholder="https://192.168.1.1"
                />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-slate-500">Segredo</span>
                <input
                  type="password"
                  className="w-full rounded-md border border-slate-700 bg-panel px-2 py-2 font-mono text-xs"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending} onClick={saveCredential}>
                Salvar credencial
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !credential}
                onClick={testCredential}
              >
                Testar conexão
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={pending || !credential}
                onClick={revokeCredential}
              >
                Revogar
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <Alert variant="error">{error}</Alert> : null}
        {message ? <Alert variant="success">{message}</Alert> : null}
      </Card>
    </PageSection>
  );
}
