import {createRequire} from 'node:module';
import {randomUUID,createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
const url=process.env.RECOVERY_QA_URL;
if(!url||new URL(url).hostname!=='recovery210-db'||new URL(url).pathname!=='/recovery210')throw Error('QA only');
Object.assign(process.env,{DATABASE_URL:url,AUTH_BOOTSTRAP_EMAIL:'qa@example.invalid',AUTH_BOOTSTRAP_PASSWORD:'Synthetic-only-password-2026!',NODE_SECRET_ENCRYPTION_KEY_BASE64:Buffer.alloc(32,1).toString('base64'),BACKUP_ENCRYPTION_KEY_BASE64:Buffer.alloc(32,2).toString('base64')});
const require=createRequire('/app/package.json');
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient({datasourceUrl:url});
const {NodeSecretCryptoService}=require('/app/dist/common/node-secret-crypto.service');
const {NodeRequestAuthService}=require('/app/dist/common/node-request-auth.service');
const {RecoveryIngestController}=require('/app/dist/operational-actions/recovery-ingest.controller');
const {NodeCommandsService}=require('/app/dist/node-commands/node-commands.service');
let client;
try{
 const [g]=await p.$queryRaw`SELECT current_database() AS db`;assert.equal(g.db,'recovery210');
 client=await p.client.create({data:{code:randomUUID(),name:'Recovery auth QA'}});
 const site=await p.site.create({data:{clientId:client.id,code:'qa',name:'qa'}});
 const node=await p.node.create({data:{siteId:site.id,nodeUid:randomUUID(),hostname:'auth.invalid',agentVersion:'0.5.30'}});
 const crypto=new NodeSecretCryptoService();
 await p.nodeCredential.create({data:{nodeId:node.id,secretHint:'qa',secretHash:'synthetic',secretEncrypted:crypto.encrypt('synthetic-qa-only')}});
 const ctrl=new RecoveryIngestController(new NodeRequestAuthService(p,crypto),p,new NodeCommandsService(p,null));
 const rawBody=Buffer.from(JSON.stringify({version:'0.5.30'})),ts=new Date().toISOString();
 const sig=createHmac('sha256','synthetic-qa-only').update(ts+'\n').update(rawBody).digest('hex');
 await assert.rejects(()=>ctrl.poll({version:'0.5.30'},{rawBody},node.nodeUid,ts,'0'.repeat(64)),/signature/);
 assert.equal((await p.node.findUnique({where:{id:node.id}})).recoverySeenAt,null);console.log('PASS invalid HMAC cannot advertise capability');
 assert.deepEqual(await ctrl.poll({version:'0.5.30'},{rawBody},node.nodeUid,ts,sig),{commands:[]});
 const stored=await p.node.findUnique({where:{id:node.id}});assert.equal(stored.recoveryVersion,'0.5.30');assert.ok(stored.recoverySeenAt);assert.equal(stored.lastSeenAt,null);console.log('PASS independent authenticated capability does not forge main heartbeat');
 await assert.rejects(()=>ctrl.poll({version:'0.5.30'},{rawBody},node.nodeUid,ts,sig),/replay/);console.log('PASS signed poll replay rejected');
}finally{if(client)await p.client.delete({where:{id:client.id}});await p.$disconnect();}
