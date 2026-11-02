import './report202-auth-source-support.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createLoginClientIpResolver } = require('../src/auth/login-client-ip.ts');
const { NodesController } = require('../src/nodes/nodes.controller.ts');
const { PermissionsGuard } = require('../src/auth/permissions.guard.ts');
const { Reflector } = require('@nestjs/core');
const resolve = createLoginClientIpResolver(['172.22.0.3/32','172.22.0.4/32','192.168.100.253/32','104.16.0.0/13','2606:4700::/32']);
const req = (peer,xff,cf='203.0.113.99') => ({socket:{remoteAddress:peer},headers:{'x-forwarded-for':xff,'cf-connecting-ip':cf}});
test('login origin walks trusted web/edge/Cloudflare chain, ignoring forged leftmost and CF headers',()=>{
 assert.equal(resolve(req('172.22.0.3','203.0.113.99, 198.51.100.8, 104.18.1.1, 192.168.100.253')),'198.51.100.8');
 assert.equal(resolve(req('::ffff:172.22.0.3','198.51.100.8, 2606:4700::1, 192.168.100.253')),'198.51.100.8');
 assert.equal(resolve(req('172.22.0.4','203.0.113.99, 192.168.100.220')),'192.168.100.220');
 assert.equal(resolve(req('192.168.100.220','203.0.113.99')),'192.168.100.220');
});
test('invalid, oversized and absent forwarded chains cannot select claimed client; trust-all is rejected',()=>{
 for(const header of [undefined,'bad, 192.168.100.253','x'.repeat(4097),Array(34).fill('192.0.2.1').join(',')])
  assert.equal(resolve(req('172.22.0.3',header)),'172.22.0.3');
 for(const ranges of [['0.0.0.0/0'],['bad'],['::/0'],['192.0.2.1/33']]) assert.throws(()=>createLoginClientIpResolver(ranges));
});
test('backup reader can query backup routes but cannot read firewall routes; missing permission remains denied',async()=>{
 const guard = new PermissionsGuard(new Reflector(),{hasPermission:async(_role,key)=>key==='backups.view'});
 const context = method=>({getClass:()=>NodesController,getHandler:()=>NodesController.prototype[method],switchToHttp:()=>({getRequest:()=>({auth:{userId:'qa',role:'backup-reader'}})})});
 for(const method of ['getBackupFleet','getBackupFilters']) assert.equal(await guard.canActivate(context(method)),true);
 for(const method of ['listNodes','getFilters','getNodeById']) await assert.rejects(guard.canActivate(context(method)),e=>e.getStatus()===403);
 const denied=new PermissionsGuard(new Reflector(),{hasPermission:async()=>false});
 await assert.rejects(denied.canActivate(context('getBackupFleet')),e=>e.getStatus()===403);
 let actor;
 const controller=new NodesController({getFilters:async a=>{actor=a; return {generated_at:'now',clients:[{id:'allowed'}],sites:[],tags:['private'],groups:['private'],inactive_client_count:99};}},{});
 assert.deepEqual(await controller.getBackupFilters({auth:{userId:'qa',role:'backup-reader'}}),{generated_at:'now',clients:[{id:'allowed'}],sites:[]});
 assert.deepEqual(actor,{userId:'qa',role:'backup-reader'});
});
