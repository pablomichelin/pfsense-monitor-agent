'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card } from '@/components/ui';
import { updateNodeFleetMetadataAction } from '@/lib/fleet-org-actions';
import type { FleetTagItem, NodeCriticality, NodeFleetMetadataChanges } from '@/lib/api';

type Props = {
  nodeId: string;
  clientId: string;
  criticality: NodeCriticality;
  selectedTagIds: string[];
  supportsTagChanges: boolean;
  availableTags: FleetTagItem[] | null;
};

export function NodeFleetMetadataForm({
  nodeId,
  clientId,
  criticality,
  selectedTagIds,
  supportsTagChanges,
  availableTags,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [draftCriticality, setDraftCriticality] = useState<NodeCriticality>();
  const [draftTags, setDraftTags] = useState(() => new Map<string, boolean>());

  const clientTags = availableTags?.filter((tag) => tag.client_id === clientId) ?? [];
  const availableTagIds = new Set(clientTags.map((tag) => tag.id));
  const selectedTags = new Set(selectedTagIds);
  const tagChanges = new Map([...draftTags].filter(([id, checked]) =>
    availableTagIds.has(id) && selectedTags.has(id) !== checked,
  ));
  const unavailableChanges = [...draftTags].some(([id, checked]) =>
    !availableTagIds.has(id) && selectedTags.has(id) !== checked,
  );
  const nextCriticality = draftCriticality === criticality ? undefined : draftCriticality;
  const busy = pending || refreshing;
  const changed = nextCriticality !== undefined || tagChanges.size > 0;

  useEffect(() => {
    setDraftCriticality((current) => current === criticality ? undefined : current);
    const selected = new Set(selectedTagIds);
    setDraftTags((current) => {
      const next = new Map([...current].filter(([id, checked]) => selected.has(id) !== checked));
      return next.size === current.size ? current : next;
    });
  }, [criticality, selectedTagIds]);

  function changeTag(id: string, checked: boolean) {
    setDraftTags((current) => {
      const next = new Map(current);
      if (selectedTags.has(id) === checked) next.delete(id);
      else next.set(id, checked);
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !changed) return;
    setPending(true);
    setError(null);

    try {
      const changes: NodeFleetMetadataChanges = { criticality: nextCriticality };
      if (tagChanges.size > 0) {
        if (supportsTagChanges) {
          const additions: string[] = [];
          const removals: string[] = [];
          for (const [id, checked] of tagChanges) {
            if (checked) additions.push(id);
            else removals.push(id);
          }
          if (additions.length > 0) changes.add_tag_ids = additions;
          if (removals.length > 0) changes.remove_tag_ids = removals;
        } else {
          const tags = new Set(selectedTagIds);
          for (const [id, checked] of tagChanges) {
            if (checked) tags.add(id);
            else tags.delete(id);
          }
          changes.tag_ids = [...tags];
        }
      }
      const result = await updateNodeFleetMetadataAction(nodeId, changes);
      if (!result.ok) {
        setError(result.error);
        if (result.status === 400 && tagChanges.size > 0) startRefresh(() => router.refresh());
        return;
      }
      setDraftCriticality(undefined);
      setDraftTags((current) => new Map([...current].filter(([id]) => !tagChanges.has(id))));
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
          {availableTags === null ? (
            <p className="mt-2 text-sm text-slate-400">Catálogo de tags temporariamente indisponível.</p>
          ) : clientTags.length === 0 ? (
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
                    checked={draftTags.get(tag.id) ?? selectedTags.has(tag.id)}
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

        {availableTags !== null && unavailableChanges ? (
          <Alert variant="warning" className="space-y-2">
            <p>Uma alteração de tag ficou indisponível. Você pode salvar as demais alterações.</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setDraftTags((current) =>
                new Map([...current].filter(([id]) => availableTagIds.has(id))),
              )}
            >
              Descartar alterações indisponíveis
            </Button>
          </Alert>
        ) : null}
        {error ? <Alert variant="error">{error}</Alert> : null}

        <Button type="submit" className="w-full" disabled={busy || !changed}>
          {busy ? 'Salvando…' : 'Salvar organização'}
        </Button>
      </form>
    </Card>
  );
}
