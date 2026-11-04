import './synthetic-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const previous=require.extensions['.ts'];
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,file);
let AlertsService,PackageReleaseService,DashboardService;
try {
 ({AlertsService}=require('../src/alerts/alerts.service.ts'));
 ({PackageReleaseService}=require('../src/common/package-release.service.ts'));
 ({DashboardService}=require('../src/dashboard/dashboard.service.ts'));
} finally {if(previous)require.extensions['.ts']=previous;else delete require.extensions['.ts'];}

test('críticos pendentes excluem resolvidos sem perder contadores históricos ou escopo',async()=>{
 const scoped={AND:[{node:{site:{clientId:'scope'}}},{severity:'critical'}]};
 const seen=[];
 const tx={alert:{groupBy:async(q)=>{seen.push(q.where);return [
 {status:'open',severity:'critical',_count:{_all:2}},
 {status:'acknowledged',severity:'critical',_count:{_all:3}},
 {status:'resolved',severity:'critical',_count:{_all:8}},
 {status:'resolved',severity:'warning',_count:{_all:4}},
 ];},findMany:async(q)=>{seen.push(q.where);assert.equal(q.take,10);return [];}}};
 const service=new AlertsService({$transaction:async(fn)=>fn(tx)},{assertRequestedClientFilter:async()=>{},mergeAlertWhere:async()=>scoped});
 const result=await service.listAlerts({},{page:1,limit:10,sort_by:'attention',severity:'critical'});
 assert.deepEqual(seen,[scoped,scoped]);assert.equal(result.totals.critical_pending,5);assert.equal(result.totals.critical_resolved,8);
 assert.equal(result.totals.critical,13);assert.equal(result.totals.resolved,12);assert.equal(result.total,17);assert.equal(result.total_pages,2);
});
test('comparação de versão acompanha fonte publicada e ausência vira desconhecida',()=>{
 const service=new PackageReleaseService();let version='0.5.34';
 service.getPackageRelease=()=>({version});assert.equal(service.getPublishedVersion(),'0.5.34');
 version='0.5.35';assert.equal(service.getPublishedVersion(),'0.5.35');
 service.getPackageRelease=()=>{throw new Error('metadata unavailable');};assert.equal(service.getPublishedVersion(),null);
});
test('dashboard usa serviço de release compartilhado na agregação',async()=>{
 const fakeNode={id:'n',status:'online',lastSeenAt:new Date(),maintenanceMode:false,nodeUidStatus:'active',agentVersion:'0.5.34',pfsenseVersion:'2.9.0',site:{timezone:'America/Sao_Paulo'},configBackups:[],nodeCommands:[]};
 let calls=0;
 const prisma={node:{findMany:async()=>[fakeNode]},alert:{count:async()=>0}};
 const policy={assertRequestedClientFilter:async()=>{},mergeNodeWhere:async()=>({}),mergeAlertWhere:async()=>({})};
 const service=new DashboardService(prisma,policy,{getPublishedVersion(){calls++;return '0.5.34';}});
 service.buildActorCacheKey=async()=> 'synthetic-scope';
 const result=await service.getFleet({});assert.equal(calls,1);assert.equal(result.compliance.package_target_version,'0.5.34');assert.equal(result.compliance.package_outdated_count,0);
});
