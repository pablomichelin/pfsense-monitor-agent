'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { logoutAction } from '@/lib/auth';

export function UserMenu({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false);
  const [logoutError, submitLogout, logoutPending] = useActionState(logoutAction, null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  return (
    <div
      ref={menuRef}
      className="relative"
      onBlur={(event) => {
        window.setTimeout(() => {
          if (!menuRef.current?.contains(document.activeElement)) closeMenu();
        }, 0);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeMenu(true);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="user-account-actions"
        aria-label="Abrir menu do usuário"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-9 max-w-[13rem] items-center gap-2 rounded-lg border border-border bg-surface-soft px-3 text-xs text-fg transition hover:border-primary/40"
      >
        <span className="truncate">{userEmail}</span>
        <span aria-hidden>▾</span>
      </button>
      {open || logoutError ? (
        <div id="user-account-actions" aria-label="Opções do usuário" className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-border bg-surface-elevated p-2 shadow-surface">
          {open ? (
            <>
              <p className="truncate px-3 py-2 text-xs text-fg-muted" title={userEmail}>{userEmail}</p>
              <Link href="/conta" onClick={() => closeMenu()} className="flex rounded-lg px-3 py-2 text-sm text-fg hover:bg-nav-hover">Minha conta</Link>
              <Link href="/sessions" onClick={() => closeMenu()} className="flex rounded-lg px-3 py-2 text-sm text-fg hover:bg-nav-hover">Sessões</Link>
              <div className="my-2 border-t border-border" />
              <div className="px-3 py-2"><ThemeToggle compact /></div>
              <div className="my-2 border-t border-border" />
              <form action={submitLogout}>
                <button
                  type="submit"
                  aria-disabled={logoutPending}
                  onClick={(event) => { if (logoutPending) event.preventDefault(); }}
                  className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-danger-fg hover:bg-danger-muted"
                >
                  {logoutPending ? 'Encerrando sessão…' : 'Sair'}
                </button>
              </form>
            </>
          ) : null}
          {logoutError && <p role="alert" className="px-3 py-2 text-xs text-danger-fg">{logoutError}</p>}
        </div>
      ) : null}
    </div>
  );
}
