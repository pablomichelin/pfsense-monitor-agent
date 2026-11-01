// Directed no-emit type check: entry points changed by the pagination block only.
import ts from 'typescript';
import { resolve } from 'node:path';
const groups = [
  ['apps/api', ['src/nodes/nodes.service.ts', 'src/nodes/list-nodes-sort.util.ts', 'src/nodes/dto/list-nodes-query.dto.ts', 'src/alerts/alerts.service.ts', 'src/alerts/dto/list-alerts-query.dto.ts']],
  ['apps/web', ['app/nodes/page.tsx', 'app/alerts/page.tsx', 'app/admin/page.tsx', 'app/admin/tecnicos/page.tsx', 'app/admin/grupos/page.tsx', 'app/admin/clientes/page.tsx', 'app/bootstrap/page.tsx',
    'components/admin-cadastro-cards.tsx', 'components/admin-technician-targets.tsx', 'components/agent-token-form.tsx', 'components/fleet-org-admin-panel.tsx', 'components/group-member-picker.tsx',
    'components/node-browser-controls.tsx', 'components/node-pagination.tsx', 'components/nodes/fleet-inventory-section.tsx', 'lib/api.ts', 'lib/use-paged-nodes.ts', 'lib/node-options-action.ts']],
];
const formatHost = { getCanonicalFileName: (f) => f, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => '\n' };
for (const [directory, files] of groups) {
  const base = resolve(directory);
  const read = ts.readConfigFile(resolve(base, 'tsconfig.json'), ts.sys.readFile);
  if (read.error) throw new Error(ts.formatDiagnosticsWithColorAndContext([read.error], formatHost));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, base);
  const roots = files.map((f) => resolve(base, f));
  const program = ts.createProgram(roots, { ...parsed.options, noEmit: true, incremental: false, declaration: false,
    tsBuildInfoFile: undefined, types: ['node'], typeRoots: [resolve(base, 'node_modules/@types')] });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
    process.exitCode = 1;
  } else console.log(`${directory}: ${roots.length} pagination entry points + imported dependencies: type check passed (no emit)`);
}
