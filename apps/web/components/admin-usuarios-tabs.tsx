'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAdminDraftGuard } from '@/components/admin-clients-list';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { getURLFromRedirectError } from 'next/dist/client/components/redirect';
import {
  deleteUserAction,
  revokeUserSessionAdminAction,
  updateUserAction,
} from '@/lib/admin';
import { formatRelativeAge } from '@/lib/format';
import { roleLabel } from '@/lib/rbac-labels';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RoleScopeFields } from '@/components/role-scope-fields';
import { getAdminUserSessionsAction } from '@/lib/admin-user-sessions-actions';
import { formInputClassName, formSelectClassName } from '@/lib/form-field-styles';

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
  mfa_enabled?: boolean;
  mfa_enforcement_required?: boolean;
  mfa_recovery_codes_remaining?: number;
};

type SessionItem = {
  id: string;
  current: boolean;
  revoked_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
};

export function AdminUsuariosTabs({
  users,
  clients,
  roles,
  currentUserId,
  canManageUsers = false,
  canDeleteUsers = canManageUsers,
  showInactive = false,
  initialUserId,
  initialTab,
  search = '',
  cursor,
  nextCursor,
  total = users.length,
  sessionRevision,
  activeSection,
  status,
  message,
  SectionMessage,
}: {
  users: User[];
  clients: ClientOption[];
  roles: RoleOption[];
  currentUserId?: string;
  canManageUsers?: boolean;
  canDeleteUsers?: boolean;
  showInactive?: boolean;
  initialUserId?: string;
  initialTab?: string;
  search?: string;
  cursor?: string;
  nextCursor?: string | null;
  total?: number;
  sessionRevision?: string;
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
  const router = useRouter();
  const urlTab = initialTab === 'sessoes' || (!initialTab && activeSection === 'user-sessions') ? 'sessoes' : 'usuarios';
  const [tab, setTab] = useState<'usuarios' | 'sessoes'>(urlTab);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId ?? null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const draftGuard = useAdminDraftGuard(hasUnsavedChanges);
  const [scopeChanged, setScopeChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [sessionsCursor, setSessionsCursor] = useState<string | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const sessionGeneration = useRef(0);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsRetry, setSessionsRetry] = useState(0);
  const [scopeValidationError, setScopeValidationError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const filteredUsers = users;
  const returnQuery = new URLSearchParams();
  if (showInactive) returnQuery.set('showInactive', '1');
  if (selectedUserId) returnQuery.set('selected', selectedUserId);
  if (search) returnQuery.set('search', search);
  if (cursor) returnQuery.set('cursor', cursor);
  returnQuery.set('tab', tab);
  const returnTo = `/admin/usuarios${returnQuery.size ? `?${returnQuery}` : ''}`;

  const navigationHref = (userId: string | null, nextTab = tab) => {
    const query = new URLSearchParams(returnQuery);
    if (userId) query.set('selected', userId); else query.delete('selected');
    query.set('tab', nextTab);
    return `/admin/usuarios?${query}`;
  };
  useEffect(() => {
    const nextId = initialUserId ?? null;
    if (nextId === selectedUserId && urlTab === tab) return;
    if (draftGuard.current && !window.confirm('Descartar alterações não salvas deste usuário?')) {
      router.replace(navigationHref(selectedUserId), { scroll: false });
      return;
    }
    draftGuard.current = false;
    setSelectedUserId(nextId); setTab(urlTab);
    setHasUnsavedChanges(false); setScopeChanged(false);
    setScopeValidationError(null); setSessions([]); setSessionsCursor(null);
    setSessionsError(null);
    setSessionsLoading(urlTab === 'sessoes' && Boolean(nextId));
  // Somente mudanças externas da URL; as seleções locais a atualizam explicitamente.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUserId, urlTab]);

  useEffect(() => {
    const generation = ++sessionGeneration.current;
    setMoreLoading(false);
    if (tab !== 'sessoes' || !selectedUserId) return;
    let cancelled = false;
    setSessionsLoading(true);
    setSessions([]); setSessionsCursor(null);
    setSessionsError(null);
    getAdminUserSessionsAction(selectedUserId, { limit: 50 }).then((result) => {
      if (cancelled || generation !== sessionGeneration.current) return;
      if (result.ok) { setSessions(result.items); setSessionsCursor(result.next_cursor); }
      else { setSessions([]); setSessionsError(result.error); }
    }).catch(() => {
      if (!cancelled) { setSessions([]); setSessionsError('Falha ao buscar sessões.'); }
    }).finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; sessionGeneration.current++; };
  }, [selectedUserId, tab, sessionsRetry, sessionRevision]);

  const loadMoreSessions = async () => {
    if (!selectedUserId || !sessionsCursor || moreLoading) return;
    const generation = sessionGeneration.current;
    setMoreLoading(true); setSessionsError(null);
    try {
      const result = await getAdminUserSessionsAction(selectedUserId, { cursor: sessionsCursor, limit: 50 });
      if (generation !== sessionGeneration.current) return;
      if (result.ok) {
        setSessions((current) => Array.from(new Map([...current, ...result.items].map((item) => [item.id, item])).values()));
        setSessionsCursor(result.next_cursor);
      } else setSessionsError(result.error);
    } catch { if (generation === sessionGeneration.current) setSessionsError('Falha ao carregar mais sessões. Tente novamente.'); }
    finally { if (generation === sessionGeneration.current) setMoreLoading(false); }
  };
  const allowLeaveDraft = () => {
    if (saving || (draftGuard.current && !window.confirm('Descartar alterações não salvas deste usuário?'))) return false;
    draftGuard.current = false;
    return true;
  };
  const switchUser = (userId: string) => {
    if (userId === selectedUserId || !allowLeaveDraft()) return;
    setSelectedUserId(userId || null);
    setScopeChanged(false);
    router.push(navigationHref(userId || null), { scroll: false });
    setHasUnsavedChanges(false);
    setScopeValidationError(null);
    // Não exibir sessões da pessoa anterior enquanto a nova consulta carrega.
    setSessions([]);
    setSessionsError(null);
    setSessionsLoading(tab === 'sessoes' && Boolean(userId));
  };
  const switchTab = (next: 'usuarios' | 'sessoes') => {
    if (next === tab || !allowLeaveDraft()) return;
    setTab(next);
    setScopeChanged(false);
    router.push(navigationHref(selectedUserId, next), { scroll: false });
    setHasUnsavedChanges(false);
    setScopeValidationError(null);
    if (next === 'sessoes') {
      setSessions([]);
      setSessionsError(null);
      setSessionsLoading(Boolean(selectedUserId));
    }
  };

  const inputClass = formInputClassName;
  const selectClass = formSelectClassName;

  const validateUserForm = (event: React.FormEvent<HTMLFormElement>) => {
    const data = new FormData(event.currentTarget);
    const role = data.get('role');
    const submittedIds = data.getAll('client_ids').map(String).sort();
    const originalIds = [...(selectedUser?.client_ids ?? [])].sort();
    const sameScope = role === selectedUser?.role && (role === 'client'
      ? String(data.get('client_id') ?? '') === (selectedUser?.client_id ?? selectedUser?.client_ids[0] ?? '')
      : JSON.stringify(submittedIds) === JSON.stringify(originalIds));
    if ((!scopeChanged && role === selectedUser?.role) || sameScope) { setScopeValidationError(null); return; }
    const allowedIds = new Set(clients.map((client) => client.id));
    const ids = data.getAll('client_ids').map(String);
    if (role !== 'superadmin' && role !== 'client' && ids.some((id) => !allowedIds.has(id))) {
      event.preventDefault();
      setScopeValidationError('Existem vínculos com clientes inativos ou indisponíveis. Remova-os explicitamente antes de salvar.');
      return;
    }
    if (role === 'client' && !allowedIds.has(String(data.get('client_id') ?? ''))) {
      event.preventDefault();
      setScopeValidationError('Selecione um cliente ativo para este perfil antes de salvar.');
      return;
    }
    setScopeValidationError(null);
  };

  const saveUser = async (data: FormData) => {
    setSaving(true);
    try {
      await updateUserAction(data);
    } catch (cause) {
      if (isRedirectError(cause)) {
        const target = getURLFromRedirectError(cause);
        if (target && new URL(target, 'https://local.invalid').searchParams.get('status') === 'ok') {
          draftGuard.current = false; setHasUnsavedChanges(false); setScopeChanged(false);
          setFormRevision((value) => value + 1);
        }
        throw cause;
      }
      setScopeValidationError(cause instanceof Error ? cause.message : 'Falha ao salvar. O rascunho foi mantido.');
    } finally { setSaving(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!canDeleteUsers || !deleteTarget) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      const formData = new FormData();
      formData.set('user_id', deleteTarget.id);
      formData.set('returnTo', returnTo);
      await deleteUserAction(formData);
    } catch (error) {
      if (isRedirectError(error)) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Falha ao excluir usuario';
      setDeleteError(message);
      setDeleting(false);
      return;
    }
  };

  const openDeleteDialog = (user: User) => {
    if (!allowLeaveDraft()) return;
    if (hasUnsavedChanges) { setHasUnsavedChanges(false); setScopeChanged(false); setFormRevision((value) => value + 1); }
    setDeleteError(null);
    setDeleteTarget(user);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
        <Link
          href={`/admin/usuarios?${new URLSearchParams({ tab, ...(showInactive ? {} : { showInactive: '1' }), ...(search ? { search } : {}) })}`}
          onClick={(event) => { if (!allowLeaveDraft()) event.preventDefault(); }}
          className="text-primary hover:underline"
        >
          {showInactive ? 'Ver apenas ativos' : 'Ver inativos'}
        </Link>
      </div>
      <div className="flex gap-2 border-b border-border" aria-label="Seções de usuários">
        <button
          type="button"
          onClick={() => switchTab('usuarios')}
          aria-pressed={tab === 'usuarios'}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
            tab === 'usuarios'
              ? 'border-cyan-500 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Usuários
        </button>
        <button
          type="button"
          onClick={() => switchTab('sessoes')}
          aria-pressed={tab === 'sessoes'}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
            tab === 'sessoes'
              ? 'border-cyan-500 text-cyan-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Sessões
        </button>
      </div>

      <nav aria-label="Paginação de usuários" className="flex items-center gap-4 pt-3 text-sm">
        {cursor ? <Link href={`/admin/usuarios?${new URLSearchParams([...returnQuery].filter(([key]) => key !== 'cursor'))}`} className="text-primary">Início</Link> : null}
        {nextCursor ? <Link href={`/admin/usuarios?${new URLSearchParams([...returnQuery].filter(([key]) => key !== 'cursor').concat([['cursor', nextCursor]]))}`} className="text-primary">Próxima página</Link> : null}
        <span>{total} usuários no filtro</span>
      </nav>

      {tab === 'usuarios' && (
        <div className="space-y-3 pt-4">
          <SectionMessage section="user-edit" activeSection={activeSection} status={status} message={message} />
          <SectionMessage section="user" activeSection={activeSection} status={status} message={message} />
          <div className="grid gap-4 lg:grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)]">
            <div className="space-y-3">
              <form action="/admin/usuarios" onSubmit={(event) => { if (!allowLeaveDraft()) event.preventDefault(); }} className="space-y-2">
                <input type="hidden" name="tab" value={tab} />
                {showInactive ? <input type="hidden" name="showInactive" value="1" /> : null}
                {selectedUserId ? <input type="hidden" name="selected" value={selectedUserId} /> : null}
                <label className="block text-sm text-fg-muted">Buscar usuário
                  <input key={search} name="search" type="search" defaultValue={search} maxLength={200} placeholder="Nome ou email" className={`${inputClass} mt-1 w-full`} />
                </label>
                <button type="submit" className="text-sm text-primary">Buscar</button>
              </form>
              <div className="max-h-[38rem] space-y-2 overflow-y-auto" aria-label="Usuários encontrados">
                {filteredUsers.map((user) => (
                  <button key={user.id} type="button" onClick={() => switchUser(user.id)}
                    aria-pressed={selectedUserId === user.id}
                    className={`block w-full rounded-lg border px-3 py-3 text-left transition ${selectedUserId === user.id
                      ? 'border-primary bg-primary/10 text-fg' : 'border-border bg-surface-soft text-fg-muted hover:border-primary/40 hover:text-fg'}`}>
                    <span className="block truncate text-sm font-medium">{user.display_name || user.email}</span>
                    <span className="block truncate text-xs">{user.email}</span>
                    <span className="mt-1 block text-xs">{roleLabel(user.role)} · {user.status === 'active' ? 'Ativo' : 'Inativo'}</span>
                  </button>
                ))}
                {filteredUsers.length === 0 ? <p className="p-3 text-sm text-fg-muted">Nenhum usuário encontrado.</p> : null}
              </div>
              <p className="text-xs text-fg-muted">{users.length} nesta página · {total} usuários no filtro</p>
            </div>
            <div>
              {!selectedUser ? <p className="rounded-lg border border-border bg-surface-soft p-5 text-sm text-fg-muted">{selectedUserId ? 'O usuário selecionado não está nesta página ou filtro. Escolha um usuário da lista para editar.' : 'Selecione um usuário na lista para consultar ou editar seus dados.'}</p> : null}
          {selectedUser ? [selectedUser].map((user) => (
            <div
              key={`${user.id}:${formRevision}`}
              className="space-y-3 rounded-lg border border-border bg-surface-soft/50 p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded border border-slate-700/80 bg-slate-950/40 px-2 py-1">
                  Perfil: {roleLabel(user.role)}
                </span>
                {user.mfa_enabled ? (
                  <span className="rounded border border-emerald-800/60 bg-emerald-950/30 px-2 py-1 text-emerald-200">
                    MFA ativo
                    {(user.mfa_recovery_codes_remaining ?? 0) > 0
                      ? ` · ${user.mfa_recovery_codes_remaining} recovery`
                      : ' · sem recovery'}
                  </span>
                ) : user.mfa_enforcement_required ? (
                  <span className="rounded border border-amber-800/60 bg-amber-950/30 px-2 py-1 text-amber-200">
                    MFA exigido · pendente
                  </span>
                ) : (
                  <span className="rounded border border-slate-700/80 bg-slate-950/40 px-2 py-1">
                    MFA desligado
                  </span>
                )}
              </div>
              {canManageUsers ? <form action={saveUser} onSubmit={validateUserForm} onChangeCapture={() => { setHasUnsavedChanges(true); setScopeValidationError(null); }} className="flex flex-col gap-3">
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="user_id" value={user.id} />
                {(['email', 'display_name', 'role', 'status'] as const).map((field) => <input key={field} type="hidden" name={`original_${field}`} value={user[field] ?? ''} />)}
                <input type="hidden" name="original_client_id" value={user.client_id ?? ''} />
                <input type="hidden" name="original_client_ids" value={JSON.stringify(user.client_ids)} />
                <input type="hidden" name="scope_changed" value={scopeChanged ? '1' : '0'} />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="email"
                    aria-label={`Email de ${user.email}`}
                    name="email"
                    defaultValue={user.email}
                    className={`${inputClass} min-w-[12rem] flex-1`}
                  />
                  <input
                    type="text"
                    aria-label={`Nome de ${user.email}`}
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
                  onScopeChange={() => { setHasUnsavedChanges(true); setScopeChanged(true); }}
                />
                {scopeValidationError ? <p role="alert" className="text-sm text-danger-fg">{scopeValidationError}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="password"
                    aria-label={`Nova senha de ${user.email}`}
                    name="password"
                    placeholder="Nova senha"
                    minLength={10}
                    className={`${inputClass} w-32`}
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
                  >
                    {saving ? 'Salvando…' : 'Salvar'}
                  </button>
                  {hasUnsavedChanges ? <button type="button" disabled={saving} onClick={() => {
                    setHasUnsavedChanges(false); setScopeChanged(false); setScopeValidationError(null);
                    draftGuard.current = false; setFormRevision((value) => value + 1);
                  }} className="text-sm text-fg-muted underline">Cancelar alterações</button> : null}
                </div>
              </form> : <p className="text-sm text-fg">{user.display_name || user.email} · {user.email} · {user.status} — Somente leitura</p>}
      {canDeleteUsers && currentUserId !== user.id && (
                <button
                  type="button"
                  onClick={() => openDeleteDialog(user)}
                  className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/20"
                >
                  Excluir usuário
                </button>
              )}
            </div>
          )) : null}
            </div>
          </div>
        </div>
      )}

      {tab === 'sessoes' && (
        <div className="space-y-4 pt-4">
          <SectionMessage section="user-sessions" activeSection={activeSection} status={status} message={message} />
          <label className="block max-w-lg text-sm text-fg-muted">
            Usuário para consultar sessões
            <select value={selectedUserId ?? ''} onChange={(event) => switchUser(event.target.value)}
              className={`${selectClass} mt-1 w-full`}>
              <option value="">Selecione um usuário</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.display_name || user.email} ({user.email})</option>)}
            </select>
          </label>
          {sessionsLoading ? <p role="status" className="text-sm text-fg-muted">Consultando sessões…</p> : null}
          {sessionsError ? <div role="alert" className="text-sm text-danger-fg">{sessionsError} <button type="button" onClick={() => sessionsCursor ? void loadMoreSessions() : setSessionsRetry((value) => value + 1)} className="underline">Tentar novamente</button></div> : null}
          {!selectedUser ? <p className="text-sm text-fg-muted">Selecione um usuário para carregar suas sessões.</p> : null}
          {selectedUser && !sessionsLoading && !sessionsError && sessions.length === 0 ? <p className="text-sm text-fg-muted">Nenhuma sessão registrada para este usuário.</p> : null}
          {selectedUser && !sessionsLoading && sessions.length > 0 ? (
              <div key={selectedUser.id} className="rounded-lg border border-border bg-surface-soft p-3">
                <p className="mb-2 text-xs text-fg-muted">{selectedUser.email}</p>
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
                        {sessionItem.revoked_at ? <span className="text-fg-muted">Revogada</span>
                          : new Date(sessionItem.expires_at).getTime() <= Date.now()
                            ? <span className="text-warning-fg">Expirada</span>
                            : !sessionItem.current ? <span className="text-success-fg">Ativa</span> : null}
                        <span>
                          {formatRelativeAge(sessionItem.last_seen_at ?? sessionItem.created_at)}
                        </span>
                        {sessionItem.ip_address && (
                          <span className="text-slate-500">{sessionItem.ip_address}</span>
                        )}
                        {sessionItem.user_agent ? <span className="max-w-[18rem] truncate text-xs text-fg-muted" title={sessionItem.user_agent}>{sessionItem.user_agent}</span> : null}
                      </div>
                      {sessionItem.current || sessionItem.revoked_at || new Date(sessionItem.expires_at).getTime() <= Date.now() ? (
                        <span className="text-xs text-slate-500">
                          {sessionItem.current ? 'Use Sair para encerrar' : 'Encerrada'}
                        </span>
                      ) : !canManageUsers ? <span className="text-xs text-fg-muted">Somente leitura</span> : (
                        <form action={revokeUserSessionAdminAction}>
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <input type="hidden" name="user_id" value={selectedUser.id} />
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
          ) : null}
        </div>
      )}

      {tab === 'sessoes' && sessionsCursor ? <button type="button" disabled={moreLoading || sessionsLoading} onClick={() => void loadMoreSessions()} className="mt-3 rounded border border-border px-3 py-2 text-sm">
        {moreLoading ? 'Carregando…' : 'Carregar mais sessões'}
      </button> : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir usuário"
        confirmLabel="Excluir"
        loading={deleting}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        description={
          deleteTarget ? (
            <>
              <p>Esta ação é irreversível. O usuário perderá acesso imediatamente.</p>
              <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
                <p>{deleteTarget.email}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Perfil: {roleLabel(deleteTarget.role)}
                </p>
              </div>
              {deleteError ? (
                <p className="mt-3 text-sm text-rose-300">{deleteError}</p>
              ) : null}
            </>
          ) : null
        }
      />
    </>
  );
}
