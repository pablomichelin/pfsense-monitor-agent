'use client';

import { useEffect, useRef, useState } from 'react';
import type { NodesListResponse } from './api';
import { searchNodeOptions } from './node-options-action';

export function usePagedNodes(initialPage?: NodesListResponse, clientId?: string) {
  const [result, setResult] = useState<NodesListResponse | undefined>(initialPage);
  const [search, setSearchValue] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(!initialPage);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const firstEffect = useRef(true);

  useEffect(() => {
    if (firstEffect.current) {
      firstEffect.current = false;
      if (initialPage && !clientId) return;
    }
    const current = ++generation.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      let response: Awaited<ReturnType<typeof searchNodeOptions>>;
      try {
        response = await searchNodeOptions({ search: search.trim() || undefined, cursor, client_id: clientId });
      } catch {
        response = { ok: false, error: 'Não foi possível buscar firewalls. Tente novamente.' };
      }
      if (generation.current !== current) return;
      if (response.ok) { setResult(response.result); setError(null); }
      else { setResult(undefined); setError(response.error); }
      setLoading(false);
    }, 250);
    return () => { clearTimeout(timer); generation.current++; };
  }, [search, cursor, clientId, retry]);

  const invalidate = () => { generation.current++; setLoading(true); setError(null); };
  return {
    result, search, loading, error,
    setSearch(value: string) { invalidate(); setSearchValue(value); setCursor(undefined); },
    navigate(value: string | null) { invalidate(); setCursor(value ?? undefined); setRetry((v) => v + 1); },
  };
}
