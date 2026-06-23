import { cookies, headers } from 'next/headers';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type SummaryResponse = {
  generated_at: string;
  version: string;
  totals: {
    nodes: number;
    online: number;
    degraded: number;
    offline: number;
    maintenance: number;
    unknown: number;
    open_alerts: number;
  };
};

export type NodesListResponse = {
  generated_at: string;
  items: Array<{
    id: string;
    node_uid: string;
    hostname: string;
    display_name: string | null;
    client: { id: string; name: string; code: string };
    site: { id: string; name: string; code: string };
    effective_status: 'online' | 'degraded' | 'offline' | 'maintenance' | 'unknown';
    observed_status: string;
    node_uid_status: string;
    maintenance_mode: boolean;
    last_seen_at: string | null;
    pfsense_version: string | null;
    agent_version: string | null;
    management_ip: string | null;
    wan_ip: string | null;
    open_alerts: number;
    backup_status: 'ok' | 'late' | 'failed' | 'never';
    latest_backup_received_at: string | null;
    cpu_percent: number | null;
    memory_percent: number | null;
    disk_percent: number | null;
    uptime_seconds: number | null;
  }>;
};

export type NodesFiltersResponse = {
  generated_at: string;
  inactive_client_count?: number;
  clients: Array<{
    id: string;
    name: string;
    code: string;
    status: string;
    site_count: number;
    node_count: number;
  }>;
  sites: Array<{
    id: string;
    name: string;
    code: string;
    client_id: string;
    client_name: string;
    city: string | null;
    state: string | null;
    timezone: string | null;
    status: string;
    node_count: number;
  }>;
};

export type NodeDetailsResponse = {
  generated_at: string;
  node: {
    id: string;
    node_uid: string;
    node_uid_status: string;
    hostname: string;
    display_name: string | null;
    effective_status: 'online' | 'degraded' | 'offline' | 'maintenance' | 'unknown';
    observed_status: string;
    maintenance_mode: boolean;
    client: { id: string; name: string; code: string };
    site: {
      id: string;
      name: string;
      code: string;
      city: string | null;
      state: string | null;
      timezone: string | null;
    };
    management_ip: string | null;
    wan_ip: string | null;
    network_interfaces: Array<{ name: string; ip: string }> | null;
    pfsense_version: string | null;
    agent_version: string | null;
    ha_role: string | null;
    last_seen_at: string | null;
    last_boot_at: string | null;
    latest_heartbeat: {
      received_at: string;
      sent_at: string;
      heartbeat_id: string;
      latency_ms: number | null;
      uptime_seconds: number | null;
      cpu_percent: number | null;
      memory_percent: number | null;
      disk_percent: number | null;
      schema_version: string;
      customer_code: string;
    } | null;
    services: Array<{
      name: string;
      status: string;
      message: string | null;
      observed_at: string;
    }>;
    gateways: Array<{
      name: string;
      status: string;
      loss_percent: number | null;
      latency_ms: number | null;
      observed_at: string;
    }>;
    recent_alerts: Array<{
      id: string;
      type: string;
      severity: string;
      status: string;
      title: string;
      description: string;
      opened_at: string;
      resolved_at: string | null;
    }>;
  };
};

export type ConfigBackupItem = {
  id: string;
  backup_uid: string;
  status: 'stored' | 'duplicate';
  source: string;
  received_at: string;
  config_sha256: string;
  size_bytes: number;
  compression: string | null;
  agent_version: string | null;
  pfsense_version: string | null;
  command_id: string | null;
};

export type NodeConfigBackupsResponse = {
  items: ConfigBackupItem[];
  summary: {
    total_count: number;
    stored_count: number;
    total_stored_bytes: number;
    latest_received_at: string | null;
    latest_status: 'stored' | 'duplicate' | null;
  };
};

export type ConfigBackupRequestResponse = {
  command_id: string;
  status:
    | 'pending'
    | 'picked_up'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'expired'
    | 'cancelled';
  expires_at: string;
};

export type ConfigBackupCommandStatusResponse = {
  command_id: string;
  node_id: string;
  type: string;
  status:
    | 'pending'
    | 'picked_up'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'expired'
    | 'cancelled';
  requested_at: string;
  picked_up_at: string | null;
  completed_at: string | null;
  expires_at: string;
  result_json: Record<string, unknown> | null;
  error_message: string | null;
};

