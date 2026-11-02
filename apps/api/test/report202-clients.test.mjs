import './synthetic-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true }
}).outputText, filename);
const { ClientsAdminController, ListAdminClientsQuery } = require('../src/admin/clients-admin.controller.ts');
const { PermissionsGuard } = require('../src/auth/permissions.guard.ts');
if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts'];
const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');
const request = { auth: { userId: 'user-qa', role: 'admin', sessionId: 'qa' } };
function fixture(allowed) {
 const calls = [];
 const tx = {
  client: { count: async args => { calls.push(['count', args]); return 51; }, findMany: async args => { calls.push(['list', args]); return [{id:'c',name:'QA',code:'QA',status:'inactive',_count:{sites:2}}]; } },
  node: {groupBy: async args => { calls.push(['nodes',args]); return [{siteId:'s1',_count:{_all:2}},{siteId:'s2',_count:{_all:3}}];}},
  site: {findMany: async () => [{id:'s1',clientId:'c'},{id:'s2',clientId:'c'}]},
 };
 return {calls, service:new ClientsAdminController({$transaction:async (fn,options) => { assert.equal(options.isolationLevel,'RepeatableRead'); return fn(tx); }},{getAllowedClientIds:async ()=>allowed})};
}
test('clients permission independent of firewalls; pagination, inactive data and counts',async()=>{
 const f=fixture(null);
 const result=await f.service.list({status:'inactive',page:2,limit:25,search:' QA '},request);
 assert.equal(result.items[0].node_count,5); assert.equal(result.total_pages,3);
 const args=f.calls.find(x=>x[0]==='list')[1]; assert.equal(args.skip,25); assert.equal(args.take,25);
 assert.equal(args.where.status,'inactive'); assert.equal(args.where.OR[0].name.contains,'QA');
 assert.deepEqual(Reflect.getMetadata('required_permissions',ClientsAdminController.prototype.list),['clients.view']);
});
test('scoped clients query never loses the allowed IDs, including empty scope',async()=>{
 for(const allowed of [[],['c']]) { const f=fixture(allowed); await f.service.list({},request); for(const [,args] of f.calls.filter(x=>['count','list'].includes(x[0]))) assert.deepEqual(args.where.id.in,allowed); }
});
test('pagination DTO rejects invalid limits and status',async()=>{
 for(const input of [{limit:101},{page:0},{page:1.5},{status:'deleted'},{search:'x'.repeat(201)}]) assert.ok((await validate(plainToInstance(ListAdminClientsQuery,input))).length);
 assert.equal((await validate(plainToInstance(ListAdminClientsQuery,{limit:25,page:2,status:'inactive'}))).length,0);
});
test('custom client reader passes permission gate without firewall rights; absent permission is denied',async()=>{
 const {Reflector}=require('@nestjs/core');
 const {GUARDS_METADATA}=require('@nestjs/common/constants');
 const guards=Reflect.getMetadata(GUARDS_METADATA,ClientsAdminController);
 assert.deepEqual(guards.map(g=>g.name),['SessionAuthGuard','MfaEnrollmentGuard','PermissionsGuard']);
 assert.equal(Reflect.getMetadata('roles',ClientsAdminController),undefined);
 const context={getClass:()=>ClientsAdminController,getHandler:()=>ClientsAdminController.prototype.list,
  switchToHttp:()=>({getRequest:()=>({auth:{userId:'user-qa',role:'custom-client-reader'}})})};
 let allowed=true;
 const guard=new PermissionsGuard(new Reflector(),{hasPermission:async(role,permission)=>{
  assert.equal(role,'custom-client-reader'); assert.equal(permission,'clients.view'); return allowed;
 }});
 assert.equal(await guard.canActivate(context),true);
 const f=fixture(['c']);
 await f.service.list({},context.switchToHttp().getRequest());
 assert.deepEqual(f.calls.find(x=>x[0]==='list')[1].where.id.in,['c']);
 allowed=false;
 await assert.rejects(guard.canActivate(context),e=>e.getStatus()===403);
});
