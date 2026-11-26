'use client';

import { useEffect, useState } from 'react';

export function NodeRemoteAccessUrlField({ renderedUrl }: { renderedUrl: string | null }) {
  const originalUrl = renderedUrl ?? '';
  const normalizedUrl = originalUrl.trim();
  const [draft, setDraft] = useState<{ value: string; startedFrom: string }>();
  const revertedToStart = draft !== undefined && draft.startedFrom !== '' && draft.value.trim() === draft.startedFrom;

  useEffect(() => {
    setDraft((current) => current?.value.trim() === normalizedUrl ? undefined : current);
  }, [normalizedUrl]);

  return (
    <>
      {/* Enter can submit before blur, so a reverted value must also compare as unchanged. */}
      <input type="hidden" name="original_remote_access_url" value={revertedToStart ? draft.startedFrom : originalUrl} />
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-slate-500">IP de acesso direto web</span>
        <input
          type="text"
          name="remote_access_url"
          value={draft?.value ?? originalUrl}
          onChange={(event) => {
            const url = event.currentTarget.value;
            setDraft((current) => url.trim() === normalizedUrl
              ? undefined
              : { value: url, startedFrom: current?.startedFrom ?? normalizedUrl });
          }}
          onBlur={() => { if (revertedToStart) setDraft(undefined); }}
          placeholder="https://177.38.158.46:9999"
          className="mt-1.5 w-full rounded-lg h-11 border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
      </label>
    </>
  );
}