export type PfsenseUpgradeBackupGate = {
  requires_recent_backup: boolean;
  require_recent_backup_hours: number;
  has_recent_backup: boolean;
  last_backup_at: string | null;
  can_override_no_recent_backup: boolean;
};

export type PfsenseUpgradeStatusResponse = {
  enabled: boolean;
  hostname: string;
  pfsense_version: string | null;
  agent_version: string | null;
  agent_version_supported: boolean;
  min_agent_version: string;
  ha_blocked: boolean;
  ha_role: string | null;
  ha_detected_from_agent: boolean | null;
  update_available: boolean | null;
  target_version: string | null;
  update_checked_at: string | null;
  update_check_error: string | null;
  last_seen_at: string | null;
  maintenance_mode: boolean;
  active_command: {
    command_id: string;
    status:
      | 'pending'
      | 'picked_up'
      | 'running'
      | 'succeeded'
      | 'failed'
      | 'expired'
      | 'cancelled';
    requested_at: string;
    picked_up_at: string | null;
    running_at: string | null;
    expires_at: string;
  } | null;
  last_result: {
    command_id: string;
    status:
      | 'pending'
      | 'picked_up'
      | 'running'
      | 'succeeded'
      | 'failed'
      | 'expired'
      | 'cancelled';
    completed_at: string | null;
    result_json: Record<string, unknown> | null;
    error_message: string | null;
  } | null;
  backup_gate: PfsenseUpgradeBackupGate;
};

export type PfsenseUpgradeRequestResponse = {
  command_id: string;
  status:
    | 'pending'
    | 'picked_up'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'expired'
    | 'cancelled';
  expires_at: string;
  target_version: string | null;
};

export type SessionResponse = {
  authenticated: true;
  session: {
    id: string;
  };
  user: {
    id: string;
    email: string;
    role: string;
  };
  permissions: string[];
};

export type AuthSessionsResponse = {
  items: Array<{
    id: string;
    current: boolean;
    created_at: string;
    last_seen_at: string | null;
    expires_at: string;
    revoked_at: string | null;
    ip_address: string | null;
    user_agent: string | null;
  }>;
};

export type AdminUserSessionsResponse = {
  items: Array<{
    id: string;
    user_id: string;
    current: boolean;
    created_at: string;
    last_seen_at: string | null;
    expires_at: string;
    revoked_at: string | null;
    ip_address: string | null;
    user_agent: string | null;
  }>;
};

