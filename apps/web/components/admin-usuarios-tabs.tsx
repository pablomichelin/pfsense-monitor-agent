'use client';

import { useState } from 'react';
import {
  deleteUserAction,
  revokeUserSessionAdminAction,
  updateUserAction,
} from '@/lib/admin';
import { formatRelativeAge } from '@/lib/format';
import { roleLabel } from '@/lib/rbac-labels';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RoleScopeFields } from '@/components/role-scope-fields';

const returnTo = '/admin/usuarios';

type ClientOption = {
  id: string;
  name: string;
  code: string;
};

type RoleOption = {
  code: string;
  label: string;
};

type User = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  status: string;
  client_ids: string[];
  client_id: string | null;
};

type SessionItem = {
  id: string;
  current: boolean;
  revoked_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  ip_address: string | null;
};

export function AdminUsuariosTabs({
  users,
  clients,
  roles,
  currentUserId,
  userSessionsByUserId,
  activeSection,
  status,
  message,
  SectionMessage,
}: {
  users: User[];
  clients: ClientOption[];
  roles: RoleOption[];
  currentUserId?: string;
  userSessionsByUserId: Record<string, SessionItem[]>;
  activeSection?: string;
  status?: string;
  message?: string;
  SectionMessage: React.ComponentType<{
    section: string;
    activeSection?: string;
    status?: string;
    message?: string;
  }>;
}) {
  const [tab, setTab] = useState<'usuarios' | 'sessoes'>('usuarios');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const inputClass =
    'rounded-lg border border-slate-600/80 bg-panel-soft h-9 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500';
  const selectClass =
    'rounded-lg border border-slate-600/80 bg-panel-soft h-9 px-3 py-2 text-sm text-slate-200 outline-none';

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    try {
      const formData = new FormData();
      formData.set('user_id', deleteTarget.id);
      formData.set('returnTo', returnTo);
      await deleteUserAction(formData);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <div className="flex gap-2 border-b border-slate-700/80">
        <button
          type="button"
          onClick={() => setTab('usuarios')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
            tab === 'usuarios'
              ? 'border-cyan-500 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Usuarios
        </button>
        <button
          type="button"
          onClick={() => setTab('sessoes')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
            tab === 'sessoes'
              ? 'border-cyan-500 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Sessoes
        </button>
      </div>

      {tab === 'usuarios' && (
        <div className="space-y-3 pt-4">
          <SectionMessage section="user-edit" activeSection={activeSection} status={status} message={message} />
          <SectionMessage section="user" activeSection={activeSection} status={status} message={message} />
          {users.map((user) => (
            <div
              key={user.id}
              className="space-y-2 rounded-lg border border-slate-700/80 bg-panel-soft/50 p-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded border border-slate-700/80 bg-slate-950/40 px-2 py-1">
                  Perfil: {roleLabel(user.role)}
                </span>
              </div>
              <form action={updateUserAction} className="flex flex-col gap-3">
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="user_id" value={user.id} />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="email"
                    name="email"
                    defaultValue={user.email}
                    className={`${inputClass} min-w-[12rem] flex-1`}
                  />
                  <input
                    type="text"
                    name="display_name"
                    defaultValue={user.display_name ?? ''}
                    placeholder="Nome"
                    className={`${inputClass} w-28`}
                  />
                </div>
                <RoleScopeFields
                  clients={clients}
                  roles={roles}
                  defaultRole={user.role}
                  defaultStatus={user.status}
                  defaultClientId={user.client_id ?? user.client_ids[0] ?? null}
                  defaultClientIds={user.client_ids}
                  inputClass={inputClass}
                  selectClass={selectClass}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    name="password"
                    placeholder="Nova senha"
                    minLength={10}
                    className={`${inputClass} w-32`}
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
                  >
                    Salvar
                  </button>
                </div>
              </form>
              {currentUserId !== user.id && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(user)}
                  className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/20"
                >
                  Excluir usuario
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'sessoes' && (
        <div className="space-y-4 pt-4">
          <SectionMessage section="user-sessions" activeSection={activeSection} status={status} message={message} />
          {users.map((user) => {
            const sessions = userSessionsByUserId[user.id] ?? [];
            if (sessions.length === 0) return null;
            return (
              <div key={user.id} className="rounded-lg border border-slate-700/80 bg-panel-soft/30 p-3">
                <p className="mb-2 font-mono text-xs text-slate-500">{user.email}</p>
                <div className="space-y-2">
                  {sessions.map((sessionItem) => (
                    <div
                      key={sessionItem.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-slate-400">
                        {sessionItem.current && (
                          <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-xs text-cyan-200">
                            Atual
                          </span>
                        )}
                        {sessionItem.revoked_at ? (
                          <span className="text-slate-500">Revogada</span>
                        ) : (
                          <span className="text-emerald-400/90">Ativa</span>
                        )}
                        <span>
                          {formatRelativeAge(sessionItem.last_seen_at ?? sessionItem.created_at)}
                        </span>
                        {sessionItem.ip_address && (
                          <span className="text-slate-500">{sessionItem.ip_address}</span>
                        )}
                      </div>
                      {sessionItem.current || sessionItem.revoked_at ? (
                        <span className="text-xs text-slate-500">
                          {sessionItem.current ? 'Use Sair para encerrar' : 'Encerrada'}
                        </span>
                      ) : (
                        <form action={revokeUserSessionAdminAction}>
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <input type="hidden" name="user_id" value={user.id} />
                          <input type="hidden" name="session_id" value={sessionItem.id} />
                          <button
                            type="submit"
                            className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                          >
                            Revogar
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir usuario"
        confirmLabel="Excluir"
        loading={deleting}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        description={
          deleteTarget ? (
            <>
              <p>Esta acao e irreversivel. O usuario perdera acesso imediatamente.</p>
              <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
                <p>{deleteTarget.email}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Perfil: {roleLabel(deleteTarget.role)}
                </p>
              </div>
            </>
          ) : null
        }
      />
    </>
  );
}
