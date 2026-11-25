import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader, uiMocks, hookHarness, elements, textOf, settle, deferred } from './source-harness.mjs';

test('resultados atuais visíveis, pendência explícita e erro de consulta preserva sucesso sem reenviar', async () => {
  global.window = {setInterval: () => 1, clearInterval() {}};
  const harness = hookHarness(); let creates = 0; let offline = false;
  const results = ['a','b','c'].map((id) => ({node_id:id,hostname:`Firewall ${id}`,outcome:id==='c'?'skipped':'enqueued',reason:null}));
  const live = {batch:{status:'running',succeeded_count:1},nodes:[{node_id:'a',command_id:'ca',status:'succeeded'},{node_id:'b',command_id:'cb',status:'pending'}]};
  const {FleetBatchPackageUpgradePanel: Component} = sourceLoader({...uiMocks,react:harness.react,'@/lib/package-upgrade':{
    createPackageUpgradeBatchAction: async () => {creates++; return {summary:{enqueued:2,skipped:1,failed:0},batch:{batch_id:'batch-test'},results};},
    pollCommandBatchStatusAction: async () => {if(offline) throw Error('offline'); return live;},
  }})('components/nodes/fleet-batch-package-upgrade-panel.tsx');
  const props={selectedNodes:results.map(r=>({id:r.node_id,hostname:r.hostname})),targetPackageVersion:'0.5.34',canRunPackageUpgrade:true};
  let tree; const render=()=> tree=harness.render(Component,props);
  const button=(label)=>elements(tree).find(e=>e.type==='button'&&textOf(e).includes(label));
  render();button('Atualizar package selecionados').props.onClick();render();
  elements(tree).find(e=>e.type==='input').props.onChange({target:{value:'CONFIRMAR'}});render();
  button('Confirmar lote').props.onClick();await settle();render();await settle();render();
  const list=elements(tree).find(e=>e.type==='ul'&&e.props['aria-label']);
  assert.match(textOf(list),/Concluído/);assert.match(textOf(list),/Aguardando retirada pelo agente/);assert.match(textOf(list),/Ignorado/);
  assert.equal(elements(tree).filter(e=>e.type==='table').length,0);
  offline=true;await button('Atualizar resultados').props.onClick();await settle();render();
  assert.match(textOf(tree),/últimos resultados foram mantidos/);assert.match(textOf(tree),/Concluído/);assert.equal(creates,1);
  offline=false;await button('Atualizar resultados').props.onClick();await settle();render();
  assert.doesNotMatch(textOf(tree),/últimos resultados foram mantidos/);assert.equal(creates,1);
  harness.unmount();delete global.window;
});

test('consulta um lote existente sem criar comandos nem inventar ignorados', async () => {
  global.window={setInterval:()=>1,clearInterval(){}};
  const harness=hookHarness();
  const {FleetBatchPackageUpgradePanel:Component}=sourceLoader({...uiMocks,react:harness.react,'@/lib/package-upgrade':{
    createPackageUpgradeBatchAction:()=>assert.fail('não reenviar'),
    pollCommandBatchStatusAction:async()=>({generated_at:'now',batch:{batch_id:'saved',command_type:'package_upgrade',status:'completed',succeeded_count:1},nodes:[{node_id:'a',command_id:'ca',status:'succeeded'}]}),
  }})('components/nodes/fleet-batch-package-upgrade-panel.tsx');
  const props={selectedNodes:[{id:'a',hostname:'Firewall A'}],canRunPackageUpgrade:true,targetPackageVersion:'0.5.34'};
  let tree=harness.render(Component,props);
  elements(tree).find(e=>e.type==='input').props.onChange({target:{value:'saved'}});
  tree=harness.render(Component,props);
  elements(tree).find(e=>e.type==='button'&&textOf(e)==='Consultar lote').props.onClick();await settle();
  tree=harness.render(Component,props);
  assert.match(textOf(tree),/Firewall A/);assert.match(textOf(tree),/Concluído/);assert.match(textOf(tree),/ignorados não fazem parte do lote/);
  harness.unmount();delete global.window;
});

test('acompanha uma consulta por vez e ignora a resposta de um lote fechado', async (t) => {
  const timers = new Set();
  global.window = {
    setInterval(callback) { timers.add(callback); return callback; },
    clearInterval(callback) { timers.delete(callback); },
  };
  const harness = hookHarness();
  t.after(() => {
    harness.unmount();
    delete global.window;
  });
  const requests = [];
  const snapshot = (batchId, status) => ({
    generated_at: '2026-11-04T00:00:00Z',
    batch: { batch_id: batchId, command_type: 'package_upgrade', status: status === 'succeeded' ? 'completed' : 'running' },
    nodes: [{ node_id: 'a', command_id: batchId + '-command', status }],
  });
  const { FleetBatchPackageUpgradePanel: Component } = sourceLoader({
    ...uiMocks,
    react: harness.react,
    '@/lib/package-upgrade': {
      createPackageUpgradeBatchAction: () => assert.fail('consulta não deve criar comandos'),
      pollCommandBatchStatusAction: (batchId) => {
        const request = { batchId, ...deferred() };
        requests.push(request);
        return request.promise;
      },
    },
  })('components/nodes/fleet-batch-package-upgrade-panel.tsx');
  const props = {
    selectedNodes: [{ id: 'a', hostname: 'Firewall sintético' }],
    canRunPackageUpgrade: true,
    targetPackageVersion: '0.5.34',
  };
  let tree;
  const render = () => { tree = harness.render(Component, props); };
  const button = (label) => elements(tree).find((element) => element.type === 'button' && textOf(element) === label);
  const results = () => textOf(elements(tree).find((element) => element.props?.['aria-label'] === 'Resultado atual por firewall'));
  const open = async (batchId) => {
    elements(tree).find((element) => element.type === 'input').props.onChange({ target: { value: batchId } });
    render();
    button('Consultar lote').props.onClick();
    requests.at(-1).resolve(snapshot(batchId, 'succeeded'));
    await settle();
    render();
  };

  render();
  await open('lote-a');
  render(); // Aplica a mudança de estado feita pelo efeito de polling.
  const oldPoll = requests.at(-1);
  const manual = button('Atualizar resultados');
  const unavailableDuringPoll = manual.props.disabled;
  for (const tick of timers) tick();
  manual.props.onClick();

  button('Limpar resultado').props.onClick();
  render();
  await open('lote-b');
  const newPoll = requests.at(-1);
  assert.match(results(), /Concluído/);

  oldPoll.resolve(snapshot('lote-a', 'pending'));
  await settle();
  render();
  assert.match(results(), /Concluído/, 'uma resposta do lote A não deve substituir o resultado do lote B');
  assert.equal(requests.filter((request) => request.batchId === 'lote-a').length, 2, 'uma consulta inicial e uma atualização pendente');
  assert.equal(unavailableDuringPoll, true);
  assert.equal(button('Atualizar resultados').props.disabled, true, 'uma resposta obsoleta não deve liberar a consulta atual');

  newPoll.resolve(snapshot('lote-b', 'succeeded'));
  await settle();
  render();
  assert.equal(button('Atualizar resultados').props.disabled, false);
});
