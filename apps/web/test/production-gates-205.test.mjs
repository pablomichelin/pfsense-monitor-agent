import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoader, uiMocks, textOf, elements } from './source-harness.mjs';
test('login explains credentials, waiting and unavailable without echoing server messages',()=>{
 const {loginErrorCode,loginErrorMessage}=sourceLoader()('lib/login-error.ts');
 assert.equal(loginErrorCode(401),'1'); assert.equal(loginErrorCode(429),'limited'); assert.equal(loginErrorCode(503),'unavailable');
 assert.match(loginErrorMessage('limited'),/cinco minutos/); assert.match(loginErrorMessage('unavailable'),/temporariamente/);
 assert.equal(loginErrorMessage('arbitrary server secret'),null);
});
test('backup-only reader sees data and no forbidden firewall-detail link',()=>{
 const {BackupsFleetTable}=sourceLoader({...uiMocks})('components/backups/backups-fleet-table.tsx');
 const nodes=[{id:'qa',hostname:'QA',client:{name:'QA'},site:{name:'QA'},backup_status:'never',latest_backup_received_at:null}];
 const restricted=BackupsFleetTable({nodes,canViewFirewall:false});
 assert.match(textOf(restricted),/Detalhe requer/); assert.equal(elements(restricted).some(e=>e.props.href?.startsWith('/nodes/')),false);
 const allowed=BackupsFleetTable({nodes,canViewFirewall:true});
 assert.ok(elements(allowed).some(e=>e.props.href?.startsWith('/nodes/')));
});
