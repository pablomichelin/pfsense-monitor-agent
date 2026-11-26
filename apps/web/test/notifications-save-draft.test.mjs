import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, elements, hookHarness, sourceLoader, textOf, uiMocks } from './source-harness.mjs';

test('notification channel and rule saves lock their fields and reopen on failure', async (t) => {
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class extends NativeFormData {
    constructor(form) {
      super();
      for (const [key, value] of Object.entries(form.values)) this.set(key, value);
    }
  };
  t.after(() => { globalThis.FormData = NativeFormData; });

  const props = {
    status: { enabled: false },
    channels: [{ id: 'channel', type: 'webhook', name: 'Existing channel' }],
    rules: [{ id: 'rule', channel_id: 'channel', name: 'Existing rule' }],
    deliveries: [],
    clients: [],
    canManage: true,
    canTest: false,
  };

  for (const { action, trigger, index = 0, id, fields } of [
    { action: 'createNotificationChannelAction', trigger: 'Novo canal', fields: { type: 'webhook', url: 'https://qa.example.test' } },
    { action: 'updateNotificationChannelAction', trigger: 'Editar', id: 'channel', fields: { type: 'webhook', url: 'https://qa.example.test' } },
    { action: 'createNotificationRuleAction', trigger: 'Nova regra', fields: { channel_id: 'channel', client_id: '' } },
    { action: 'updateNotificationRuleAction', trigger: 'Editar', index: 1, id: 'rule', fields: { channel_id: 'channel', client_id: '' } },
  ]) {
    const harness = hookHarness();
    let transition;
    let pending = false;
    harness.react.useTransition = () => [pending, (task) => {
      pending = true;
      transition = task().finally(() => { pending = false; });
    }];
    let response = deferred();
    const calls = [];
    const { NotificationsAdminPanel } = sourceLoader({
      ...uiMocks,
      react: harness.react,
      '@/components/confirm-dialog': { ConfirmDialog: 'confirm' },
      '@/lib/notifications-actions': {
        [action]: (...args) => {
          calls.push([...args.slice(0, -1), Object.fromEntries(args.at(-1))]);
          return response.promise;
        },
      },
    })('components/notifications-admin-panel.tsx');

    const render = () => elements(harness.render(NotificationsAdminPanel, props));
    const getForm = () => render().find((element) => element.type === 'form');
    const fieldset = () => elements(getForm()).find((element) => element.type === 'fieldset');
    render().filter((element) => element.type === 'button' && textOf(element) === trigger)[index].props.onClick();

    const draft = { name: 'Submitted draft', ...fields };
    const event = { preventDefault() {}, currentTarget: { values: draft } };
    assert.equal(fieldset()?.props.disabled, false, action);
    getForm().props.onSubmit(event);
    assert.deepEqual(calls, [id ? [id, draft] : [draft]], action);
    assert.equal(fieldset().props.disabled, true, action);
    getForm().props.onSubmit(event);
    assert.equal(calls.length, 1, action);

    if (id) response.reject(new Error('Transport failed'));
    else response.resolve({ ok: false, error: 'QA rejection' });
    await transition;
    assert.equal(fieldset().props.disabled, false, action);
    assert.ok(render().some((element) => element.type === 'section'
      && /QA rejection|Não foi possível concluir/.test(textOf(element))), action);

    response = deferred();
    getForm().props.onSubmit(event);
    assert.deepEqual(calls[1], calls[0], action);
    response.resolve({ ok: true });
    await transition;
    assert.equal(getForm(), undefined, action);
  }
});
