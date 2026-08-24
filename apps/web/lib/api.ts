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

export type FleetResponse = SummaryResponse & {
  filters: {
    client_id: string | null;
    site_id: string | null;
    status:
      | 'online'
      | 'degraded'
      | 'offline'
      | 'maintenance'
      | 'unknown'
      | null;
  };
  totals: SummaryResponse['totals'] & {
    critical_alerts: number;
  };
  compliance: {
    backup_ok_count: number;
    backup_ok_percent: number | null;
    package_outdated_count: number;
    package_outdated_percent: number | null;
    package_target_version: string | null;
  };
  version_matrix: {
    pfsense: Array<{ version: string; count: number }>;
    package: Array<{
      version: string;
      count: number;
      alignment?: 'missing' | 'match' | 'outdated' | 'newer' | 'unknown';
    }>;
  };
};

export type PackageReleaseResponse = {
  generated_at: string;
  version: string;
  sha256: string;
  repo_raw_base: string;
  artifact_url: string;
  installer_url: string;
};

export type NodeCriticality = 'critical' | 'standard' | 'lab';

export type FleetTagRef = {
  id: string;
  name: string;
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
    remote_access_url: string | null;
    open_alerts: number;
    backup_status: 'ok' | 'late' | 'failed' | 'never';
    latest_backup_received_at: string | null;
    cpu_percent: number | null;
    memory_percent: number | null;
    disk_percent: number | null;
    uptime_seconds: number | null;
    criticality: NodeCriticality;
    tags: FleetTagRef[];
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
  tags: Array<{
    id: string;
    name: string;
    client_id: string;
    client_name: string;
    node_count: number;
  }>;
  groups: Array<{
    id: string;
    name: string;
    client_id: string;
    client_name: string;
    member_count: number;
  }>;
  criticality_options: NodeCriticality[];
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
    criticality: NodeCriticality;
    tags: FleetTagRef[];
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
    remote_access_url: string | null;
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
    certificates: Array<{
      cert_key: string;
      subject: string;
      issuer: string | null;
      usage: string | null;
      not_before: string;
      not_after: string;
      days_until_expiry: number;
      observed_at: string;
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
  visual_status: 'ok' | 'late' | 'failed' | 'never';
  retention_policy?: {
    count: number;
    max_bytes: number;
    source: 'global' | 'node';
  };
  drift?: {
    enabled: boolean;
    active: boolean;
    state: {
      active: boolean;
      detected_at?: string;
      baseline_sha256?: string;
      baseline_backup_id?: string;
      current_sha256?: string;
      changed_sections?: string[];
      sensitive_changed_sections?: string[];
    } | null;
  };
  advanced_features?: {
    diff_enabled: boolean;
    drift_enabled: boolean;
  };
};

export type ConfigBackupDiffSection = {
  name: string;
  status: 'unchanged' | 'added' | 'removed' | 'modified';
  masked: boolean;
  summary?: string;
  changes?: string[];
};

export type ConfigBackupDiffResponse = {
  from: {
    id: string;
    backup_uid: string;
    received_at: string;
    config_sha256: string;
  };
  to: {
    id: string;
    backup_uid: string;
    received_at: string;
    config_sha256: string;
  };
  diff: {
    identical: boolean;
    from_sha256: string;
    to_sha256: string;
    sections: ConfigBackupDiffSection[];
    secrets_masked: boolean;
    unknown_sections_masked: number;
  };
};

export type BackupRetentionPolicyResponse = {
  effective: {
    count: number;
    max_bytes: number;
    source: 'global' | 'node';
  };
  global_defaults: {
    count: number;
    max_bytes: number;
  };
  overrides: {
    retention_count: number | null;
    retention_max_bytes: number | null;
  };
};

export type BackupExportGuideResponse = {
  backup: {
    id: string;
    backup_uid: string;
    received_at: string;
    config_sha256: string;
    size_bytes: number;
    pfsense_version: string | null;
  };
  restore_automatic_enabled: false;
  steps: string[];
  warnings: string[];
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
  update_error_class: string | null;
  update_log_snippet: string | null;
  refresh_check_supported: boolean;
  refresh_check_min_agent_version: string;
  repair_supported: boolean;
  repair_min_agent_version: string;
  force_check_pending: boolean;
  force_check_requested_at: string | null;
  repair_pending: boolean;
  repair_requested_at: string | null;
  firmware_branch: string | null;
  firmware_branch_descr: string | null;
  update_branches: string[];
  allowed_branch_targets: Array<'latest' | '2.8.1' | '2.9.0'>;
  set_branch_supported: boolean;
  set_branch_min_agent_version: string;
  set_branch_pending: boolean;
  set_branch_requested_at: string | null;
  set_branch_target: string | null;
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

export type PfsenseUpgradeRefreshCheckResponse = {
  ok: true;
  pending: boolean;
  requested_at: string;
  target_branch?: string;
};

export type PfsenseUpdateBranchTarget = 'latest' | '2.8.1' | '2.9.0';

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

export type PackageUpgradeStatusResponse = {
  enabled: boolean;
  hostname: string;
  agent_version: string | null;
  agent_version_supported: boolean;
  min_agent_version: string;
  published_version: string;
  published_sha256: string;
  published_artifact_url: string;
  update_available: boolean;
  last_seen_at: string | null;
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
    payload_json: Record<string, unknown> | null;
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
};

export type PackageUpgradeRequestResponse = {
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
  target_version: string;
  artifact_url: string;
  sha256: string;
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
  has_global_client_scope?: boolean;
  mfa_enrollment_required?: boolean;
  mfa_enforcement_blocking?: boolean;
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
    mfa_enabled: boolean;
    mfa_enrolled_at: string | null;
    mfa_enforcement_required: boolean;
    mfa_recovery_codes_remaining: number;
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
    remote_access_url: string | null;
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
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
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
    options?.body !== null;
  const bodyPayload = hasBody
    ? typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body)
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

export async function getDashboardFleet(query?: {
  client_id?: string;
  site_id?: string;
  status?: string;
}): Promise<FleetResponse> {
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

  const suffix = params.toString();
  return apiFetch<FleetResponse>(
    suffix ? `/api/v1/dashboard/fleet?${suffix}` : '/api/v1/dashboard/fleet',
  );
}

export async function getPackageRelease(): Promise<PackageReleaseResponse> {
  return apiFetch<PackageReleaseResponse>('/api/v1/agent/package-release');
}

export async function getNodesList(query?: {
  client_id?: string;
  site_id?: string;
  status?: string;
  tag_id?: string;
  group_id?: string;
  criticality?: NodeCriticality;
  search?: string;
  sort_by?:
    | 'name'
    | 'agent_version'
    | 'version'
    | 'status'
    | 'backup'
    | 'alerts'
    | 'last_seen';
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
  if (query?.tag_id) {
    params.set('tag_id', query.tag_id);
  }
  if (query?.group_id) {
    params.set('group_id', query.group_id);
  }
  if (query?.criticality) {
    params.set('criticality', query.criticality);
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

export async function getNodeMetricsHistory(
  nodeId: string,
  period: '24h' | '7d' | '30d' = '24h',
): Promise<import('./metrics-history').NodeMetricsHistoryResponse> {
  const params = new URLSearchParams({ period });
  return apiFetch(`/api/v1/nodes/${nodeId}/metrics/history?${params.toString()}`);
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

export async function compareNodeConfigBackups(
  nodeId: string,
  fromBackupId: string,
  toBackupId: string,
): Promise<ConfigBackupDiffResponse> {
  const params = new URLSearchParams({
    from: fromBackupId,
    to: toBackupId,
  });
  return apiFetch<ConfigBackupDiffResponse>(
    `/api/v1/nodes/${nodeId}/config-backups/diff?${params.toString()}`,
  );
}

export async function getNodeBackupRetentionPolicy(
  nodeId: string,
): Promise<BackupRetentionPolicyResponse> {
  return apiFetch<BackupRetentionPolicyResponse>(
    `/api/v1/nodes/${nodeId}/config-backups/retention-policy`,
  );
}

export async function updateNodeBackupRetentionPolicy(
  nodeId: string,
  body: {
    retention_count?: number | null;
    retention_max_bytes?: number | null;
  },
): Promise<{
  ok: boolean;
  effective: BackupRetentionPolicyResponse['effective'];
  deleted_backup_uids: string[];
}> {
  return apiFetch(
    `/api/v1/nodes/${nodeId}/config-backups/retention-policy`,
    {
      method: 'PATCH',
      csrfProtected: true,
      body: JSON.stringify(body),
    },
  );
}

export async function acknowledgeNodeBackupDrift(
  nodeId: string,
): Promise<{ ok: boolean; cleared: boolean }> {
  return apiFetch(`/api/v1/nodes/${nodeId}/config-backups/drift/acknowledge`, {
    method: 'POST',
    csrfProtected: true,
  });
}

export async function getNodeBackupExportGuide(
  nodeId: string,
  backupId: string,
): Promise<BackupExportGuideResponse> {
  return apiFetch<BackupExportGuideResponse>(
    `/api/v1/nodes/${nodeId}/config-backups/${backupId}/export-guide`,
  );
}

export async function getPfsenseUpgradeStatus(
  nodeId: string,
): Promise<PfsenseUpgradeStatusResponse> {
  return apiFetch<PfsenseUpgradeStatusResponse>(
    `/api/v1/nodes/${nodeId}/pfsense-upgrade/status`,
  );
}

export async function requestPfsenseUpdateRefreshCheck(
  nodeId: string,
): Promise<PfsenseUpgradeRefreshCheckResponse> {
  return apiFetch<PfsenseUpgradeRefreshCheckResponse>(
    `/api/v1/nodes/${nodeId}/pfsense-upgrade/refresh-check`,
    {
      method: 'POST',
      csrfProtected: true,
    },
  );
}

export async function requestPfsenseRepoRepair(
  nodeId: string,
): Promise<PfsenseUpgradeRefreshCheckResponse> {
  return apiFetch<PfsenseUpgradeRefreshCheckResponse>(
    `/api/v1/nodes/${nodeId}/pfsense-upgrade/repair-repo`,
    {
      method: 'POST',
      csrfProtected: true,
    },
  );
}

export async function requestPfsenseSetBranch(
  nodeId: string,
  targetBranch: PfsenseUpdateBranchTarget,
): Promise<PfsenseUpgradeRefreshCheckResponse> {
  return apiFetch<PfsenseUpgradeRefreshCheckResponse>(
    `/api/v1/nodes/${nodeId}/pfsense-upgrade/set-branch`,
    {
      method: 'POST',
      csrfProtected: true,
      body: { target_branch: targetBranch },
    },
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

export async function getPackageUpgradeStatus(
  nodeId: string,
): Promise<PackageUpgradeStatusResponse> {
  return apiFetch<PackageUpgradeStatusResponse>(
    `/api/v1/nodes/${nodeId}/package-upgrade/status`,
  );
}

export async function requestPackageUpgrade(
  nodeId: string,
  body?: {
    target_version?: string;
    artifact_url?: string;
    sha256?: string;
  },
): Promise<PackageUpgradeRequestResponse> {
  return apiFetch<PackageUpgradeRequestResponse>(
    `/api/v1/nodes/${nodeId}/package-upgrade/request`,
    {
      method: 'POST',
      csrfProtected: true,
      body: JSON.stringify(body ?? {}),
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
  remote_access_url?: string;
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
    remote_access_url?: string;
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

export async function testNotificationChannel(channelId: string): Promise<{
  channel_id: string;
  ok: boolean;
  error: string | null;
}> {
  return apiFetch(`/api/v1/notifications/channels/${channelId}/test`, {
    method: 'POST',
    csrfProtected: true,
  });
}

export type NotificationChannelType = 'email' | 'webhook' | 'telegram';

export type NotificationsStatusResponse = {
  generated_at: string;
  enabled: boolean;
  max_attempts: number;
};

export type NotificationChannelItem = {
  id: string;
  name: string;
  type: NotificationChannelType;
  status: 'active' | 'inactive';
  config_public: Record<string, unknown>;
  has_secrets: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationRuleItem = {
  id: string;
  name: string;
  enabled: boolean;
  severity: string | null;
  alert_type: string | null;
  client_id: string | null;
  client_name: string | null;
  channel_id: string;
  channel_name: string;
  channel_type: NotificationChannelType;
  created_at: string;
  updated_at: string;
};

export type NotificationDeliveryItem = {
  id: string;
  alert_id: string;
  alert_title: string;
  channel_id: string;
  channel_name: string;
  channel_type: NotificationChannelType;
  status: string;
  attempt_count: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
};

export async function getNotificationsStatus(): Promise<NotificationsStatusResponse> {
  return apiFetch('/api/v1/notifications/status');
}

export async function listNotificationChannels(): Promise<{
  generated_at: string;
  items: NotificationChannelItem[];
}> {
  return apiFetch('/api/v1/notifications/channels');
}

export async function listNotificationRules(): Promise<{
  generated_at: string;
  items: NotificationRuleItem[];
}> {
  return apiFetch('/api/v1/notifications/rules');
}

export async function listNotificationDeliveries(alertId?: string): Promise<{
  generated_at: string;
  items: NotificationDeliveryItem[];
}> {
  const query = alertId ? `?alert_id=${encodeURIComponent(alertId)}` : '';
  return apiFetch(`/api/v1/notifications/deliveries${query}`);
}

export async function createNotificationChannel(input: {
  name: string;
  type: NotificationChannelType;
  status?: 'active' | 'inactive';
  config_public: Record<string, unknown>;
  secrets?: Record<string, unknown>;
}): Promise<NotificationChannelItem> {
  return apiFetch('/api/v1/notifications/channels', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function updateNotificationChannel(
  channelId: string,
  input: {
    name?: string;
    status?: 'active' | 'inactive';
    config_public?: Record<string, unknown>;
    secrets?: Record<string, unknown>;
  },
): Promise<NotificationChannelItem> {
  return apiFetch(`/api/v1/notifications/channels/${channelId}`, {
    method: 'PATCH',
    body: input,
    csrfProtected: true,
  });
}

export async function deleteNotificationChannel(channelId: string): Promise<{
  deleted: boolean;
  channel_id: string;
}> {
  return apiFetch(`/api/v1/notifications/channels/${channelId}`, {
    method: 'DELETE',
    csrfProtected: true,
  });
}

export async function createNotificationRule(input: {
  name: string;
  enabled?: boolean;
  severity?: string;
  alert_type?: string;
  client_id?: string;
  channel_id: string;
}): Promise<NotificationRuleItem> {
  return apiFetch('/api/v1/notifications/rules', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function updateNotificationRule(
  ruleId: string,
  input: {
    name?: string;
    enabled?: boolean;
    severity?: string | null;
    alert_type?: string | null;
    client_id?: string | null;
    channel_id?: string;
  },
): Promise<NotificationRuleItem> {
  return apiFetch(`/api/v1/notifications/rules/${ruleId}`, {
    method: 'PATCH',
    body: input,
    csrfProtected: true,
  });
}

export async function deleteNotificationRule(ruleId: string): Promise<{
  deleted: boolean;
  rule_id: string;
}> {
  return apiFetch(`/api/v1/notifications/rules/${ruleId}`, {
    method: 'DELETE',
    csrfProtected: true,
  });
}

export type FleetTagItem = {
  id: string;
  client_id: string;
  client_name: string;
  name: string;
  node_count: number;
  created_at: string;
  updated_at: string;
};

export type FleetGroupItem = {
  id: string;
  client_id: string;
  client_name: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
};

export type FleetGroupDetailsResponse = {
  group: FleetGroupItem;
  members: Array<{
    node_id: string;
    hostname: string;
    display_name: string | null;
  }>;
  generated_at: string;
};

export async function listFleetTags(query?: {
  client_id?: string;
}): Promise<{ items: FleetTagItem[]; generated_at: string }> {
  const params = new URLSearchParams();
  if (query?.client_id) {
    params.set('client_id', query.client_id);
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiFetch(`/api/v1/tags${suffix}`);
}

export async function createFleetTag(input: {
  client_id: string;
  name: string;
}): Promise<{ tag: FleetTagItem }> {
  return apiFetch('/api/v1/tags', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function updateFleetTag(
  tagId: string,
  input: { name?: string },
): Promise<{ tag: FleetTagItem }> {
  return apiFetch(`/api/v1/tags/${tagId}`, {
    method: 'PATCH',
    body: input,
    csrfProtected: true,
  });
}

export async function deleteFleetTag(tagId: string): Promise<{ deleted: true; id: string }> {
  return apiFetch(`/api/v1/tags/${tagId}`, {
    method: 'DELETE',
    csrfProtected: true,
  });
}

export async function listFleetGroups(query?: {
  client_id?: string;
}): Promise<{ items: FleetGroupItem[]; generated_at: string }> {
  const params = new URLSearchParams();
  if (query?.client_id) {
    params.set('client_id', query.client_id);
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiFetch(`/api/v1/groups${suffix}`);
}

export async function getFleetGroup(groupId: string): Promise<FleetGroupDetailsResponse> {
  return apiFetch(`/api/v1/groups/${groupId}`);
}

export async function createFleetGroup(input: {
  client_id: string;
  name: string;
  description?: string;
}): Promise<{ group: FleetGroupItem }> {
  return apiFetch('/api/v1/groups', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function updateFleetGroup(
  groupId: string,
  input: { name?: string; description?: string },
): Promise<{ group: FleetGroupItem }> {
  return apiFetch(`/api/v1/groups/${groupId}`, {
    method: 'PATCH',
    body: input,
    csrfProtected: true,
  });
}

export async function deleteFleetGroup(groupId: string): Promise<{ deleted: true; id: string }> {
  return apiFetch(`/api/v1/groups/${groupId}`, {
    method: 'DELETE',
    csrfProtected: true,
  });
}

export async function setFleetGroupMembers(
  groupId: string,
  nodeIds: string[],
): Promise<{ group: FleetGroupItem; member_count: number }> {
  return apiFetch(`/api/v1/groups/${groupId}/members`, {
    method: 'PUT',
    body: { node_ids: nodeIds },
    csrfProtected: true,
  });
}

export async function updateNodeFleetMetadata(
  nodeId: string,
  input: {
    criticality?: NodeCriticality;
    tag_ids?: string[];
  },
): Promise<{
  node_id: string;
  criticality: NodeCriticality;
  tags: FleetTagRef[];
  updated_at: string;
}> {
  return apiFetch(`/api/v1/nodes/${nodeId}/fleet-metadata`, {
    method: 'PATCH',
    body: input,
    csrfProtected: true,
  });
}

export type NodeCommandHistoryItem = {
  command_id: string;
  node_id: string;
  type: 'config_backup_now' | 'pfsense_upgrade' | 'package_upgrade' | 'service_restart' | 'node_reboot';
  status: string;
  requested_at: string;
  picked_up_at: string | null;
  running_at: string | null;
  completed_at: string | null;
  expires_at: string;
  cancelled_at: string | null;
  retry_count: number;
  max_retries: number;
  batch_id: string | null;
  error_message: string | null;
  result_json: unknown;
  payload_json: unknown;
  progress: {
    phase: 'queued' | 'pending' | 'picked_up' | 'running' | 'terminal';
    is_active: boolean;
    is_terminal: boolean;
  };
};

export type NodeCommandHistoryResponse = {
  generated_at: string;
  node_id: string;
  items: NodeCommandHistoryItem[];
};

export async function getNodeCommandHistory(
  nodeId: string,
  limit = 25,
): Promise<NodeCommandHistoryResponse> {
  return apiFetch<NodeCommandHistoryResponse>(
    `/api/v1/nodes/${nodeId}/commands/history?limit=${limit}`,
  );
}

export async function cancelNodeCommand(
  nodeId: string,
  commandId: string,
): Promise<{ ok: true; command_id: string; status: string }> {
  return apiFetch(`/api/v1/nodes/${nodeId}/commands/${commandId}/cancel`, {
    method: 'POST',
    csrfProtected: true,
  });
}

export type OperationalActionsStatusResponse = {
  enabled: boolean;
  service_restart_enabled: boolean;
  node_reboot_enabled: boolean;
  min_agent_version: string;
  agent_version: string | null;
  agent_version_supported: boolean;
  hostname: string;
  maintenance_mode: boolean;
  ha_role: string | null;
  ha_detected_from_agent: boolean;
  last_seen_at: string | null;
  allowed_services: string[];
  reboot_default_delay_seconds: number;
  active_service_restart: {
    command_id: string;
    status: string;
    payload_json: unknown;
  } | null;
  active_reboot: {
    command_id: string;
    status: string;
    payload_json: unknown;
  } | null;
};

export async function getOperationalActionsStatus(
  nodeId: string,
): Promise<OperationalActionsStatusResponse> {
  return apiFetch(`/api/v1/nodes/${nodeId}/operational-actions/status`);
}

export async function requestServiceRestart(
  nodeId: string,
  input: { service: string },
): Promise<{
  command_id: string;
  status: string;
  expires_at: string;
  service: string;
}> {
  return apiFetch(`/api/v1/nodes/${nodeId}/operational-actions/service-restart`, {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function requestNodeReboot(
  nodeId: string,
  input: {
    confirm_hostname: string;
    delay_seconds?: number;
    enable_maintenance_mode?: boolean;
    acknowledge_ha_risk?: boolean;
  },
): Promise<{
  command_id: string;
  status: string;
  expires_at: string;
  delay_seconds: number;
  maintenance_mode_enabled: boolean;
}> {
  return apiFetch(`/api/v1/nodes/${nodeId}/operational-actions/reboot`, {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export type CommandBatchResponse = {
  generated_at: string;
  batch: {
    batch_id: string;
    command_type: string;
    status: string;
    label: string | null;
    requested_at?: string;
    completed_at?: string | null;
    total_count: number;
    succeeded_count?: number;
    failed_count?: number;
    cancelled_count?: number;
    expired_count?: number;
  };
  nodes: Array<{
    node_id: string;
    command_id: string;
    status: string;
    error_message: string | null;
    progress?: {
      phase: string;
      is_active: boolean;
      is_terminal: boolean;
    };
  }>;
};

export async function createBackupBatch(input: {
  node_ids: string[];
  label?: string;
  client_id?: string;
}): Promise<CommandBatchResponse> {
  return apiFetch('/api/v1/operational-actions/backup-batch', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export type PackageUpgradeBatchResultItem = {
  node_id: string;
  hostname: string | null;
  outcome: 'skipped' | 'enqueued' | 'backup_queued' | 'failed';
  reason: string | null;
  command_id: string | null;
  status: string | null;
};

export type PackageUpgradeBatchResponse = {
  generated_at: string;
  published_version: string;
  batch: CommandBatchResponse['batch'] | null;
  results: PackageUpgradeBatchResultItem[];
  summary: {
    total: number;
    enqueued: number;
    skipped: number;
    failed: number;
  };
};

export async function createPackageUpgradeBatch(input: {
  node_ids: string[];
  label?: string;
  client_id?: string;
}): Promise<PackageUpgradeBatchResponse> {
  return apiFetch('/api/v1/package-upgrade/batch', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function getCommandBatchStatus(
  batchId: string,
): Promise<CommandBatchResponse> {
  return apiFetch(`/api/v1/command-batches/${batchId}`);
}

export type NodeCapabilitiesResponse = {
  capability: {
    pfrest_enabled: boolean | null;
    pfrest_version: string | null;
    api_base_url: string | null;
    access_mode: string;
    auth_method: string | null;
    modules: string[];
    last_reported_at: string | null;
    last_probe_at: string | null;
    last_success_at: string | null;
    last_error: string | null;
    observed_at: string;
  } | null;
  credential: {
    id: string;
    auth_method: string;
    secret_hint: string;
    scope_description: string | null;
    last_tested_at: string | null;
    last_test_result: string | null;
    rotated_at: string | null;
  } | null;
};

export type PfsenseApiStatusResponse = {
  enabled: boolean;
  alias_read_enabled: boolean;
  alias_apply_enabled: boolean;
  require_recent_backup_hours: number;
};

export type PfsenseAliasCompareResponse = {
  summary: {
    total: number;
    match: number;
    different: number;
    only_api: number;
    only_backup: number;
  };
  backup_received_at: string | null;
  items: Array<{
    name: string;
    status: 'match' | 'different' | 'only_api' | 'only_backup';
    api?: { type: string; address: string; description: string | null };
    backup?: { type: string; address: string; description: string | null };
  }>;
};

export async function getNodeCapabilities(
  nodeId: string,
): Promise<NodeCapabilitiesResponse> {
  return apiFetch(`/api/v1/nodes/${nodeId}/capabilities`);
}

export async function upsertPfrestCredential(
  nodeId: string,
  input: {
    auth_method: 'api_key' | 'bearer_token';
    secret: string;
    api_base_url?: string;
    scope_description?: string;
  },
): Promise<{ id: string; auth_method: string; secret_hint: string }> {
  return apiFetch(`/api/v1/nodes/${nodeId}/capabilities/credentials/pfrest`, {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function testPfrestCredential(
  nodeId: string,
): Promise<{ ok: boolean; message: string; latency_ms: number; version?: string | null }> {
  return apiFetch(`/api/v1/nodes/${nodeId}/capabilities/credentials/pfrest/test`, {
    method: 'POST',
    csrfProtected: true,
  });
}

export async function revokePfrestCredential(
  nodeId: string,
): Promise<{ revoked: boolean }> {
  return apiFetch(`/api/v1/nodes/${nodeId}/capabilities/credentials/pfrest`, {
    method: 'DELETE',
    csrfProtected: true,
  });
}

export async function getPfsenseApiStatus(
  nodeId: string,
): Promise<PfsenseApiStatusResponse> {
  return apiFetch(`/api/v1/nodes/${nodeId}/pfsense-api/status`);
}

export async function comparePfsenseAliases(
  nodeId: string,
): Promise<PfsenseAliasCompareResponse> {
  return apiFetch(`/api/v1/nodes/${nodeId}/pfsense-api/aliases/compare-backup`);
}

export type {
  MfaPolicyResponse,
  MfaPolicyMode,
  MfaPolicyRoleStatus,
  MfaPolicyComplianceUser,
} from '@/lib/mfa-policy';

export async function getMfaPolicy(): Promise<import('@/lib/mfa-policy').MfaPolicyResponse> {
  return apiFetch('/api/v1/security/mfa-policy');
}

export async function updateMfaPolicy(input: {
  enforced_roles?: string[];
  enforcement_blocking?: boolean;
}): Promise<import('@/lib/mfa-policy').MfaPolicyResponse> {
  return apiFetch('/api/v1/security/mfa-policy', {
    method: 'PATCH',
    body: input,
    csrfProtected: true,
  });
}

export type TechnicianListItem = {
  id: string;
  full_name: string;
  login_username: string;
  status: string;
  notes: string | null;
  node_account_count: number;
  created_at: string;
  revoked_at: string | null;
};

export type TechniciansListResponse = {
  generated_at: string;
  items: TechnicianListItem[];
};

export type TechnicianBatchRevokeResultItem = {
  node_id: string;
  hostname: string | null;
  outcome: 'skipped' | 'enqueued' | 'backup_queued' | 'failed';
  reason: string | null;
  command_id: string | null;
  status: string | null;
};

export type TechnicianBatchRevokeResponse = {
  generated_at: string;
  batch: CommandBatchResponse['batch'] | null;
  technician: {
    id: string;
    login_username: string;
    full_name: string;
  };
  action: 'disable' | 'delete';
  results: TechnicianBatchRevokeResultItem[];
  summary: {
    total: number;
    enqueued: number;
    skipped: number;
    failed: number;
  };
};

export type TechnicianFleetRevokeResponse = TechnicianBatchRevokeResponse & {
  batches?: Array<NonNullable<TechnicianBatchRevokeResponse['batch']>>;
  summary: TechnicianBatchRevokeResponse['summary'] & {
    total_scanned?: number;
    eligible?: number;
    batch_count?: number;
  };
};

export async function getTechnicians(
  status?: 'active' | 'revoked',
): Promise<TechniciansListResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch(`/api/v1/technicians${query}`);
}

export type TechnicianNodeAccountDetail = {
  id: string;
  node_id: string;
  hostname: string;
  display_name: string | null;
  pfsense_username: string;
  privilege_profile: string;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
};

export type TechnicianDetailResponse = {
  generated_at: string;
  technician: {
    id: string;
    full_name: string;
    login_username: string;
    status: string;
    notes: string | null;
    created_at: string;
    revoked_at: string | null;
    node_accounts: TechnicianNodeAccountDetail[];
  };
};

export async function getTechnician(id: string): Promise<TechnicianDetailResponse> {
  return apiFetch(`/api/v1/technicians/${encodeURIComponent(id)}`);
}

export type NodeTechnicianAccountItem = {
  id: string;
  technician_id: string;
  technician_full_name: string;
  technician_login_username: string;
  technician_status: string;
  pfsense_username: string;
  privilege_profile: string;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
};

export type NodeTechnicianAccountsResponse = {
  generated_at: string;
  node_id: string;
  hostname: string;
  items: NodeTechnicianAccountItem[];
};

export async function getNodeTechnicianAccounts(
  nodeId: string,
): Promise<NodeTechnicianAccountsResponse> {
  return apiFetch(`/api/v1/nodes/${encodeURIComponent(nodeId)}/technician-accounts`);
}

export async function createTechnicianBatchRevoke(input: {
  technician_id: string;
  node_ids: string[];
  action: 'disable' | 'delete';
  confirm: 'CONFIRMAR';
  label?: string;
  client_id?: string;
}): Promise<TechnicianBatchRevokeResponse> {
  return apiFetch('/api/v1/technician-accounts/batch-revoke', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export type TechnicianBatchActionResponse = {
  generated_at: string;
  batch: CommandBatchResponse['batch'] | null;
  technician: {
    id: string;
    login_username: string;
    full_name: string;
  };
  results: TechnicianBatchRevokeResultItem[];
  password_display_once?: string;
  summary: {
    total: number;
    enqueued: number;
    backup_queued?: number;
    skipped: number;
    failed: number;
  };
};

export async function createTechnicianBatchProvision(input: {
  technician_id: string;
  node_ids: string[];
  password?: string;
  privilege_profile?: 'admin_full';
  backup_before_provision?: boolean;
  label?: string;
  client_id?: string;
  confirm: 'CONFIRMAR';
}): Promise<TechnicianBatchActionResponse> {
  return apiFetch('/api/v1/technician-accounts/batch-provision', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function createTechnicianBatchPasswordReset(input: {
  technician_id: string;
  node_ids: string[];
  password?: string;
  label?: string;
  client_id?: string;
  confirm: 'CONFIRMAR';
}): Promise<TechnicianBatchActionResponse> {
  return apiFetch('/api/v1/technician-accounts/batch-password-reset', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function createTechnician(input: {
  full_name: string;
  login_username: string;
  notes?: string;
}): Promise<{
  id: string;
  full_name: string;
  login_username: string;
  status: string;
}> {
  return apiFetch('/api/v1/technicians', {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}

export async function deleteTechnicianFromRegistry(
  technicianId: string,
  confirmLoginUsername: string,
): Promise<{
  id: string;
  full_name: string;
  login_username: string;
  status: string;
  revoked_at: string | null;
}> {
  return apiFetch(`/api/v1/technicians/${encodeURIComponent(technicianId)}`, {
    method: 'DELETE',
    body: { confirm_login_username: confirmLoginUsername },
    csrfProtected: true,
  });
}

export async function createTechnicianFleetRevoke(
  technicianId: string,
  input: {
    action: 'disable' | 'delete';
    confirm: 'CONFIRMAR';
    label?: string;
    client_id?: string;
  },
): Promise<TechnicianFleetRevokeResponse> {
  return apiFetch(`/api/v1/technicians/${encodeURIComponent(technicianId)}/revoke-fleet`, {
    method: 'POST',
    body: input,
    csrfProtected: true,
  });
}
