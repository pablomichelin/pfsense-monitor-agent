import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, hookHarness, sourceLoader, textOf } from './source-harness.mjs';

const renderedAt = '2026-11-25T16:12:34Z';

function setup(t) {
  const hooks = hookHarness();
  const sources = [];
  const timers = new Map();
  let nextTimer = 0;
  let refreshes = 0;

  class FakeEventSource {
    static CLOSED = 2;
    readyState = 0;
    listeners = new Map();
    closeCalls = 0;

    constructor(url) {
      assert.equal(url, '/api/realtime/dashboard');
      sources.push(this);
    }

    addEventListener(name, listener) { this.listeners.set(name, listener); }

    removeEventListener(name, listener) {
      assert.equal(this.listeners.get(name), listener);
      this.listeners.delete(name);
    }

    close() {
      this.closeCalls++;
      this.readyState = FakeEventSource.CLOSED;
    }

    emit(name, payload) {
      this.listeners.get(name)?.({ data: JSON.stringify(payload) });
    }
  }

  const previousSource = globalThis.EventSource;
  const previousWindow = globalThis.window;
  globalThis.EventSource = FakeEventSource;
  globalThis.window = {
    setTimeout(callback, delay) {
      timers.set(++nextTimer, { callback, delay });
      return nextTimer;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  t.after(() => {
    if (previousSource === undefined) delete globalThis.EventSource;
    else globalThis.EventSource = previousSource;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  const router = { refresh() { refreshes++; } };
  const { RealtimeRefresh } = sourceLoader({
    react: hooks.react,
    'next/navigation': { useRouter: () => router },
  })('components/realtime-refresh.tsx');

  return {
    sources,
    timers,
    refreshes: () => refreshes,
    render: (props = {}) => hooks.render(RealtimeRefresh, { renderedAt, ...props }),
    unmount: hooks.unmount,
  };
}

function refreshButton(tree) {
  return elements(tree).find((element) => typeof element.props?.onClick === 'function'
    && textOf(element.props.children) === 'Atualizar agora');
}

test('RealtimeRefresh manual mantém timestamp e atualiza sem abrir SSE', (t) => {
  const qa = setup(t);
  const tree = qa.render({ realtimeEnabled: false });
  assert.equal(qa.sources.length, 0);
  assert.match(textOf(tree), /Atualização manual/);
  assert.match(textOf(tree), /Atualizado\s+13:12:34\s+\(Brasília\)/);
  assert.equal(qa.refreshes(), 0);

  const button = refreshButton(tree);
  assert.ok(button);
  button.props.onClick();
  assert.equal(qa.refreshes(), 1);
  assert.equal(qa.sources.length, 0);
  assert.equal(qa.timers.size, 0);

  const updated = qa.render({ realtimeEnabled: false, renderedAt: '2026-11-25T16:12:52Z' });
  assert.match(textOf(updated), /Atualizado\s+13:12:52\s+\(Brasília\)/);
  qa.unmount();
});

test('RealtimeRefresh padrão abre SSE e oferece atualização manual apenas quando CLOSED', (t) => {
  const qa = setup(t);
  assert.equal(refreshButton(qa.render()), undefined);
  assert.equal(qa.sources.length, 1);
  const [source] = qa.sources;

  source.emit('error');
  const reconnecting = qa.render();
  assert.match(textOf(reconnecting), /Tempo real reconectando/);
  assert.equal(refreshButton(reconnecting), undefined);

  source.readyState = 1;
  source.emit('open');
  const live = qa.render();
  assert.match(textOf(live), /Tempo real ativo/);
  assert.equal(refreshButton(live), undefined);
  assert.equal(qa.timers.size, 1);
  assert.equal([...qa.timers.values()][0].delay, 1200);

  source.readyState = 2;
  source.emit('error');
  const closed = qa.render();
  assert.match(textOf(closed), /Tempo real desconectado/);
  assert.match(textOf(closed), /Atualizado\s+13:12:34\s+\(Brasília\)/);
  const button = refreshButton(closed);
  assert.ok(button);
  button.props.onClick();
  assert.equal(qa.refreshes(), 1);
  assert.equal(qa.sources.length, 1);
  assert.equal(qa.timers.size, 0);
  assert.match(textOf(qa.render()), /Tempo real desconectado/);
  qa.unmount();
  assert.equal(source.closeCalls, 1);
  assert.equal(source.listeners.size, 0);
});

test('RealtimeRefresh troca de modo limpando stream, listeners e timer', (t) => {
  const qa = setup(t);
  qa.render();
  const [first] = qa.sources;
  first.readyState = 1;
  first.emit('open');
  first.emit('dashboard.refresh', { source: 'heartbeat_ingested', occurred_at: renderedAt });
  assert.match(textOf(qa.render()), /heartbeat/);
  assert.equal(qa.timers.size, 1);

  const manual = qa.render({ realtimeEnabled: false });
  assert.match(textOf(manual), /Atualização manual/);
  assert.doesNotMatch(textOf(manual), /heartbeat/);
  assert.equal(qa.sources.length, 1);
  assert.equal(first.closeCalls, 1);
  assert.equal(first.listeners.size, 0);
  assert.equal(qa.timers.size, 0);

  qa.render({ realtimeEnabled: true });
  assert.equal(qa.sources.length, 2);
  const second = qa.sources[1];
  second.readyState = 1;
  second.emit('open');
  assert.equal(qa.timers.size, 1);
  qa.unmount();
  assert.equal(second.closeCalls, 1);
  assert.equal(second.listeners.size, 0);
  assert.equal(qa.timers.size, 0);
});
