'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useScopedRead(key: string, snapshot?: unknown) {
  const current = useRef<{ key: string; active: symbol | null } | null>(null);

  useEffect(() => {
    current.current = { key, active: null };
    return () => { current.current = null; };
  }, [key, snapshot]);

  return useCallback(async function readScoped<T>(
    load: () => Promise<T>,
    onSuccess: (value: T) => void,
    onError: (error: unknown) => void,
    replace = false,
  ) {
    const scope = current.current;
    if (scope?.key !== key || (scope.active && !replace)) return;

    const token = Symbol();
    scope.active = token;
    const isCurrent = () => current.current === scope && scope.active === token;
    try {
      const result = await load();
      if (isCurrent()) {
        onSuccess(result);
        return result;
      }
    } catch (error) {
      if (isCurrent()) onError(error);
    } finally {
      if (isCurrent()) scope.active = null;
    }
  }, [key]);
}
