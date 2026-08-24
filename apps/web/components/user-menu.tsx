'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { logoutAction } from '@/lib/auth';

export function UserMenu({ userEmail }: { userEmail: string }) {
  const [open, setOpen] = useState(false);
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
        aria-haspopup="menu"
        aria-label="Abrir menu do usuário"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-9 max-w-[13rem] items-center gap-2 rounded-lg border border-border bg-surface-soft px-3 text-xs text-fg transition hover:border-primary/40"
      >
        <span className="truncate">{userEmail}</span>
        <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div role="menu" aria-label="Menu do usuário" className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-border bg-surface-elevated p-2 shadow-surface">
          <p className="truncate px-3 py-2 text-xs text-fg-muted" title={userEmail}>{userEmail}</p>
          <Link role="menuitem" href="/conta" onClick={() => closeMenu()} className="flex rounded-lg px-3 py-2 text-sm text-fg hover:bg-nav-hover">Minha conta</Link>
          <Link role="menuitem" href="/sessions" onClick={() => closeMenu()} className="flex rounded-lg px-3 py-2 text-sm text-fg hover:bg-nav-hover">Sessões</Link>
          <div className="my-2 border-t border-border" />
          <div className="px-3 py-2"><ThemeToggle compact /></div>
          <div className="my-2 border-t border-border" />
          <form action={logoutAction}>
            <button type="submit" role="menuitem" className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-danger-fg hover:bg-danger-muted">Sair</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
