// Run inside the final API image, attached ONLY to disposable release205 QA.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require=createRequire('/app/package.json');
const {PrismaClient}=require('@prisma/client');
const {hashPassword}=require('/app/dist/auth/password-hash.js');
const url=new URL(process.env.RELEASE205_QA_URL ?? '');
assert.equal(url.hostname,'db'); assert.equal(url.pathname,'/monitor_qa'); assert.equal(url.username,'qa');
assert.equal(process.env.DATABASE_URL,url.toString());
const db=new PrismaClient({datasourceUrl:url.toString()});
const base='http://127.0.0.1:8088/api/v1';
const users=[],clients=[],roles=[];
try {
 const [sentinel]=await db.$queryRaw`SELECT purpose FROM release205_qa_sentinel WHERE id=1`;
 assert.equal(sentinel.purpose,'pfs-release205-only');
 const [identity]=await db.$queryRaw`SELECT current_database() AS db, current_user AS usr`;
 assert.equal(identity.db,'monitor_qa'); assert.equal(identity.usr,'qa');
 const prefix='release205-'+randomUUID();
 for(let i=0;i<2;i++) {
  const c=await db.client.create({data:{name:`${prefix}-${i}`,code:`${prefix}-${i}`}});clients.push(c.id);
  const s=await db.site.create({data:{clientId:c.id,name:'QA',code:'QA'}});
  await db.node.create({data:{siteId:s.id,nodeUid:randomUUID(),hostname:`qa-${i}`}});
 }
 async function user(label,permissions,roleOverride) {
  const role=roleOverride ?? prefix+'-'+label;
  if(!roleOverride){await db.role.create({data:{code:role,label:'Release205 QA'}}); roles.push(role);
   for(const permissionId of permissions) await db.rolePermission.create({data:{role,permissionId}});}
  const password=randomUUID()+'-Qa!';
  const u=await db.user.create({data:{email:`${label}-${prefix}@example.invalid`,passwordHash:hashPassword(password),role,displayName:'Release205 QA'}});users.push(u.id);
  await db.userClientScope.create({data:{userId:u.id,clientId:clients[0]}});
  const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'198.51.100.8, 104.18.1.1, 192.168.100.253','CF-Connecting-IP':'203.0.113.99'},body:JSON.stringify({email:u.email,password})});
  assert.equal(response.status,201,'real password login');
  const cookies=response.headers.getSetCookie().map(x=>x.split(';')[0]);
  const csrf=decodeURIComponent(cookies.find(x=>x.startsWith('monitor_pfsense_csrf=')).split('=').slice(1).join('='));
  const auth={cookie:cookies.join('; '),'X-CSRF-Token':csrf};
  const session=await db.userSession.findFirst({where:{userId:u.id}});
  assert.equal(session.ipAddress,'198.51.100.8','real HTTP origin resolver, not spoofed CF header');
  return {u,auth};
 }
 const csrfOnly=process.env.RELEASE205_QA_CASE==='csrf';
 if(!csrfOnly) {
 const reader=await user('reader',['backups.view','clients.view']);
 for(const path of ['/nodes/backup-fleet','/nodes/backup-filters','/admin/clients']) {
  const r=await fetch(base+path,{headers:reader.auth});assert.equal(r.status,200,path);
  const data=await r.json();
  if(path.endsWith('backup-fleet')){assert.equal(data.total,1);assert.equal(data.items[0].client.id,clients[0]);}
  else if(path.endsWith('backup-filters')){assert.equal(data.clients.length,1);assert.equal(data.clients[0].id,clients[0]);assert.equal(data.tags,undefined);}
  else{assert.equal(data.total,1);assert.equal(data.items[0].id,clients[0]);}
 }
 for(const path of ['/nodes','/nodes/filters'])assert.equal((await fetch(base+path,{headers:reader.auth})).status,403,path);
 assert.equal((await fetch(base+'/nodes/backup-fleet?client_id='+clients[1],{headers:reader.auth})).status,403,'cross-client blocked');
 const denied=await user('denied',[]);
 assert.equal((await fetch(base+'/nodes/backup-fleet',{headers:denied.auth})).status,403);
 console.log('PASS release205 HTTP login/origin, backup-only RBAC and client isolation');
 }
 const admin=await user('admin',[],'superadmin');
 if(!csrfOnly) {
 let r=await fetch(base+'/admin/clients/'+clients[0],{method:'POST',headers:{...admin.auth,'Content-Type':'application/json'},body:JSON.stringify({name:'Release205 updated'})});
 assert.equal(r.status,201,'real authenticated write');
 assert.equal((await db.client.findUnique({where:{id:clients[0]}})).name,'Release205 updated');
 console.log('PASS release205 authenticated admin write');
 } else await db.client.update({where:{id:clients[0]},data:{name:'Release205 updated'}});
 const rejected=await fetch(base+'/admin/clients/'+clients[0],{method:'POST',headers:{cookie:admin.auth.cookie,'Content-Type':'application/json'},body:JSON.stringify({name:'Must not write'})});
 assert.equal(rejected.status,401,'CSRF required');
 assert.equal((await db.client.findUnique({where:{id:clients[0]}})).name,'Release205 updated');
 console.log('PASS release205 CSRF denial with unchanged record');
} finally {
 // Entire database is disposable; still remove our own fixtures, no foreign data.
 await db.auditLog.deleteMany({where:{OR:[{actorId:{in:users}},{clientId:{in:clients}}]}});
 await db.user.deleteMany({where:{id:{in:users}}});
 await db.node.deleteMany({where:{site:{clientId:{in:clients}}}});
 await db.site.deleteMany({where:{clientId:{in:clients}}});
 await db.client.deleteMany({where:{id:{in:clients}}});
 await db.role.deleteMany({where:{code:{in:roles}}});
 await db.$disconnect();
}
