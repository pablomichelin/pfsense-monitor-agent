'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card } from '@/components/ui';
import { updateNodeFleetMetadataAction } from '@/lib/fleet-org-actions';
import type { FleetTagItem, NodeCriticality } from '@/lib/api';

type Props = {
  nodeId: string;
  clientId: string;
  criticality: NodeCriticality;
  selectedTagIds: string[];
  availableTags: FleetTagItem[];
};

export function NodeFleetMetadataForm({
  nodeId,
  clientId,
  criticality,
  selectedTagIds,
  availableTags,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [draftCriticality, setDraftCriticality] = useState<NodeCriticality>();
  const [draftTagIds, setDraftTagIds] = useState<string[]>();

  const clientTags = availableTags.filter((tag) => tag.client_id === clientId);
  const tagIds = draftTagIds ?? selectedTagIds;
  const busy = pending || refreshing;
  const changed = draftCriticality !== undefined || draftTagIds !== undefined;

  function changeTag(id: string, checked: boolean) {
    const next = checked ? [...tagIds, id] : tagIds.filter((tagId) => tagId !== id);
    const sameSelection = next.length === selectedTagIds.length && next.every((tagId) => selectedTagIds.includes(tagId));
    setDraftTagIds(sameSelection ? undefined : next);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !changed) return;
    setPending(true);
    setError(null);

    try {
      const result = await updateNodeFleetMetadataAction(nodeId, {
        criticality: draftCriticality,
        tag_ids: draftTagIds,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraftCriticality(undefined);
      setDraftTagIds(undefined);
      startRefresh(() => router.refresh());
    } catch {
      setError('Não foi possível salvar a organização. Tente novamente.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Criticidade / SLA</p>
          <select
            name="criticality"
            value={draftCriticality ?? criticality}
            disabled={busy}
            onChange={(event) => {
              const value = event.currentTarget.value as NodeCriticality;
              setDraftCriticality(value === criticality ? undefined : value);
            }}
            className="mt-1.5 h-11 w-full rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 outline-none"
          >
            <option value="critical">Crítico</option>
            <option value="standard">Padrão</option>
            <option value="lab">Lab</option>
          </select>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Tags</p>
          {clientTags.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              Nenhuma tag cadastrada para este cliente. Crie tags em Admin → Grupos e tags.
            </p>
          ) : (
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-700/80 bg-slate-950/20 p-3">
              {clientTags.map((tag) => (
                <label key={tag.id} className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    name="tag_ids"
                    value={tag.id}
                    checked={tagIds.includes(tag.id)}
                    disabled={busy}
                    onChange={(event) => changeTag(tag.id, event.currentTarget.checked)}
                    className="rounded border-slate-600 bg-panel-soft"
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}

        <Button type="submit" className="w-full" disabled={busy || !changed}>
          {busy ? 'Salvando…' : 'Salvar organização'}
        </Button>
      </form>
    </Card>
  );
}
