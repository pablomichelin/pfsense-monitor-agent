import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader, uiMocks, hookHarness, elements, textOf } from './source-harness.mjs';

const loader = sourceLoader();
const { formatDateTime } = loader('lib/format.ts');
test('horário absoluto independe do fuso do servidor/navegador', () => {
  const old = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      assert.equal(formatDateTime('2026-11-04T03:49:51Z'), '04/11/2026, 00:49:51 (Brasília)');
    }
    assert.equal(formatDateTime(null), '-');
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});

test('navegação do firewall conserva operações em abas ocultas e encerra segredo da configuração', () => {
  const h = hookHarness(); let query = new URLSearchParams('tab=operations&metrics_period=24h'); let destination;
  const { NodeDetailTabs } = sourceLoader({ react: h.react, 'next/navigation': {
    usePathname: () => '/nodes/fixture', useSearchParams: () => query, useRouter: () => ({ replace: value => destination = value }),
  } })('components/nodes/node-detail-tabs.tsx');
  const tabs = ['overview','operations','history','access','metrics','alerts','backup','config'].map(id => ({id,label:id}));
  const props = {tabs, overview:'OVERVIEW',operations:'ACTIVE_COMMAND',history:'HISTORY',access:'ACCESS',metrics:'METRICS',alerts:'ALERTS',backup:'BACKUP',config:'SECRET'};
  let tree = h.render(NodeDetailTabs,props);
  assert.equal(elements(tree).filter(e=>e.props?.role==='tabpanel').length,8);
  assert.ok(!textOf(tree).includes('SECRET'));
  elements(tree).find(e=>e.props?.id==='node-tab-backup').props.onClick();
  assert.equal(destination,'/nodes/fixture?tab=backup&metrics_period=24h');
  query = new URLSearchParams('tab=backup'); tree=h.render(NodeDetailTabs,props);
  assert.ok(elements(tree).find(e=>e.props?.id==='node-panel-operations').props.hidden);
  assert.ok(textOf(tree).includes('ACTIVE_COMMAND'));
  query = new URLSearchParams('tab=config'); tree=h.render(NodeDetailTabs,props); assert.ok(textOf(tree).includes('SECRET'));
  query = new URLSearchParams('tab=forbidden'); tree=h.render(NodeDetailTabs,{...props,tabs:tabs.slice(0,2)});
  assert.equal(elements(tree).filter(e=>e.props?.role==='tabpanel').length,2);
  assert.equal(elements(tree).find(e=>e.props?.role==='tab'&&e.props['aria-selected']).props.id,'node-tab-overview');
});

test('seletor pesquisa nomes sem trocar alvo explicitamente selecionado', () => {
  const h=hookHarness(); h.react.useId=()=> 'picker';
  const { BootstrapNodePicker }=sourceLoader({react:h.react})('components/bootstrap-node-picker.tsx');
  const nodes=[{id:'a',display_name:'São José',hostname:'one',node_uid:'uid-a',client:{name:'Cliente'},site:{name:'Matriz'}},{id:'b',display_name:'Filial',hostname:'two',node_uid:'uid-b',client:{name:'Cliente'},site:{name:'Filial'}}];
  const props={nodes,selectedId:'a'};
  let tree=h.render(BootstrapNodePicker,props);
  elements(tree).find(e=>e.type==='input').props.onChange({target:{value:'filial'}}); tree=h.render(BootstrapNodePicker,props);
  assert.equal(elements(tree).find(e=>e.type==='select').props.value,'a');
  assert.equal(elements(tree).filter(e=>e.type==='option').length,3);
  elements(tree).find(e=>e.type==='select').props.onChange({target:{value:'b'}}); tree=h.render(BootstrapNodePicker,props);
  assert.equal(elements(tree).find(e=>e.type==='select').props.value,'b');
  elements(tree).find(e=>e.type==='input').props.onChange({target:{value:'sao jose'}}); tree=h.render(BootstrapNodePicker,props);
  assert.ok(textOf(tree).includes('São José')); assert.equal(elements(tree).find(e=>e.type==='select').props.value,'b');
});

async function alertPage(params) {
  const queries=[];
  const { default: page }=sourceLoader({...uiMocks,
    'next/navigation': {redirect(){assert.fail('acesso autorizado');}},
    '@/lib/admin': {acknowledgeAlertAction(){},resolveAlertAction(){}},
    '@/lib/api': { getSession:async()=>({permissions:['alerts.view']}),getNodesFilters:async()=>({clients:[],sites:[]}),getAlertsList:async(q)=>{queries.push(q);return {generated_at:'2026-11-04T00:00:00Z',total:0,total_pages:1,page:1,totals:{open:0,acknowledged:0,resolved:0,critical:0,critical_pending:0,critical_resolved:0},items:[]};}},
  })('app/alerts/page.tsx');
  return {tree:await page({searchParams:Promise.resolve(params)}),queries};
}
test('alertas abre em pendentes e Todos continua acessível com filtros e paginação preservados',async()=>{
  const {tree,queries}=await alertPage({client_id:'client',node_id:'node',search:'VPN'});
  assert.equal(queries[0].status,'open');
  const all=elements(tree).find(e=>e.type==='a'&&textOf(e)==='Todos'); const url=new URL(all.props.href,'https://fixture.test');
  assert.equal(url.searchParams.get('view'),'all');assert.equal(url.searchParams.get('node_id'),'node');assert.equal(url.searchParams.get('search'),'VPN');
  const next=await alertPage(Object.fromEntries(url.searchParams));assert.equal(next.queries[0].status,undefined);
  assert.ok(elements(next.tree).some(e=>e.type==='input'&&e.props.name==='node_id'&&e.props.value==='node'));
  assert.ok(elements(next.tree).some(e=>e.type==='input'&&e.props.name==='view'&&e.props.value==='all'));
});
test('histórico continua filtrável e perfis somente consulta não ganham ações',async()=>{
  const {tree,queries}=await alertPage({status:'resolved',severity:'critical',page:'2',per_page:'10'});
  assert.equal(queries[0].status,'resolved');assert.equal(queries[0].severity,'critical');assert.equal(queries[0].page,2);assert.equal(queries[0].limit,10);
  const hero=elements(tree).find(e=>e.type==='hero'); assert.ok(hero.props.stats.some(s=>s.label==='Críticos pendentes')); assert.ok(hero.props.stats.some(s=>s.label==='Críticos resolvidos'));
});

test('títulos amigáveis preservam serviços desconhecidos sem inventar causa',()=>{
 const {alertTitle}=loader('lib/alert-display.ts');
 assert.equal(alertTitle('Service ipsec stopped'),'Serviço ipsec parado');
 assert.equal(alertTitle('Gateway WANGW down'),'Gateway WANGW indisponível');
 assert.equal(alertTitle('Custom plugin alert'),'Custom plugin alert');
});
