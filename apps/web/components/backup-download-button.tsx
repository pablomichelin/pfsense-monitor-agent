'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';

type Props = {
  href: string;
  receivedAt: string;
  sizeLabel: string;
};

export function BackupDownloadButton({ href, receivedAt, sizeLabel }: Props) {
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    window.location.assign(href);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 transition hover:border-cyan-400/60"
      >
        Baixar
      </button>

      <ConfirmDialog
        open={open}
        title="Baixar config.xml"
        tone="warning"
        confirmLabel="Baixar arquivo"
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
        description={
          <>
            <p>
              O arquivo contem segredos sensiveis do pfSense. Baixe apenas em ambiente
              seguro e registre o acesso conforme politica interna.
            </p>
            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
              <p>
                <span className="text-slate-500">Recebido:</span> {receivedAt}
              </p>
              <p className="mt-1">
                <span className="text-slate-500">Tamanho:</span> {sizeLabel}
              </p>
            </div>
          </>
        }
      />
    </>
  );
}
