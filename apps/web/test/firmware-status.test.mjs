import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const src=readFileSync(new URL('../components/node-pfsense-upgrade-section.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('x.tsx',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=new Set(['hasAlternativeFirmware','getUpdateLabel','looksLikeBehindCeTrack']);
const code=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const label=new Function(js+';return getUpdateLabel;')();
const base={agent_version_supported:true,update_checked_at:'2026-11-02',pfsense_version:'2.8.1'};
for(const [name,fields,expected]of [
 ['checking',{update_details:{status:'checking'}},'Consultando repositórios…'],
 ['waiting',{update_details:{status:'waiting'},update_check_error:'lock'},'Aguardando outra operação terminar'],
 ['channel',{update_details:{status:'channel_required'},target_version:'2.9.0',update_check_error:null},'Nova versão em outro canal: 2.9.0'],
 ['error',{update_details:{status:'error'},update_check_error:'HTTP400'},'Falha ao verificar atualização'],
 ['current',{update_details:{status:'current'},update_available:false},'Sem atualização no canal selecionado'],
 ['available',{update_details:{status:'available'},update_available:true,target_version:'2.9.0'},'Atualização disponível: 2.9.0'],
 ['legacy channel',{update_error_class:'branch',update_available:null,target_version:'2.9.0'},'Nova versão em outro canal: 2.9.0'],
 ['legacy unknown',{update_checked_at:null},'Versão não verificada'],
])test(name,()=>assert.equal(label({...base,...fields}),expected));