export type UsersListResponse = {
  items: Array<{
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    status: string;
    client_ids: string[];
    client_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
};

export type CreateUserResponse = {
  user: {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    status: string;
    created_at: string;
  };
};

export type UpdateUserResponse = {
  user: {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    status: string;
    updated_at: string;
  };
};

export type CreateClientResponse = {
  client: {
    id: string;
    name: string;
    code: string;
    status: string;
    created_at: string;
  };
};

export type CreateSiteResponse = {
  site: {
    id: string;
    client_id: string;
    name: string;
    code: string;
    status: string;
    created_at: string;
  };
};

export type UpdateClientResponse = {
  client: {
    id: string;
    name: string;
    code: string;
    status: string;
    updated_at: string;
  };
};

export type UpdateSiteResponse = {
  site: {
    id: string;
    client_id: string;
    name: string;
    code: string;
    city: string | null;
    state: string | null;
    timezone: string | null;
    status: string;
    updated_at: string;
  };
};

export type CreateNodeResponse = {
  node: {
    id: string;
    site_id: string;
    node_uid: string;
    hostname: string;
    display_name: string | null;
    status: string;
    node_uid_status: string;
    created_at: string;
  };
  bootstrap: {
    node_secret: string;
    secret_hint: string;
  };
};

export type RotateNodeSecretResponse = {
  node_id: string;
  bootstrap: {
    node_secret: string;
    secret_hint: string;
    rotated_at: string;
  };
};

export type SetNodeMaintenanceResponse = {
  node_id: string;
  maintenance_mode: boolean;
  updated_at: string;
};

export type UpdateNodeResponse = {
  node: {
    id: string;
    hostname: string;
    display_name: string | null;
    management_ip: string | null;
    wan_ip: string | null;
    pfsense_version: string | null;
    agent_version: string | null;
    ha_role: string | null;
    updated_at: string;
  };
};

export type AgentTokensResponse = {
  items: Array<{
    id: string;
    node_id: string;
    token_hint: string;
    status: string;
    expires_at: string | null;
    last_used_at: string | null;
    created_at: string;
    revoked_at: string | null;
  }>;
};

export type CreateAgentTokenResponse = {
  node_id: string;
  token: {
    id: string;
    agent_token: string;
    token_hint: string;
    status: string;
    expires_at: string | null;
    created_at: string;
  };
};

export type NodeBootstrapCommandResponse = {
  node: {
    id: string;
    node_uid: string;
    hostname: string;
    display_name: string | null;
    client_code: string;
    site_code: string;
  };
  heartbeat_mode: 'normal' | 'light';
  release: {
    version: string;
    release_base_url: string | null;
    controller_url: string;
    artifact_name: string;
    artifact_url: string | null;
    checksum_url: string | null;
    installer_url: string | null;
    ready: boolean;
  };
  command: string | null;
  package_command: string | null;
  uninstall_command: string | null;
  bootstrap: {
    node_secret: string;
    secret_hint: string;
  };
  verification: {
    post_install_steps: string[];
    command_block: string;
  };
};

export type AlertsListResponse = {
  generated_at: string;
  totals: {
    open: number;
    acknowledged: number;
    resolved: number;
    critical: number;
    warning: number;
    info: number;
  };
  items: Array<{
    id: string;
    type: string;
    severity: string;
    status: string;
    title: string;
    description: string;
    opened_at: string;
    acknowledged_at: string | null;
    acknowledged_by: string | null;
    resolved_at: string | null;
    resolution_note: string | null;
    metadata_json: unknown;
    node: {
      id: string;
      node_uid: string;
      hostname: string;
      display_name: string | null;
      management_ip: string | null;
      pfsense_version: string | null;
    };
    client: {
      id: string;
      name: string;
      code: string;
    };
    site: {
      id: string;
      name: string;
      code: string;
    };
  }>;
};

export type AuditLogsResponse = {
  generated_at: string;
  items: Array<{
    id: string;
    actor_type: string;
    actor_id: string | null;
    actor_role: string | null;
    actor_email: string | null;
    action: string;
    target_type: string;
    target_id: string | null;
    target_display_name: string | null;
    client_id: string | null;
    result: string;
    ip_address: string | null;
    metadata_json: unknown;
    created_at: string;
  }>;
};

type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  csrfProtected?: boolean;
};

const apiBaseUrl = process.env.MONITOR_API_BASE_URL?.trim();
const csrfCookieName =
  process.env.MONITOR_AUTH_CSRF_COOKIE_NAME?.trim() || 'monitor_pfsense_csrf';

const requireEnv = (value: string | undefined, key: string): string => {
  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
};

const parseCookies = (cookieHeader: string | null): Record<string, string> => {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, entry) => {
    const [name, ...rest] = entry.trim().split('=');
    if (!name || rest.length === 0) {
      return acc;
    }

    acc[name] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
};

async function getRequestCookieHeader(): Promise<string | null> {
  const requestHeaders = await headers();
  return requestHeaders.get('cookie');
}

