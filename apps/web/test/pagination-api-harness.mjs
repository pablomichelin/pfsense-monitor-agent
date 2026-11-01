import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import ts from 'typescript';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../api/src');
export function apiSourceLoader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let file = resolve(apiRoot, relative);
    if (!existsSync(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const nativeRequire = createRequire(file);
    const require = (name) => Object.hasOwn(mocks, name) ? mocks[name]
      : name.startsWith('.') ? load(resolve(dirname(file), name)) : nativeRequire(name);
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        experimentalDecorators: true, emitDecoratorMetadata: false, esModuleInterop: true },
    }).outputText;
    new Script(`(function(require,module,exports){${compiled}\n})`, { filename: file }).runInThisContext()(require, module, module.exports);
    return module.exports;
  }
  return load;
}

// Small Prisma-shaped synthetic adapter. Every query applies the actual predicate
// emitted by the service; it records bounds/scope without a real DB or firewalls.
export function matches(row, where) {
  return Object.entries(where ?? {}).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every((v) => matches(row, v));
    if (key === 'OR') return value.some((v) => matches(row, v));
    const actual = row?.[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('some' in value) return actual.some((r) => matches(r, value.some));
      if ('in' in value) return value.in.includes(actual);
      if ('contains' in value) return String(actual ?? '').toLowerCase().includes(value.contains.toLowerCase());
      return matches(actual, value);
    }
    return actual === value;
  });
}

export function syntheticDb(nodes, alerts = []) {
  const calls = [];
  const enumRank = { open: 0, acknowledged: 1, resolved: 2, critical: 0, warning: 1, info: 2 };
  const findMany = (kind, rows) => async (query) => {
    calls.push({ kind, query });
    let result = rows.filter((row) => matches(row, query.where));
    const orders = Array.isArray(query.orderBy) ? query.orderBy : [query.orderBy];
    result.sort((a, b) => {
      for (const order of orders) {
        const [key, direction] = Object.entries(order)[0];
        const av = a[key], bv = b[key];
        const d = av instanceof Date ? av - bv : key === 'status' || key === 'severity'
          ? enumRank[av] - enumRank[bv] : String(av).localeCompare(String(bv));
        if (d) return d * (direction === 'desc' ? -1 : 1);
      }
      return 0;
    });
    let offset = query.skip ?? 0;
    if (query.cursor) offset += result.findIndex((r) => r.id === query.cursor.id);
    return result.slice(offset, query.take === undefined ? undefined : offset + query.take);
  };
  const db = {
    node: { findMany: findMany('node', nodes) },
    alert: {
      findMany: findMany('alert', alerts),
      groupBy: async (query) => {
        calls.push({ kind: 'counts', query });
        const groups = new Map();
        for (const row of alerts.filter((row) => matches(row, query.where))) {
          const key = `${row.status}:${row.severity}`;
          if (!groups.has(key)) groups.set(key, { status: row.status, severity: row.severity, _count: { _all: 0 } });
          groups.get(key)._count._all++;
        }
        return [...groups.values()];
      },
    },
    tag: { findUnique: async ({ where }) => ({ clientId: where.id === 'tag-b' ? 'client-b' : 'client-a' }) },
    nodeGroup: { findUnique: async ({ where }) => ({ clientId: where.id === 'group-b' ? 'client-b' : 'client-a' }) },
    async $transaction(fn, options) { calls.push({ kind: 'transaction', options }); return fn(db); },
  };
  return { db, calls };
}

export function scopedPolicy() {
  return {
    async assertRequestedClientFilter(actor, client) { if (client) await this.assertClientAccess(actor, client); },
    async assertClientAccess(actor, client) { if (actor.role !== 'superadmin' && client !== 'client-a') throw new Error('forbidden'); },
    async assertNodeAccess(actor, nodeId) { if (actor.role !== 'superadmin' && nodeId.startsWith('other')) throw new Error('forbidden'); },
    async mergeNodeWhere(actor, where) { return actor.role === 'superadmin' ? where : { AND: [where, { site: { clientId: 'client-a' } }] }; },
    async mergeAlertWhere(actor, where) { return actor.role === 'superadmin' ? where : { AND: [where, { node: { site: { clientId: 'client-a' } } }] }; },
  };
}
