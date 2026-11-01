'use client';

import type { usePagedNodes } from '@/lib/use-paged-nodes';

export function NodeBrowserControls({ browser, onChange, disabled = false }: {
  browser: ReturnType<typeof usePagedNodes>;
  onChange?: () => void;
  disabled?: boolean;
}) {
  return <div className="space-y-2">
    <label className="block text-sm text-fg">Buscar firewall ou cliente
      <input type="search" maxLength={120} disabled={disabled} value={browser.search} onChange={(event) => {
        onChange?.(); browser.setSearch(event.target.value);
      }} className="mt-1 h-11 w-full rounded-lg border border-border bg-panel-soft px-3" />
    </label>
    <div className="flex flex-wrap items-center gap-3 text-sm" aria-label="Navegar firewalls">
      <span aria-live="polite">{browser.loading ? 'Buscando…' : `${browser.result?.items.length ?? 0} de ${browser.result?.total ?? 0} firewalls`}</span>
      <button type="button" disabled={disabled || browser.loading} onClick={() => { onChange?.(); browser.navigate(null); }}>Início / atualizar</button>
      <button type="button" disabled={disabled || browser.loading || !browser.result?.previous_cursor} onClick={() => { onChange?.(); browser.navigate(browser.result?.previous_cursor ?? null); }}>Anterior</button>
      <button type="button" disabled={disabled || browser.loading || !browser.result?.next_cursor} onClick={() => { onChange?.(); browser.navigate(browser.result?.next_cursor ?? null); }}>Próxima</button>
    </div>
    {browser.error ? <p role="alert" className="text-danger-fg">{browser.error}</p> : null}
  </div>;
}
