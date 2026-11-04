import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader, uiMocks, hookHarness, elements, textOf, settle } from './source-harness.mjs';

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