async function apiFetch<T>(path: string, options?: ApiFetchOptions): Promise<T> {
  const cookieHeader = await getRequestCookieHeader();
  const method = options?.method ?? 'GET';
  const hasBody =
    options?.body !== undefined &&
    options?.body !== null &&
    method !== 'DELETE';
  const bodyPayload = hasBody
    ? JSON.stringify(options.body)
    : method === 'POST'
      ? '{}'
      : undefined;

  const requestHeaders: Record<string, string> = {};
  if (cookieHeader) {
    requestHeaders.Cookie = cookieHeader;
  }
  if (bodyPayload !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  if (options?.csrfProtected) {
    const cookieStore = await cookies();
    const csrfToken = cookieStore.get(csrfCookieName)?.value;
    if (csrfToken) {
      requestHeaders['X-CSRF-Token'] = csrfToken;
    }
  }

  const timeoutMs = 28000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(
      `${requireEnv(apiBaseUrl, 'MONITOR_API_BASE_URL')}${path}`,
      {
        method,
        headers: requestHeaders,
        body: bodyPayload,
        cache: 'no-store',
        signal: controller.signal,
      },
    );
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(
        `A requisição demorou mais de ${timeoutMs / 1000}s e foi cancelada. O servidor pode estar lento.`,
        408,
      );
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let message = `API request failed with status ${response.status}`;

    try {
      const payload = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(payload.message)) {
        message = payload.message.join(', ');
      } else if (payload.message) {
        message = payload.message;
      }
    } catch {
      // keep default message
    }

    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export async function getDashboardSummary(): Promise<SummaryResponse> {
  return apiFetch<SummaryResponse>('/api/v1/dashboard/summary');
}

export async function getNodesList(query?: {
  client_id?: string;
  site_id?: string;
  status?: string;
  search?: string;
  sort_by?: 'name' | 'agent_version' | 'version';
  sort_order?: 'asc' | 'desc';
  limit?: number;
}): Promise<NodesListResponse> {
  const params = new URLSearchParams();
  if (query?.client_id) {
    params.set('client_id', query.client_id);
  }
  if (query?.site_id) {
    params.set('site_id', query.site_id);
  }
  if (query?.status) {
    params.set('status', query.status);
  }
  if (query?.search) {
    params.set('search', query.search);
  }
  if (query?.sort_by) {
    params.set('sort_by', query.sort_by);
  }
  if (query?.sort_order) {
    params.set('sort_order', query.sort_order);
  }
  if (query?.limit != null) {
    params.set('limit', String(query.limit));
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<NodesListResponse>(`/api/v1/nodes${suffix}`);
}

export async function getNodesFilters(): Promise<NodesFiltersResponse> {
  return apiFetch<NodesFiltersResponse>('/api/v1/nodes/filters');
}

export async function getNodeDetails(id: string): Promise<NodeDetailsResponse> {
  return apiFetch<NodeDetailsResponse>(`/api/v1/nodes/${id}`);
}

export async function getNodeConfigBackups(
  nodeId: string,
): Promise<NodeConfigBackupsResponse> {
  return apiFetch<NodeConfigBackupsResponse>(
    `/api/v1/nodes/${nodeId}/config-backups`,
  );
}

export async function requestNodeConfigBackup(
  nodeId: string,
): Promise<ConfigBackupRequestResponse> {
  return apiFetch<ConfigBackupRequestResponse>(
    `/api/v1/nodes/${nodeId}/config-backups/request`,
    {
      method: 'POST',
      csrfProtected: true,
    },
  );
}

export async function getNodeConfigBackupCommandStatus(
  nodeId: string,
  commandId: string,
): Promise<ConfigBackupCommandStatusResponse> {
  return apiFetch<ConfigBackupCommandStatusResponse>(
    `/api/v1/nodes/${nodeId}/config-backups/requests/${commandId}`,
  );
}

export async function getPfsenseUpgradeStatus(
  nodeId: string,
): Promise<PfsenseUpgradeStatusResponse> {
  return apiFetch<PfsenseUpgradeStatusResponse>(
    `/api/v1/nodes/${nodeId}/pfsense-upgrade/status`,
  );
}

export async function requestPfsenseUpgrade(
  nodeId: string,
  body: {
    enable_maintenance_mode?: boolean;
    acknowledge_no_recent_backup?: boolean;
  },
): Promise<PfsenseUpgradeRequestResponse> {
  return apiFetch<PfsenseUpgradeRequestResponse>(
    `/api/v1/nodes/${nodeId}/pfsense-upgrade/request`,
    {
      method: 'POST',
      csrfProtected: true,
      body: JSON.stringify(body),
    },
  );
}

function buildBootstrapCommandPath(
  id: string,
  releaseBaseUrl?: string,
  controllerUrl?: string,
  heartbeatMode?: 'normal' | 'light',
  configBackupEnabled?: 'yes' | 'no',
): string {
  const params = new URLSearchParams();
  if (releaseBaseUrl?.trim()) {
    params.set('release_base_url', releaseBaseUrl.trim());
  }
  if (controllerUrl?.trim()) {
    params.set('controller_url', controllerUrl.trim());
  }
  if (heartbeatMode) {
    params.set('heartbeat_mode', heartbeatMode);
  }
  if (configBackupEnabled) {
    params.set('config_backup_enabled', configBackupEnabled);
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return `/api/v1/admin/nodes/${id}/bootstrap-command${suffix}`;
}

export async function getNodeBootstrapCommand(
  id: string,
  releaseBaseUrl?: string,
  controllerUrl?: string,
  heartbeatMode?: 'normal' | 'light',
  configBackupEnabled?: 'yes' | 'no',
): Promise<NodeBootstrapCommandResponse> {
  return apiFetch<NodeBootstrapCommandResponse>(
    buildBootstrapCommandPath(
      id,
      releaseBaseUrl,
      controllerUrl,
      heartbeatMode,
      configBackupEnabled,
    ),
  );
}

/** Retorna null em 403 (perfil sem acesso admin); propaga demais erros. */
export async function getNodeBootstrapCommandIfAllowed(
  id: string,
  releaseBaseUrl?: string,
  controllerUrl?: string,
  heartbeatMode?: 'normal' | 'light',
  configBackupEnabled?: 'yes' | 'no',
): Promise<NodeBootstrapCommandResponse | null> {
  try {
    return await getNodeBootstrapCommand(
      id,
      releaseBaseUrl,
      controllerUrl,
      heartbeatMode,
      configBackupEnabled,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return null;
    }

    throw error;
  }
}

export async function getAlertsList(query?: {
  client_id?: string;
  site_id?: string;
  node_id?: string;
  status?: string;
  severity?: string;
  type?: string;
  search?: string;
}): Promise<AlertsListResponse> {
  const params = new URLSearchParams();
  if (query?.client_id) {
    params.set('client_id', query.client_id);
  }
  if (query?.site_id) {
    params.set('site_id', query.site_id);
  }
  if (query?.node_id) {
    params.set('node_id', query.node_id);
  }
  if (query?.status) {
    params.set('status', query.status);
  }
  if (query?.severity) {
    params.set('severity', query.severity);
  }
  if (query?.type) {
    params.set('type', query.type);
  }
  if (query?.search) {
    params.set('search', query.search);
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<AlertsListResponse>(`/api/v1/alerts${suffix}`);
}

export async function getAuditLogs(query?: {
  action?: string;
  target_type?: string;
  target_id?: string;
  result?: string;
  from?: string;
  to?: string;
  actor_email?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogsResponse> {
  const params = new URLSearchParams();
  if (query?.action) {
    params.set('action', query.action);
  }
  if (query?.target_type) {
    params.set('target_type', query.target_type);
  }
  if (query?.target_id) {
    params.set('target_id', query.target_id);
  }
  if (query?.result) {
    params.set('result', query.result);
  }
  if (query?.from) {
    params.set('from', query.from);
  }
  if (query?.to) {
    params.set('to', query.to);
  }
  if (query?.actor_email) {
    params.set('actor_email', query.actor_email);
  }
  if (query?.limit) {
    params.set('limit', String(query.limit));
  }
  if (query?.offset) {
    params.set('offset', String(query.offset));
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<AuditLogsResponse>(`/api/v1/admin/audit${suffix}`);
}

export async function acknowledgeAlert(id: string): Promise<{
  alert_id: string;
  status: string;
  acknowledged_at: string;
  acknowledged_by: string;
}> {
  return apiFetch(`/api/v1/alerts/${id}/acknowledge`, {
    method: 'POST',
    csrfProtected: true,
  });
}

export async function resolveAlert(
  id: string,
  resolution_note?: string,
): Promise<{
  alert_id: string;
  status: string;
  resolved_at: string;
  resolution_note: string | null;
}> {
  return apiFetch(`/api/v1/alerts/${id}/resolve`, {
    method: 'POST',
    body: {
      resolution_note,
    },
    csrfProtected: true,
  });
}

export async function createClient(input: {
  name: string;
  code?: string;
  status?: 'active' | 'inactive';
}): Promise<CreateClientResponse> {
  return apiFetch<CreateClientResponse>('/api/v1/admin/clients', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function getUsersList(params?: {
  status?: 'active' | 'inactive';
}): Promise<UsersListResponse> {
  const search = params?.status ? `?status=${params.status}` : '';
  return apiFetch<UsersListResponse>(`/api/v1/admin/users${search}`);
}

export async function deleteUser(id: string): Promise<{ ok: true; user_id: string }> {
  return apiFetch(`/api/v1/admin/users/${id}`, {
    method: 'DELETE',
    csrfProtected: true,
  });
}

export async function createUser(input: {
  email: string;
  display_name?: string;
  password: string;
  role?: 'superadmin' | 'admin' | 'operator' | 'readonly' | 'client';
  status?: 'active' | 'inactive';
  client_id?: string;
  client_ids?: string[];
}): Promise<CreateUserResponse> {
  return apiFetch<CreateUserResponse>('/api/v1/admin/users', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function updateUser(
  id: string,
  input: {
    email?: string;
    display_name?: string;
    password?: string;
    role?: 'superadmin' | 'admin' | 'operator' | 'readonly' | 'client';
    status?: 'active' | 'inactive';
    client_id?: string;
    client_ids?: string[];
  },
): Promise<UpdateUserResponse> {
  return apiFetch<UpdateUserResponse>(`/api/v1/admin/users/${id}`, {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function getAdminUserSessions(id: string): Promise<AdminUserSessionsResponse> {
  return apiFetch<AdminUserSessionsResponse>(`/api/v1/admin/users/${id}/sessions`);
}

export async function setUserClientScopes(
  userId: string,
  clientIds: string[],
): Promise<{ user_id: string; client_ids: string[] }> {
  return apiFetch(`/api/v1/admin/users/${userId}/client-scopes`, {
    method: 'POST',
    body: { client_ids: clientIds },
    csrfProtected: true,
  });
}

export async function revokeAdminUserSession(
  userId: string,
  sessionId: string,
): Promise<{
  ok: true;
  session_id: string;
  revoked_at: string;
}> {
  return apiFetch(`/api/v1/admin/users/${userId}/sessions/${sessionId}/revoke`, {
    method: 'POST',
    csrfProtected: true,
  });
}

export async function updateClient(
  id: string,
  input: {
    name?: string;
    code?: string;
    status?: 'active' | 'inactive';
  },
): Promise<UpdateClientResponse> {
  return apiFetch<UpdateClientResponse>(`/api/v1/admin/clients/${id}`, {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function deleteClient(id: string): Promise<{ ok: true; client_id: string }> {
  return apiFetch(`/api/v1/admin/clients/${id}`, {
    method: 'DELETE',
    csrfProtected: true,
  });
}

export async function createSite(input: {
  client_id: string;
  name: string;
  code?: string;
  city?: string;
  state?: string;
  timezone?: string;
  status?: 'active' | 'inactive';
}): Promise<CreateSiteResponse> {
  return apiFetch<CreateSiteResponse>('/api/v1/admin/sites', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function updateSite(
  id: string,
  input: {
    name?: string;
    code?: string;
    city?: string;
    state?: string;
    timezone?: string;
    status?: 'active' | 'inactive';
  },
): Promise<UpdateSiteResponse> {
  return apiFetch<UpdateSiteResponse>(`/api/v1/admin/sites/${id}`, {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function createNode(input: {
  site_id?: string;
  client_id?: string;
  node_uid?: string;
  hostname: string;
  display_name?: string;
  management_ip?: string;
  wan_ip?: string;
  pfsense_version?: string;
  agent_version?: string;
  ha_role?: string;
  maintenance_mode?: boolean;
}): Promise<CreateNodeResponse> {
  return apiFetch<CreateNodeResponse>('/api/v1/admin/nodes', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function rotateNodeSecret(id: string): Promise<RotateNodeSecretResponse> {
  return apiFetch<RotateNodeSecretResponse>(`/api/v1/admin/nodes/${id}/rekey`, {
    method: 'POST',
    csrfProtected: true,
  });
}

export async function getAgentTokens(nodeId: string): Promise<AgentTokensResponse> {
  return apiFetch<AgentTokensResponse>(`/api/v1/admin/nodes/${nodeId}/agent-tokens`);
}

export async function createAgentToken(
  nodeId: string,
  input: { expires_at?: string },
): Promise<CreateAgentTokenResponse> {
  return apiFetch<CreateAgentTokenResponse>(`/api/v1/admin/nodes/${nodeId}/agent-tokens`, {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function revokeAgentToken(
  nodeId: string,
  tokenId: string,
): Promise<{
  ok: true;
  node_id: string;
  token_id: string;
  revoked_at: string;
}> {
  return apiFetch(`/api/v1/admin/nodes/${nodeId}/agent-tokens/${tokenId}/revoke`, {
    method: 'POST',
    csrfProtected: true,
  });
}

export async function setNodeMaintenance(
  id: string,
  maintenance_mode: boolean,
): Promise<SetNodeMaintenanceResponse> {
  return apiFetch<SetNodeMaintenanceResponse>(`/api/v1/admin/nodes/${id}/maintenance`, {
    method: 'POST',
    body: {
      maintenance_mode,
    },
    csrfProtected: true,
  });
}

export async function deleteNode(id: string): Promise<{
  ok: true;
  node_id: string;
  node_uid: string;
  deleted_at: string;
}> {
  return apiFetch(`/api/v1/admin/nodes/${id}`, {
    method: 'DELETE',
    csrfProtected: true,
  });
}

export async function deleteNodesBatch(ids: string[]): Promise<{
  ok: true;
  deleted_count: number;
  deleted_ids: string[];
  deleted_at: string;
}> {
  return apiFetch('/api/v1/admin/nodes/delete-batch', {
    method: 'POST',
    body: { ids },
    csrfProtected: true,
  });
}

export async function updateNode(
  id: string,
  input: {
    hostname?: string;
    display_name?: string;
    management_ip?: string;
    wan_ip?: string;
    pfsense_version?: string;
    agent_version?: string;
    ha_role?: string;
  },
): Promise<UpdateNodeResponse> {
  return apiFetch<UpdateNodeResponse>(`/api/v1/admin/nodes/${id}`, {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export type RoleSummary = {
  code: string;
  label: string;
  is_system: boolean;
};

export type PermissionsMatrixResponse = {
  generated_at: string;
  roles: RoleSummary[];
  permissions: Array<{
    id: string;
    description: string | null;
  }>;
  role_permissions: Record<string, string[]>;
};

export async function getPermissionsMatrix(): Promise<PermissionsMatrixResponse> {
  return apiFetch<PermissionsMatrixResponse>('/api/v1/admin/permissions-matrix');
}

export async function getRolesList(): Promise<{ items: Array<RoleSummary & { status: string }> }> {
  return apiFetch('/api/v1/admin/roles');
}

export async function createRole(input: {
  code: string;
  label: string;
}): Promise<{ role: RoleSummary }> {
  return apiFetch('/api/v1/admin/roles', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function deleteRole(code: string): Promise<{ deleted: true; code: string }> {
  return apiFetch(`/api/v1/admin/roles/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    csrfProtected: true,
  });
}

export async function setRolePermissions(
  code: string,
  permissionIds: string[],
): Promise<{ role: string; permission_ids: string[] }> {
  return apiFetch(`/api/v1/admin/roles/${encodeURIComponent(code)}/permissions`, {
    method: 'POST',
    body: { permission_ids: permissionIds },
    csrfProtected: true,
  });
}

export async function getSession(): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/v1/auth/me');
}

export async function getOptionalSession(): Promise<SessionResponse | null> {
  try {
    return await getSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function getAuthSessions(): Promise<AuthSessionsResponse> {
  return apiFetch<AuthSessionsResponse>('/api/v1/auth/sessions');
}

export async function revokeAuthSession(id: string): Promise<{
  ok: true;
  session_id: string;
  revoked_at: string;
}> {
  return apiFetch(`/api/v1/auth/sessions/${id}/revoke`, {
    method: 'POST',
    csrfProtected: true,
  });
}

export async function getCurrentCsrfToken(): Promise<string | null> {
  const cookieHeader = await getRequestCookieHeader();
  return parseCookies(cookieHeader)[csrfCookieName] ?? null;
}
