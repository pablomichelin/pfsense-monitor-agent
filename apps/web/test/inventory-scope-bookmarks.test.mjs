import assert from 'node:assert/strict';
import test from 'node:test';
import { elements, hookHarness, sourceLoader } from './source-harness.mjs';

const options = [
  { id: 'site-a', clientId: 'a', label: 'Site A' },
  { id: 'site-b', clientId: 'b', label: 'Site B' },
];

function selectFixture(defaultValue) {
  const harness = hookHarness();
  let client = 'a';
  const { ClientScopedFilterSelect } = sourceLoader({
    react: {
      ...harness.react,
      createContext: () => Symbol('client context'),
      useContext: () => client,
    },
  })('components/inventory-alerts-filter-form.tsx');
  return {
    selectClient: (value) => { client = value; },
    render: () => harness.render(ClientScopedFilterSelect, {
      options, name: 'site_id', placeholder: 'Todos os sites', defaultValue,
    }),
  };
}

test('an unlisted site from a bookmark remains an explicit filter', () => {
  const fixture = selectFixture('unlisted-site');
  const select = fixture.render();
  assert.equal(select.props.value, 'unlisted-site');
  assert.deepEqual(elements(select).filter((element) => element.type === 'option').map((option) => option.props.value),
    ['', 'unlisted-site', 'site-a']);
});

test('switching to another client clears selections from the previous scope', () => {
  for (const site of ['site-a', 'unlisted-site']) {
    const fixture = selectFixture(site);
    assert.equal(fixture.render().props.value, site);
    fixture.selectClient('b');
    const select = fixture.render();
    assert.equal(select.props.value, '');
    assert.deepEqual(elements(select).filter((item) => item.type === 'option').map((item) => item.props.value), ['', 'site-b']);
  }
});
