import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Carrega o código real em memória. API, navegação e relógio são substituídos
// pelos testes; nenhum servidor, conta, firewall ou dado real é utilizado.
export function sourceLoader(mocks = {}) {
  const cache = new Map();
  function load(relative) {
    let file = resolve(root, relative);
    if (!existsSync(file)) file = ['.ts', '.tsx'].map((ext) => file + ext).find(existsSync);
    if (!file) throw new Error(`Fonte não encontrada: ${relative}`);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const nativeRequire = createRequire(file);
    const require = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/')) return load(id.slice(2));
      if (id.startsWith('.')) return load(resolve(dirname(file), id));
      return nativeRequire(id);
    };
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    new Script(`(function(require,module,exports){${compiled}\n})`, { filename: file })
      .runInThisContext()(require, module, module.exports);
    return module.exports;
  }
  return load;
}

export const uiMocks = {
  '@/components/ui': { Alert: 'aside', Badge: 'small', Button: 'button', Card: 'section', PageSection: 'section' },
  '@/components/ui/alert': { Alert: 'aside' },
  '@/components/ui/button': { Button: 'button' },
  '@/components/ui/card': { Card: 'section' },
  '@/components/page-hero': { PageHero: 'hero' },
  '@/components/advanced-section': { AdvancedSection: 'section' },
  '@/components/realtime-refresh': { RealtimeRefresh: 'realtime' },
  '@/components/copy-button': { CopyButton: 'copy-button' },
  'next/link': { __esModule: true, default: 'a' },
};

export function elements(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (typeof tree !== 'object') return [];
  return [tree, ...elements(tree.props?.children)];
}

export function textOf(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(textOf).join(' ');
  if (typeof tree !== 'object') return String(tree);
  return textOf(tree.props?.children);
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function settle() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}

// Simulação deliberadamente pequena do ciclo de hooks. Executa os handlers e
// efeitos reais com respostas adiadas, sem alegar validação de DOM/browser.
export function hookHarness() {
  const slots = [];
  const transitions = [];
  let cursor = 0;
  let effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: factory() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useTransition() {
      const start = react.useMemo(() => (fn) => { transitions.push(Promise.resolve(fn())); }, []);
      return [false, start];
    },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) {
        effects.push(() => {
          slots[i]?.cleanup?.();
          slots[i] = { deps, cleanup: effect() };
        });
      }
    },
  };
  return {
    react, transitions,
    render(Component, props = {}) {
      cursor = 0;
      effects = [];
      const tree = Component(props);
      effects.forEach((effect) => effect());
      return tree;
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}
