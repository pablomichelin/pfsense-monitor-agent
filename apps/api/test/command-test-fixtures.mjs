import { randomUUID } from 'node:crypto';

export const nodeId = '10000000-0000-4000-8000-000000000001';
export const userId = '20000000-0000-4000-8000-000000000001';
export function command(overrides = {}) {
  return {
    id: randomUUID(), nodeId, type: 'local_user_set_password', status: 'pending',
    payloadJson: { account_id: 'account', technician_id: 'technician', pfsense_username: 'synthetic', password: 'Synthetic-pass-1!' },
    requestedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    pickedUpAt: null, runningAt: null, completedAt: null, cancelledAt: null,
    resultJson: null, errorMessage: null, retryCount: 0, maxRetries: 0,
    batchId: null, nextRetryAt: null, ...overrides,
  };
}

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return value.every((clause) => matches(row, clause));
    if (key === 'OR') return value.some((clause) => matches(row, clause));
    const actual = row[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(actual);
      if ('equals' in value) return JSON.stringify(actual) === JSON.stringify(value.equals);
      return Object.entries(value).every(([operator, expected]) => {
        if (operator === 'gt') return actual > expected;
        if (operator === 'lte') return actual <= expected;
        throw new Error(`Unimplemented fixture predicate ${key}.${operator}`);
      });
    }
    return value instanceof Date ? actual?.getTime() === value.getTime() : actual === value;
  });
}

/** Deterministic interleavings before CAS; no database or network access. */
export function fixture(initial = [], { rollback = false } = {}) {
  const state = {
    commands: structuredClone(initial), audit: [], batches: [], accountWrites: [], nodeWrites: [],
    account: { id: 'account', nodeId, technicianId: 'technician', lastCommandId: initial[0]?.id, status: 'pending_create' },
    node: { id: nodeId, hostname: 'synthetic-fw', agentVersion: '9.0.0', lastSeenAt: new Date(), maintenanceMode: false, haRole: null, haDetectedFromAgent: false },
  };
  const hooks = {};
  const db = {
    $queryRaw: async () => [{ id: nodeId }],
    nodeCommand: {
      findFirst: async ({ where }) => structuredClone(state.commands.find((row) => matches(row, where)) ?? null),
      findUnique: async ({ where }) => structuredClone(state.commands.find((row) => matches(row, where)) ?? null),
      findMany: async ({ where } = {}) => {
        const rows = structuredClone(state.commands.filter((row) => matches(row, where)));
        if (hooks.afterFindMany) await hooks.afterFindMany(rows);
        return rows;
      },
      count: async ({ where }) => state.commands.filter((row) => matches(row, where)).length,
      updateMany: async ({ where, data }) => {
        if (hooks.beforeUpdate) await hooks.beforeUpdate({ where, data });
        const rows = state.commands.filter((row) => matches(row, where));
        for (const row of rows) Object.assign(row, structuredClone(data));
        return { count: rows.length };
      },
      update: async ({ where, data }) => {
        const row = state.commands.find((row) => matches(row, where));
        if (!row) throw new Error('missing command');
        Object.assign(row, structuredClone(data)); return structuredClone(row);
      },
      create: async ({ data }) => {
        if (hooks.beforeCreate) await hooks.beforeCreate(data);
        const row = command(data); state.commands.push(row); return structuredClone(row);
      },
    },
    node: {
      findUnique: async () => structuredClone(state.node),
      update: async ({ data }) => {
        state.nodeWrites.push(structuredClone(data)); Object.assign(state.node, data); return structuredClone(state.node);
      },
    },
    technicianNodeAccount: { updateMany: async ({ where, data }) => {
      state.accountWrites.push({ where, data });
      if (!matches(state.account, where)) return { count: 0 };
      Object.assign(state.account, data); return { count: 1 };
    } },
    auditLog: { create: async ({ data }) => { state.audit.push(data); return data; } },
    jobBatch: {
      create: async ({ data }) => { const batch = { id: randomUUID(), requestedAt: new Date(), ...data, commands: [] }; state.batches.push(batch); return batch; },
      update: async ({ where, data }) => Object.assign(state.batches.find((row) => row.id === where.id), data),
      findUnique: async ({ where }) => {
        const batch = state.batches.find((row) => row.id === where.id);
        return batch && { ...batch, commands: state.commands.filter((row) => row.batchId === batch.id) };
      },
    },
  };
  db.$transaction = async (fn) => {
    const before = rollback ? structuredClone(state) : null;
    try { return await fn(db); }
    catch (error) { if (before) Object.assign(state, before); throw error; }
  };
  return { db, state, hooks };
}
